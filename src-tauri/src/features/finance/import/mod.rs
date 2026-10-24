//! Importing statements from banks and credit cards.
//!
//! - **CSV**: every bank lays it out differently, so the columns are guessed
//!   from the header (and can be corrected), then remembered per bank.
//! - **OFX / QFX** and **QIF**: structured exports many banks offer.
//!
//! Each statement is previewed before anything is saved: every row with its
//! suggested category, and duplicates flagged: ones imported before, and
//! ones that look like a transaction already entered by hand.

pub mod csv;
pub mod dates;
pub mod ofx;
pub mod qif;

use std::collections::{HashMap, HashSet};

use chrono::NaiveDate;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::entities::{account, transaction};
use super::{money, service};
use crate::error::{Error, Result};

/// A transaction read from a statement.
#[derive(Clone, Debug, PartialEq)]
pub struct Parsed {
    pub day: NaiveDate,
    pub amount: i64,
    pub payee: String,
    pub notes: String,
    /// The bank's own id for it (OFX), when there is one.
    pub bank_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    /// "csv", "ofx" or "qif".
    pub format: String,
    /// The statement's currency, when it says.
    pub currency: Option<String>,
    /// CSV only: the columns, a few rows as read, and how they're used.
    pub columns: Vec<String>,
    pub samples: Vec<Vec<String>>,
    pub mapping: Option<csv::Mapping>,
    /// The saved layout used, if this bank's been imported before.
    pub profile: Option<String>,
    pub rows: Vec<PreviewRow>,
    /// Rows that couldn't be read (no date or amount).
    pub skipped: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    pub import_ref: String,
    pub day: NaiveDate,
    pub amount: i64,
    pub payee: String,
    pub notes: String,
    pub category_id: Option<String>,
    /// "imported": in a statement imported before. "entered": looks like one
    /// already entered by hand (`matches`), which it'll be linked to.
    pub duplicate: Option<String>,
    pub matches: Option<String>,
}

/// A row to save, as chosen in the preview.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRow {
    pub import_ref: String,
    pub day: NaiveDate,
    pub amount: i64,
    pub payee: String,
    #[serde(default)]
    pub notes: String,
    pub category_id: Option<String>,
    /// Link to this transaction instead of adding a new one.
    pub matches: Option<String>,
}

/// Bytes as text: UTF-8 (without a byte-order mark), or Windows-1252 as older
/// bank exports use.
pub fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => bytes.iter().map(|b| *b as char).collect(),
    }
}

fn format_of(file_name: &str, text: &str) -> &'static str {
    let lower = file_name.to_lowercase();
    let head = text.trim_start();
    if lower.ends_with(".ofx") || lower.ends_with(".qfx") || head.starts_with("OFXHEADER") || head.contains("<OFX>") {
        "ofx"
    } else if lower.ends_with(".qif") || head.starts_with("!Type:") || head.starts_with("!Account") {
        "qif"
    } else {
        "csv"
    }
}

/// Reads a statement and checks it against the account. `mapping` overrides
/// the guessed (or remembered) CSV layout.
pub async fn preview(db: &DatabaseConnection, account_id: &str, file_name: &str, bytes: &[u8], mapping: Option<csv::Mapping>) -> Result<Preview> {
    if file_name.to_lowercase().ends_with(".pdf") || bytes.starts_with(b"%PDF") {
        return Err(Error::Invalid(
            "PDF statements can't be read yet. In your online banking, download the statement as CSV, OFX or QIF instead (often under \u{201c}Export\u{201d} or \u{201c}Download transactions\u{201d}).".into(),
        ));
    }
    let a = account::Entity::find_by_id(account_id).one(db).await?.ok_or(Error::NotFound("Account"))?;
    let home = service::home(db).await?;
    let exponent = money::exponent(&a.currency);
    let text = decode(bytes);
    let month_first = home == "USD" || a.currency == "USD";

    let mut out = Preview { format: format_of(file_name, &text).into(), currency: None, columns: vec![], samples: vec![], mapping: None, profile: None, rows: vec![], skipped: 0 };
    let parsed = match out.format.as_str() {
        "ofx" => {
            let statement = ofx::read(&text, exponent);
            out.currency = statement.currency;
            statement.transactions
        }
        "qif" => {
            let (rows, skipped) = qif::read(&text, exponent, month_first);
            out.skipped = skipped;
            rows
        }
        _ => {
            let table = csv::read(&text);
            let header_guess = csv::guess(&table, month_first, a.kind == "credit");
            // A layout used before for this bank wins over a guess.
            let saved = match &header_guess {
                Some(g) => csv::saved(db, &csv::signature(&table, g.header_row)).await?,
                None => None,
            };
            let chosen = match (mapping, saved) {
                (Some(m), _) => Some(m),
                (None, Some((p, m))) => {
                    out.profile = Some(p.name.clone());
                    Some(m)
                }
                (None, None) => header_guess,
            };
            let Some(chosen) = chosen else {
                return Err(Error::Invalid("Couldn't find dates and amounts in that file. Is it a bank statement exported as CSV?".into()));
            };
            out.columns = table.get(chosen.header_row).cloned().unwrap_or_default();
            out.samples = table.iter().skip(chosen.header_row + 1).take(5).cloned().collect();
            let (rows, skipped) = csv::apply(&table, &chosen, exponent);
            out.skipped = skipped;
            out.mapping = Some(chosen);
            rows
        }
    };
    if let Some(c) = out.currency.as_ref().filter(|c| **c != a.currency) {
        return Err(Error::Invalid(format!("That statement is in {c}, but {} is in {}. Pick the {c} account, or add one.", a.name, a.currency)));
    }
    out.rows = check(db, &a, parsed).await?;
    Ok(out)
}

/// The id a statement row is known by, the same each time it's imported.
fn import_ref(row: &Parsed, seen: &mut HashMap<String, u32>) -> String {
    if let Some(id) = &row.bank_id {
        return format!("bank:{id}");
    }
    // Identical rows in one statement (two coffees) are told apart by order.
    let base = format!("{}|{}|{}", row.day, row.amount, row.payee.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" "));
    let n = seen.entry(base.clone()).or_default();
    *n += 1;
    let digest = Sha256::digest(format!("{base}|{n}").as_bytes());
    format!("row:{}", digest.iter().take(12).map(|b| format!("{b:02x}")).collect::<String>())
}

/// Flags duplicates and suggests categories.
async fn check(db: &DatabaseConnection, a: &account::Model, parsed: Vec<Parsed>) -> Result<Vec<PreviewRow>> {
    let existing = transaction::Entity::find().filter(transaction::Column::AccountId.eq(a.id.as_str())).all(db).await?;
    // Imported before, even if deleted since (deleting one means "not this").
    let known: HashSet<&str> = existing.iter().filter_map(|t| t.import_ref.as_deref()).collect();
    let mut claimed: HashSet<String> = HashSet::new();
    let mut seen = HashMap::new();
    let mut rows = Vec::with_capacity(parsed.len());
    for p in parsed {
        let reference = import_ref(&p, &mut seen);
        let (duplicate, matches) = if known.contains(reference.as_str()) {
            (Some("imported".to_owned()), None)
        } else {
            // Entered by hand: same amount within three days, not imported itself.
            let hand = existing.iter().find(|t| {
                t.deleted_at.is_none()
                    && t.import_ref.is_none()
                    && t.amount == p.amount
                    && (t.day - p.day).num_days().abs() <= 3
                    && !claimed.contains(&t.id)
            });
            match hand {
                Some(t) => {
                    claimed.insert(t.id.clone());
                    (Some("entered".to_owned()), Some(t.id.clone()))
                }
                None => (None, None),
            }
        };
        let category_id = service::suggest(db, &p.payee).await?;
        rows.push(PreviewRow { import_ref: reference, day: p.day, amount: p.amount, payee: p.payee, notes: p.notes, category_id, duplicate, matches });
    }
    rows.sort_by_key(|r| std::cmp::Reverse(r.day));
    Ok(rows)
}

/// Saves the chosen rows, and remembers a CSV layout for next time.
pub async fn commit(db: &DatabaseConnection, account_id: &str, rows: Vec<CommitRow>, layout: Option<(String, csv::Mapping, String)>) -> Result<(u32, u32)> {
    if let Some((signature, mapping, name)) = layout {
        csv::remember(db, &signature, &name, &mapping).await?;
    }
    service::add_imported(db, account_id, rows).await
}
