//! QIF (Quicken Interchange Format): an older plain-text export. Each
//! transaction is a few lines (D date, T amount, P payee, M memo) ending in ^.

use super::dates;
use super::Parsed;
use crate::features::finance::money;

/// Reads the transactions; returns them and how many couldn't be read.
pub fn read(text: &str, exponent: u32, month_first: bool) -> (Vec<Parsed>, u32) {
    struct Raw {
        date: String,
        amount: String,
        payee: String,
        memo: String,
    }
    let mut raws = Vec::new();
    let mut current = Raw { date: String::new(), amount: String::new(), payee: String::new(), memo: String::new() };
    for line in text.lines().map(str::trim) {
        let (code, rest) = line.split_at(line.chars().next().map_or(0, char::len_utf8));
        match code {
            "D" => current.date = rest.trim().replace('\'', "/").replace(' ', ""),
            "T" | "U" => current.amount = rest.trim().into(),
            "P" => current.payee = rest.trim().into(),
            "M" => current.memo = rest.trim().into(),
            "^" => raws.push(std::mem::replace(&mut current, Raw { date: String::new(), amount: String::new(), payee: String::new(), memo: String::new() })),
            _ => {}
        }
    }
    // Two-digit years after an apostrophe ("10/23'26") read as 20xx.
    let dates_seen: Vec<&str> = raws.iter().map(|r| r.date.as_str()).filter(|d| !d.is_empty()).collect();
    let layout = dates::detect(&dates_seen, month_first);
    let mut out = Vec::new();
    let mut skipped = 0;
    for r in raws {
        let day = layout.and_then(|l| dates::parse(&r.date, l));
        let amount = money::parse_amount(&r.amount, exponent, r.amount.contains(',') && !r.amount.contains('.'));
        match (day, amount) {
            (Some(day), Some(amount)) if amount != 0 => {
                let (payee, notes) = if r.payee.is_empty() { (r.memo, String::new()) } else { (r.payee, r.memo) };
                out.push(Parsed { day, amount, payee, notes, bank_id: None });
            }
            _ => skipped += 1,
        }
    }
    (out, skipped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn a_qif_export() {
        let text = "!Type:Bank\nD23/10/2026\nT-12.50\nPTesco\nMGroceries run\n^\nD25/10/2026\nT2,400.00\nPACME\n^\nDnope\nT1\n^\n";
        let (rows, skipped) = read(text, 2, false);
        assert_eq!(skipped, 1);
        assert_eq!(rows[0], Parsed { day: NaiveDate::from_ymd_opt(2026, 10, 23).unwrap(), amount: -1250, payee: "Tesco".into(), notes: "Groceries run".into(), bank_id: None });
        assert_eq!(rows[1].amount, 240000);
    }
}
