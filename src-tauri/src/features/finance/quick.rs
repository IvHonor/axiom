//! Quick entries: one line, typed the way you'd say it.
//!
//! - `12.50 coffee` (spending today), `+2400 salary` (income)
//! - `€30 dinner yesterday`, `45 EUR train 3 days ago`, `20 taxi friday`, `9.99 netflix 12 oct`
//! - `#eating out` picks a category, `@amex` an account (by the start of its name)
//!
//! An amount without a sign is spending, unless its category is an income one.

use chrono::{Datelike, Days, NaiveDate};

use super::entities::{account, category};
use super::money;
use super::types::QuickEntry;

const WEEKDAYS: [&str; 7] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/// Reads a quick entry. `month_first` reads 3/4 as March 4th (as in the US).
pub fn read(
    text: &str,
    today: NaiveDate,
    home: &str,
    accounts: &[account::Model],
    categories: &[category::Model],
    learned: Option<String>,
    month_first: bool,
) -> QuickEntry {
    let mut words: Vec<String> = text.split_whitespace().map(String::from).collect();
    let mut entry = QuickEntry { amount: None, currency: home.into(), day: today, payee: String::new(), category_id: None, account_id: None };
    let mut income = false;

    // The account: "@amex".
    if let Some(at) = words.iter().position(|w| w.starts_with('@') && w.len() > 1) {
        let wanted = words.remove(at)[1..].to_lowercase();
        if let Some(a) = accounts.iter().filter(|a| !a.archived).find(|a| a.name.to_lowercase().replace(' ', "").starts_with(&wanted)) {
            entry.account_id = Some(a.id.clone());
            entry.currency = a.currency.clone();
        }
    }

    // The category: "#groceries", "#eating out" (as many words as match).
    if let Some(at) = words.iter().position(|w| w.starts_with('#') && w.len() > 1) {
        let mut best: Option<(usize, &category::Model)> = None;
        for take in (1..=3).rev() {
            if at + take > words.len() {
                continue;
            }
            let wanted = words[at..at + take].join(" ")[1..].to_lowercase();
            if let Some(c) = categories.iter().filter(|c| !c.archived).find(|c| c.name.to_lowercase().starts_with(&wanted)) {
                best = Some((take, c));
                break;
            }
        }
        match best {
            Some((take, c)) => {
                words.drain(at..at + take);
                entry.category_id = Some(c.id.clone());
                income = c.kind == "income";
            }
            None => {
                words.remove(at);
            }
        }
    }

    // The amount: "12.50", "+2400", "-20", "£12", "€30", "30 EUR", "EUR 30".
    let mut amount_at = None;
    for (i, w) in words.iter().enumerate() {
        let lead = w.chars().next().unwrap_or_default();
        let body = w.trim_start_matches(['+', '-']);
        let symbol = body.chars().next().and_then(money::symbol_currency);
        let digits = body.trim_start_matches(|c: char| !c.is_ascii_digit() && c != '.' && c != ',');
        if digits.is_empty() || !digits.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            continue;
        }
        // "3 days ago" and "12 oct" are dates, not amounts.
        let next = words.get(i + 1).map(|n| n.to_lowercase());
        if next.as_deref().is_some_and(|n| n.starts_with("day") || n.starts_with("week") || MONTHS.iter().any(|m| n.starts_with(m))) && symbol.is_none() {
            continue;
        }
        let code = digits.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ',');
        if !code.is_empty() && !money::is_currency(&code.to_uppercase()) {
            continue;
        }
        let currency = if let Some(s) = symbol {
            s.to_owned()
        } else if money::is_currency(&code.to_uppercase()) {
            code.to_uppercase()
        } else {
            entry.currency.clone()
        };
        let number = &digits[..digits.len() - code.len()];
        if let Some(value) = money::parse_amount(number, money::exponent(&currency), false) {
            entry.amount = Some(value);
            entry.currency = currency;
            if lead == '+' {
                income = true;
            }
            amount_at = Some(i);
            break;
        }
    }
    if let Some(i) = amount_at {
        words.remove(i);
        // "30 EUR" or "EUR 30".
        for near in [i, i.wrapping_sub(1)] {
            if let Some(w) = words.get(near).filter(|w| w.len() == 3 && money::is_currency(&w.to_uppercase())) {
                entry.currency = w.to_uppercase();
                words.remove(near);
                break;
            }
        }
    }

    // The day.
    let lower: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();
    let mut taken: Option<(usize, usize)> = None;
    for (i, w) in lower.iter().enumerate() {
        let found = match w.as_str() {
            "today" => Some((today, 1)),
            "yesterday" => Some((today - Days::new(1), 1)),
            "tomorrow" => Some((today + Days::new(1), 1)),
            _ => None,
        }
        .or_else(|| {
            // "friday": the last one (today counts).
            let weekday = WEEKDAYS.iter().position(|d| d.starts_with(w.as_str()) && w.len() >= 3)?;
            let back = (today.weekday().num_days_from_monday() as i64 - weekday as i64).rem_euclid(7);
            Some((today - Days::new(back as u64), 1))
        })
        .or_else(|| {
            // "3 days ago", "2 weeks ago".
            let n: u64 = w.parse().ok()?;
            let unit = lower.get(i + 1)?;
            let days = if unit.starts_with("day") { n } else if unit.starts_with("week") { n * 7 } else { return None };
            let ago = lower.get(i + 2).is_some_and(|a| a == "ago");
            Some((today - Days::new(days), if ago { 3 } else { 2 }))
        })
        .or_else(|| {
            // "12 oct", "oct 12".
            let month_word = |s: &str| MONTHS.iter().position(|m| s.starts_with(m)).map(|m| m as u32 + 1);
            let (day, month, len) = match (w.parse::<u32>().ok(), lower.get(i + 1).and_then(|n| month_word(n))) {
                (Some(d), Some(m)) => (d, m, 2),
                _ => {
                    let m = month_word(w)?;
                    (lower.get(i + 1)?.trim_end_matches(|c: char| !c.is_ascii_digit()).parse().ok()?, m, 2)
                }
            };
            Some((past_date(today, month, day)?, len))
        })
        .or_else(|| {
            // "12/10" (or 10/12 in the US).
            let (a, b) = w.split_once('/')?;
            let (a, b): (u32, u32) = (a.parse().ok()?, b.parse().ok()?);
            let (month, day) = if month_first { (a, b) } else { (b, a) };
            Some((past_date(today, month, day)?, 1))
        });
        if let Some((day, len)) = found {
            entry.day = day;
            taken = Some((i, len));
            break;
        }
    }
    if let Some((at, len)) = taken {
        words.drain(at..(at + len).min(words.len()));
    }
    // "on friday", "at tesco": small words left at the edges go.
    while words.last().is_some_and(|w| matches!(w.to_lowercase().as_str(), "on" | "at" | "for" | "from")) {
        words.pop();
    }
    while words.first().is_some_and(|w| matches!(w.to_lowercase().as_str(), "on" | "at" | "for")) {
        words.remove(0);
    }

    entry.payee = words.join(" ");
    // No category given: one whose name the payee mentions, or what was learned.
    if entry.category_id.is_none() {
        let payee = entry.payee.to_lowercase();
        let named = categories
            .iter()
            .filter(|c| !c.archived)
            .find(|c| payee.split_whitespace().any(|w| w.len() > 3 && c.name.to_lowercase().split(|ch: char| !ch.is_alphanumeric()).any(|n| n.starts_with(w) || w.starts_with(n) && n.len() > 3)));
        if let Some(c) = named {
            entry.category_id = Some(c.id.clone());
            income = income || c.kind == "income";
        } else if let Some(c) = learned.and_then(|id| categories.iter().find(|c| c.id == id)) {
            entry.category_id = Some(c.id.clone());
            income = income || c.kind == "income";
        }
    }
    if let Some(value) = entry.amount {
        entry.amount = Some(if income { value.abs() } else { -value.abs() });
    }
    entry
}

/// The most recent `day` of `month` not after today (this year, or last).
fn past_date(today: NaiveDate, month: u32, day: u32) -> Option<NaiveDate> {
    let this_year = NaiveDate::from_ymd_opt(today.year(), month, day)?;
    if this_year <= today { Some(this_year) } else { NaiveDate::from_ymd_opt(today.year() - 1, month, day) }
}
