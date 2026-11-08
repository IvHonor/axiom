//! A week or month of money for the Analytics view: in, out, what was kept,
//! and where it went against the budgets. Amounts are in the home currency's
//! minor units, read the same way as the month summary: transfers between
//! accounts don't count, and money into an expense category is a refund.

use std::collections::HashMap;

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{category, transaction};
use super::service::{categories, home, transactions};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period, Unit};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceAnalytics {
    pub home_currency: String,
    /// Income less spending.
    pub headline: Headline,
    pub income: Compare,
    pub spending: Compare,
    /// Of what came in, the share kept, 0 to 100.
    pub savings_rate: Compare,
    pub days: Vec<MoneyDay>,
    /// Spending on each day of the period before, for a running total to
    /// set this one against.
    pub previous_spending: Vec<i64>,
    /// Every monthly budget added up; months only.
    pub budgeted: Option<i64>,
    /// Spending by category, most first.
    pub categories: Vec<CategoryOut>,
    /// Transactions in the period still waiting for an exchange rate.
    pub unconverted: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyDay {
    pub day: Date,
    pub income: i64,
    pub spending: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryOut {
    /// None for uncategorised spending.
    pub id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub spent: i64,
    /// Its monthly budget; months only.
    pub budget: Option<i64>,
}

/// One transaction as money in or out.
struct Flow {
    day: Date,
    category: Option<String>,
    income: i64,
    spending: i64,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<FinanceAnalytics> {
    let home_currency = home(db).await?;
    let cats: Vec<category::Model> = categories().all(db).await?;
    let kinds: HashMap<&str, &str> = cats.iter().map(|c| (c.id.as_str(), c.kind.as_str())).collect();
    let rows: Vec<transaction::Model> = transactions()
        .filter(transaction::Column::Day.gte(period.trend_start()))
        .filter(transaction::Column::Day.lt(period.end))
        .filter(transaction::Column::TransferId.is_null())
        .all(db)
        .await?;
    let unconverted = rows.iter().filter(|t| period.contains(t.day) && t.home_amount.is_none()).count();
    let flows: Vec<Flow> = rows
        .iter()
        .filter_map(|t| {
            let value = t.home_amount?;
            let is_income = match t.category_id.as_deref().and_then(|c| kinds.get(c)) {
                Some(kind) => *kind == "income",
                None => value > 0,
            };
            let (income, spending) = if is_income { (value, 0) } else { (0, -value) };
            Some(Flow { day: t.day, category: t.category_id.clone(), income, spending })
        })
        .collect();
    let within = |from: Date, to: Date| flows.iter().filter(move |f| f.day >= from && f.day < to);
    let income = |from, to| within(from, to).map(|f| f.income).sum::<i64>();
    let spending = |from, to| within(from, to).map(|f| f.spending).sum::<i64>();

    let month = period.unit == Unit::Month;
    let mut spent: HashMap<Option<&str>, i64> = HashMap::new();
    // Up to today, like the totals: a transaction dated ahead hasn't happened yet.
    for f in within(period.start, period.counted_end()).filter(|f| f.income == 0) {
        *spent.entry(f.category.as_deref()).or_default() += f.spending;
    }
    let expense = || cats.iter().filter(|c| c.kind == "expense");
    if month {
        // Every budgeted category shows, spent on or not.
        for c in expense().filter(|c| c.budget.is_some()) {
            spent.entry(Some(c.id.as_str())).or_default();
        }
    }
    let mut by_category: Vec<CategoryOut> = spent
        .into_iter()
        .map(|(id, total)| {
            let cat = id.and_then(|id| cats.iter().find(|c| c.id == id));
            CategoryOut {
                id: id.map(String::from),
                name: cat.map_or_else(|| "Uncategorised".into(), |c| c.name.clone()),
                icon: cat.map_or_else(String::new, |c| c.icon.clone()),
                color: cat.map_or_else(|| "slate".into(), |c| c.color.clone()),
                spent: total,
                budget: if month { cat.and_then(|c| c.budget) } else { None },
            }
        })
        .collect();
    by_category.sort_by(|a, b| b.spent.cmp(&a.spent).then_with(|| a.name.cmp(&b.name)));
    let budgets: Vec<i64> = expense().filter_map(|c| c.budget).collect();

    Ok(FinanceAnalytics {
        home_currency,
        headline: period.headline(|from, to| Some((income(from, to) - spending(from, to)) as f64)),
        income: period.compare(|from, to| Some(income(from, to) as f64)),
        spending: period.compare(|from, to| Some(spending(from, to) as f64)),
        savings_rate: period.compare(|from, to| {
            let came_in = income(from, to);
            (came_in > 0).then(|| (came_in - spending(from, to)) as f64 * 100.0 / came_in as f64)
        }),
        days: period.daily(|d| MoneyDay { day: d, income: income(d, d.succ_opt().unwrap_or(d)), spending: spending(d, d.succ_opt().unwrap_or(d)) }),
        previous_spending: period.previous().daily(|d| spending(d, d.succ_opt().unwrap_or(d))),
        budgeted: (month && !budgets.is_empty()).then(|| budgets.iter().sum()),
        categories: by_category,
        unconverted,
    })
}
