//! CSV statements. The columns are guessed from the header, the date layout
//! from the dates, the decimal separator from the amounts; then the layout is
//! remembered for that bank (by its header), so the next import just works.

use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::dates;
use super::Parsed;
use crate::error::Result;
use crate::features::finance::entities::profile;
use crate::features::finance::money;

/// How a bank's CSV is laid out (column numbers from 0).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mapping {
    /// The row with the column names (some banks put a few lines above it).
    pub header_row: usize,
    pub date: usize,
    /// A chrono layout from `dates::LAYOUTS`.
    pub date_format: String,
    /// Joined to make the payee (description, then reference…).
    pub description: Vec<usize>,
    /// One signed amount column…
    pub amount: Option<usize>,
    /// …or separate money out and money in columns.
    pub debit: Option<usize>,
    pub credit: Option<usize>,
    pub decimal_comma: bool,
    /// Flip the sign: credit card statements often list purchases as positive.
    pub invert: bool,
    /// The bank's header signature (see `signature`), once saved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

/// The file as rows of cells. The delimiter (comma, semicolon, tab or bar)
/// is the one that splits the lines most evenly.
pub fn read(text: &str) -> Vec<Vec<String>> {
    let delimiter = [',', ';', '\t', '|']
        .into_iter()
        .max_by_key(|d| {
            let counts: Vec<usize> = text.lines().take(20).map(|l| split(l, *d).len()).filter(|n| *n > 1).collect();
            // Most lines split the same way, into the most columns.
            let common = counts.iter().filter(|n| Some(*n) == counts.iter().max()).count();
            common * 100 + counts.iter().max().copied().unwrap_or(0)
        })
        .unwrap_or(',');
    let mut rows = Vec::new();
    let mut pending = String::new();
    for line in text.lines() {
        // A quoted cell can run over lines.
        if !pending.is_empty() {
            pending.push('\n');
        }
        pending.push_str(line);
        if pending.matches('"').count() % 2 == 1 {
            continue;
        }
        let cells = split(&pending, delimiter);
        pending.clear();
        if cells.iter().any(|c| !c.trim().is_empty()) {
            rows.push(cells);
        }
    }
    rows
}

fn split(line: &str, delimiter: char) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            c if c == delimiter && !quoted => cells.push(std::mem::take(&mut cell).trim().to_owned()),
            c => cell.push(c),
        }
    }
    cells.push(cell.trim().to_owned());
    cells
}

fn column(header: &[String], names: &[&str]) -> Option<usize> {
    let normal: Vec<String> = header.iter().map(|h| h.to_lowercase().replace(['_', '.'], " ").trim().to_owned()).collect();
    // Exact names first, then ones that start with them ("amount (gbp)").
    names
        .iter()
        .find_map(|n| normal.iter().position(|h| h == n))
        .or_else(|| names.iter().find_map(|n| normal.iter().position(|h| h.starts_with(n))))
}

/// The layout, guessed from the header and the values under it. `credit_card`
/// suggests flipping the sign when purchases look positive.
pub fn guess(rows: &[Vec<String>], month_first: bool, credit_card: bool) -> Option<Mapping> {
    // The header: the first of the opening rows naming a date column and an amount.
    let header_row = rows.iter().take(15).position(|r| {
        column(r, &["date", "transaction date", "posting date", "booking date", "value date", "completed date", "started date", "posted"]).is_some()
            && column(r, &["amount", "value", "debit", "credit", "paid out", "paid in", "money out", "money in", "withdrawal", "deposit", "spent", "received"]).is_some()
    })?;
    let header = &rows[header_row];
    let date = column(header, &["transaction date", "date", "posting date", "booking date", "completed date", "started date", "value date", "posted"])?;
    let amount = column(header, &["amount", "transaction amount", "value", "amount (gbp)", "billing amount"]);
    let debit = column(header, &["paid out", "money out", "debit", "debit amount", "withdrawal", "withdrawals", "out", "spent"]);
    let credit = column(header, &["paid in", "money in", "credit", "credit amount", "deposit", "deposits", "in", "received"]);
    if amount.is_none() && debit.is_none() && credit.is_none() {
        return None;
    }
    // A tidy name (Monzo's "Name", Starling's "Counter Party") beats the raw description.
    let mut description: Vec<usize> = ["payee", "merchant", "name", "counter party", "description", "transaction description", "details", "narrative", "memo", "reference", "transaction details"]
        .iter()
        .filter_map(|n| column(header, &[n]))
        .collect();
    description.dedup();
    description.truncate(2);
    if description.is_empty() {
        // Whatever's left that holds text.
        description = (0..header.len()).filter(|i| ![Some(date), amount, debit, credit].contains(&Some(*i))).take(1).collect();
    }

    let data: Vec<&Vec<String>> = rows.iter().skip(header_row + 1).collect();
    let dates: Vec<&str> = data.iter().filter_map(|r| r.get(date)).map(String::as_str).filter(|s| !s.trim().is_empty()).collect();
    let date_format = dates::detect(&dates, month_first)?.to_owned();
    let amounts: Vec<&str> = data.iter().flat_map(|r| [amount, debit, credit].into_iter().flatten().filter_map(|c| r.get(c))).map(String::as_str).collect();
    // "12,50" (and never "1,234.56") means the comma is the decimal point.
    let decimal_comma = amounts.iter().any(|a| a.rsplit_once(',').is_some_and(|(_, f)| f.len() == 2 && !a.contains('.')))
        && !amounts.iter().any(|a| a.contains('.') && a.rfind('.') > a.rfind(','));
    // Purchases shown as positive on a credit card: most amounts positive.
    let invert = credit_card && amount.is_some() && {
        let values: Vec<i64> = amounts.iter().filter_map(|a| money::parse_amount(a, 2, decimal_comma)).collect();
        values.iter().filter(|v| **v > 0).count() * 2 > values.len()
    };
    Some(Mapping { header_row, date, date_format, description, amount, debit, credit, decimal_comma, invert, signature: None })
}

/// Reads the transactions with a layout. Returns them and how many rows were
/// skipped (no readable date or amount: totals, blank lines, footers).
pub fn apply(rows: &[Vec<String>], m: &Mapping, exponent: u32) -> (Vec<Parsed>, u32) {
    let mut out = Vec::new();
    let mut skipped = 0;
    fn cell(r: &[String], i: Option<usize>) -> &str {
        i.and_then(|i| r.get(i)).map(String::as_str).unwrap_or("")
    }
    for r in rows.iter().skip(m.header_row + 1) {
        let Some(day) = r.get(m.date).and_then(|d| dates::parse(d, &m.date_format)) else {
            skipped += 1;
            continue;
        };
        let amount = match m.amount {
            Some(_) => money::parse_amount(cell(r, m.amount), exponent, m.decimal_comma),
            None => {
                let out_value = money::parse_amount(cell(r, m.debit), exponent, m.decimal_comma).map(|v| -v.abs());
                let in_value = money::parse_amount(cell(r, m.credit), exponent, m.decimal_comma).map(i64::abs);
                match (out_value, in_value) {
                    (Some(o), Some(i)) => Some(o + i),
                    (o, i) => o.or(i),
                }
            }
        };
        let Some(amount) = amount.filter(|a| *a != 0) else {
            skipped += 1;
            continue;
        };
        let parts: Vec<&str> = m.description.iter().filter_map(|i| r.get(*i)).map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        let payee = parts.first().copied().unwrap_or("").to_owned();
        let notes = parts.get(1).copied().filter(|n| *n != payee).unwrap_or("").to_owned();
        out.push(Parsed { day, amount: if m.invert { -amount } else { amount }, payee, notes, bank_id: None });
    }
    (out, skipped)
}

/// Identifies a bank's layout by its header, to find the saved layout again.
pub fn signature(rows: &[Vec<String>], header_row: usize) -> String {
    let header = rows.get(header_row).map(|h| h.iter().map(|c| c.trim().to_lowercase()).collect::<Vec<_>>().join("|")).unwrap_or_default();
    let digest = Sha256::digest(header.as_bytes());
    format!("csv:{}", digest.iter().take(10).map(|b| format!("{b:02x}")).collect::<String>())
}

/// The saved layout for a bank's header signature, if there is one.
pub async fn saved(db: &DatabaseConnection, signature: &str) -> Result<Option<(profile::Model, Mapping)>> {
    // Few enough to read them all; the signature's inside the (encrypted)
    // mapping, not the id, which the server can read.
    Ok(profile::Entity::find()
        .filter(profile::Column::DeletedAt.is_null())
        .all(db)
        .await?
        .into_iter()
        .find_map(|p| serde_json::from_str::<Mapping>(&p.mapping).ok().filter(|m| m.signature.as_deref() == Some(signature)).map(|m| (p, m))))
}

/// Saves (or updates) a bank's layout.
pub async fn remember(db: &DatabaseConnection, signature: &str, name: &str, mapping: &Mapping) -> Result<()> {
    let json = serde_json::to_string(&Mapping { signature: Some(signature.into()), ..mapping.clone() }).expect("serialises");
    let now = Utc::now();
    match saved(db, signature).await?.map(|(p, _)| p) {
        Some(found) => {
            let mut active: profile::ActiveModel = found.into();
            active.name = Set(name.into());
            active.mapping = Set(json);
            active.deleted_at = Set(None);
            active.update(db).await?;
        }
        None => {
            profile::ActiveModel { id: Set(crate::db::new_id()), name: Set(name.into()), mapping: Set(json), created_at: Set(now), updated_at: Set(now), deleted_at: Set(None) }
                .insert(db)
                .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn day(m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, m, d).unwrap()
    }

    #[test]
    fn a_monzo_style_statement() {
        let text = "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In\n\
                    tx_1,23/10/2026,08:12:00,Card payment,Pret A Manger,☕,Eating out,-3.45,GBP,-3.45,GBP,,,,PRET A MANGER LONDON,,-3.45,\n\
                    tx_2,24/10/2026,09:00:00,Faster payment,ACME Ltd,,Income,2400.00,GBP,2400.00,GBP,,,,SALARY OCT,,,2400.00\n";
        let rows = read(text);
        let m = guess(&rows, false, false).unwrap();
        assert_eq!((m.date, m.date_format.as_str(), m.amount), (1, "%d/%m/%Y", Some(7)));
        let (parsed, skipped) = apply(&rows, &m, 2);
        assert_eq!(skipped, 0);
        assert_eq!(parsed[0], Parsed { day: day(10, 23), amount: -345, payee: "Pret A Manger".into(), notes: "PRET A MANGER LONDON".into(), bank_id: None });
        assert_eq!(parsed[1].amount, 240000);
    }

    #[test]
    fn money_in_and_out_columns_a_preamble_and_quotes() {
        let text = "Account Name:,Current Account\nAccount Number:,12345678\n\n\
                    Date;Description;Paid out;Paid in;Balance\n\
                    03/04/2026;\"TESCO STORES; 4521\";12,50;;1.000,00\n\
                    05/04/2026;SALARY;;2.400,00;3.387,50\n\
                    ;Closing balance;;;3.387,50\n";
        let rows = read(text);
        let m = guess(&rows, false, false).unwrap();
        assert_eq!((m.header_row, m.debit, m.credit, m.decimal_comma), (2, Some(2), Some(3), true));
        let (parsed, skipped) = apply(&rows, &m, 2);
        assert_eq!(skipped, 1, "the closing balance line");
        assert_eq!((parsed[0].payee.as_str(), parsed[0].amount), ("TESCO STORES; 4521", -1250));
        assert_eq!(parsed[1].amount, 240000);
    }

    #[test]
    fn credit_card_purchases_shown_positive_are_flipped() {
        let text = "Date,Description,Amount\n2026-10-01,AMAZON,25.00\n2026-10-02,PAYMENT THANK YOU,-200.00\n2026-10-03,UBER,12.30\n";
        let rows = read(text);
        let m = guess(&rows, false, true).unwrap();
        assert!(m.invert);
        let (parsed, _) = apply(&rows, &m, 2);
        assert_eq!(parsed.iter().map(|p| p.amount).collect::<Vec<_>>(), [-2500, 20000, -1230]);
        assert!(!guess(&rows, false, false).unwrap().invert, "a current account isn't flipped");
    }

    #[test]
    fn the_same_header_gives_the_same_signature() {
        let a = read("Date,Description,Amount\n2026-10-01,X,1\n");
        let b = read("date , description, amount\n2026-11-01,Y,2\n");
        assert_eq!(signature(&a, 0), signature(&b, 0));
    }
}
