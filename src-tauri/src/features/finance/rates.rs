//! Exchange rates, from Frankfurter (frankfurter.dev: central bank reference
//! rates, free, no key), cached on this computer. A transaction in another
//! currency is converted to the home currency at its day's rate, kept with
//! it so totals never shift when rates do.

use std::collections::HashMap;
use std::time::Duration;

use chrono::{Days, NaiveDate};
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::Deserialize;

use super::entities::{account, rate, settings, transaction};
use super::money;
use crate::error::{Error, Result};

/// A rate this many days old still converts (weekends, a slow update).
const STALE_DAYS: u64 = 10;
const API: &str = "https://api.frankfurter.dev/v2/rates";

/// Kept in Tauri's managed state.
pub struct Rates {
    http: reqwest::Client,
    api: String,
}

#[derive(Deserialize)]
struct Row {
    date: NaiveDate,
    base: String,
    quote: String,
    rate: f64,
}

impl Rates {
    pub fn new(api: Option<&str>) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().expect("valid HTTP client");
        Self { http, api: api.unwrap_or(API).to_owned() }
    }

    /// Daily rates for 1 `base` in each of `quotes`, from `from` to `to`,
    /// saved to the cache. Returns how many were saved.
    pub async fn fetch(&self, db: &DatabaseConnection, base: &str, quotes: &[&str], from: NaiveDate, to: NaiveDate) -> Result<usize> {
        let query = [("base", base.to_owned()), ("quotes", quotes.join(",")), ("from", from.to_string()), ("to", to.to_string())];
        let response = self.http.get(&self.api).query(&query).send().await.map_err(|_| Error::Unavailable("Couldn't get exchange rates. Check your connection.".into()))?;
        if !response.status().is_success() {
            return Err(Error::Unavailable(format!("The exchange rate service said no ({}).", response.status())));
        }
        let rows: Vec<Row> = response.json().await.map_err(|_| Error::Unavailable("The exchange rate service sent something unexpected.".into()))?;
        for row in &rows {
            rate::Entity::insert(rate::ActiveModel { day: Set(row.date), base: Set(row.base.clone()), quote: Set(row.quote.clone()), rate: Set(row.rate) })
                .on_conflict(OnConflict::columns([rate::Column::Day, rate::Column::Base, rate::Column::Quote]).update_column(rate::Column::Rate).to_owned())
                .exec(db)
                .await?;
        }
        Ok(rows.len())
    }
}

/// 1 `from` in `to` on `day` (or the nearest day before it), from the cache.
pub async fn lookup(db: &DatabaseConnection, from: &str, to: &str, day: NaiveDate) -> Result<Option<f64>> {
    if from == to {
        return Ok(Some(1.0));
    }
    let since = day - Days::new(STALE_DAYS);
    let direct = rate::Entity::find()
        .filter(rate::Column::Base.eq(from))
        .filter(rate::Column::Quote.eq(to))
        .filter(rate::Column::Day.lte(day))
        .filter(rate::Column::Day.gte(since))
        .order_by_desc(rate::Column::Day)
        .one(db)
        .await?;
    if let Some(r) = direct {
        return Ok(Some(r.rate));
    }
    let inverse = rate::Entity::find()
        .filter(rate::Column::Base.eq(to))
        .filter(rate::Column::Quote.eq(from))
        .filter(rate::Column::Day.lte(day))
        .filter(rate::Column::Day.gte(since))
        .order_by_desc(rate::Column::Day)
        .one(db)
        .await?;
    Ok(inverse.filter(|r| r.rate > 0.0).map(|r| 1.0 / r.rate))
}

/// An amount in the home currency, if the rate's known.
pub async fn to_home(db: &DatabaseConnection, amount: i64, currency: &str, home: &str, day: NaiveDate) -> Result<Option<i64>> {
    Ok(lookup(db, currency, home, day).await?.map(|r| money::convert(amount, currency, home, r)))
}

/// Converts what's waiting (transactions in other currencies without a home
/// amount), fetching the rates needed, and makes sure each account's currency
/// has a recent rate for balances. Returns how many transactions it converted.
pub async fn fill(db: &DatabaseConnection, rates: &Rates, today: NaiveDate) -> Result<usize> {
    let Some(home) = settings::Entity::find_by_id(super::service::SETTINGS_ID).one(db).await?.map(|s| s.home_currency) else { return Ok(0) };
    let accounts: HashMap<String, String> = account::Entity::find().all(db).await?.into_iter().map(|a| (a.id, a.currency)).collect();
    let waiting = transaction::Entity::find()
        .filter(transaction::Column::DeletedAt.is_null())
        .filter(transaction::Column::HomeAmount.is_null())
        .all(db)
        .await?;

    // The days needed, per currency.
    let mut spans: HashMap<String, (NaiveDate, NaiveDate)> = HashMap::new();
    for t in &waiting {
        let Some(currency) = accounts.get(&t.account_id) else { continue };
        if *currency != home {
            let span = spans.entry(currency.clone()).or_insert((t.day, t.day));
            span.0 = span.0.min(t.day);
            span.1 = span.1.max(t.day);
        }
    }
    // Balances use the latest rate: fetch one if there's nothing recent.
    for currency in accounts.values().filter(|c| **c != home) {
        if lookup(db, currency, &home, today).await?.is_none() {
            let span = spans.entry(currency.clone()).or_insert((today, today));
            span.1 = span.1.max(today);
        }
    }
    for (currency, (from, to)) in &spans {
        rates.fetch(db, currency, &[home.as_str()], *from - Days::new(STALE_DAYS), (*to).min(today)).await?;
    }

    let mut converted = 0;
    for t in waiting {
        let Some(currency) = accounts.get(&t.account_id) else { continue };
        if let Some(home_amount) = to_home(db, t.amount, currency, &home, t.day).await? {
            let mut active: transaction::ActiveModel = t.into();
            active.home_amount = Set(Some(home_amount));
            active.update(db).await?;
            converted += 1;
        }
    }
    Ok(converted)
}
