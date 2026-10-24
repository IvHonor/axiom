//! Currencies and amounts. Amounts are whole numbers of the currency's
//! smallest unit (pence, cents, yen), so sums are exact; floats only appear
//! for exchange rates.

/// Decimal places by ISO 4217. Most currencies have 2; these differ.
pub fn exponent(currency: &str) -> u32 {
    match currency {
        "BIF" | "CLP" | "DJF" | "GNF" | "ISK" | "JPY" | "KMF" | "KRW" | "PYG" | "RWF" | "UGX" | "UYI" | "VND" | "VUV" | "XAF" | "XOF" | "XPF" => 0,
        "BHD" | "IQD" | "JOD" | "KWD" | "LYD" | "OMR" | "TND" => 3,
        _ => 2,
    }
}

/// A plausible ISO 4217 code: three capital letters.
pub fn is_currency(code: &str) -> bool {
    code.len() == 3 && code.bytes().all(|b| b.is_ascii_uppercase())
}

/// Symbols people type, and the currency they usually mean.
pub fn symbol_currency(symbol: char) -> Option<&'static str> {
    Some(match symbol {
        '£' => "GBP",
        '€' => "EUR",
        '$' => "USD",
        '¥' => "JPY",
        '₹' => "INR",
        '₩' => "KRW",
        '₺' => "TRY",
        '₽' => "RUB",
        '₪' => "ILS",
        '₫' => "VND",
        '₦' => "NGN",
        '₱' => "PHP",
        '฿' => "THB",
        '₴' => "UAH",
        '₣' => "CHF",
        _ => return None,
    })
}

/// Reads an amount as written in a statement or typed by hand: "1,234.56",
/// "1.234,56", "-12.50", "(12.50)", "12.50 DR", "£12". `decimal_comma`
/// says which separator is the decimal point when it can't be told.
/// Returns minor units, signed.
pub fn parse_amount(text: &str, exponent: u32, decimal_comma: bool) -> Option<i64> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    let upper = trimmed.to_uppercase();
    let mut negative = upper.starts_with('-') || upper.ends_with('-') || (upper.starts_with('(') && upper.ends_with(')')) || upper.ends_with("DR") || upper.ends_with(" D");
    if upper.ends_with("CR") {
        negative = false;
    }
    let digits: String = trimmed.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',').collect();
    if !digits.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    // Which separator is the decimal point: the last one, if digits after it
    // look like a fraction; a lone separator follows `decimal_comma`.
    let last_dot = digits.rfind('.');
    let last_comma = digits.rfind(',');
    let decimal = match (last_dot, last_comma) {
        (Some(d), Some(c)) => Some(if d > c { '.' } else { ',' }),
        (Some(d), None) => {
            let after = digits.len() - d - 1;
            // "1.234" with nothing else is a thousands separator in decimal-comma places.
            let thousands = (decimal_comma && after == 3 && digits.matches('.').count() == 1) || digits.matches('.').count() > 1;
            (!thousands).then_some('.')
        }
        (None, Some(c)) => {
            let after = digits.len() - c - 1;
            let thousands = (!decimal_comma && after == 3) || digits.matches(',').count() > 1;
            (!thousands).then_some(',')
        }
        (None, None) => None,
    };
    let (whole, fraction) = match decimal {
        Some(sep) => {
            let at = digits.rfind(sep)?;
            (digits[..at].replace(['.', ','], ""), digits[at + 1..].to_owned())
        }
        None => (digits.replace(['.', ','], ""), String::new()),
    };
    let scale = 10i64.checked_pow(exponent)?;
    let whole: i64 = if whole.is_empty() { 0 } else { whole.parse().ok()? };
    // Round to the currency's precision.
    let mut fraction_value = 0i64;
    let digits_wanted = exponent as usize;
    let mut fraction_chars = fraction.chars();
    for _ in 0..digits_wanted {
        fraction_value = fraction_value * 10 + fraction_chars.next().and_then(|c| c.to_digit(10)).unwrap_or(0) as i64;
    }
    if fraction_chars.next().and_then(|c| c.to_digit(10)).is_some_and(|d| d >= 5) {
        fraction_value += 1;
    }
    let value = whole.checked_mul(scale)?.checked_add(fraction_value)?;
    Some(if negative { -value } else { value })
}

/// Converts minor units of one currency to another at `rate` (1 from = rate to).
pub fn convert(amount: i64, from: &str, to: &str, rate: f64) -> i64 {
    let scale = 10f64.powi(exponent(to) as i32 - exponent(from) as i32);
    (amount as f64 * rate * scale).round() as i64
}

/// "£12.50"-style text, for notifications (the app formats with the locale).
pub fn display(amount: i64, currency: &str) -> String {
    let e = exponent(currency);
    let sign = if amount < 0 { "-" } else { "" };
    let abs = amount.unsigned_abs();
    let symbol = match currency {
        "GBP" => "£",
        "EUR" => "€",
        "USD" => "$",
        "JPY" => "¥",
        "INR" => "₹",
        _ => "",
    };
    let number = if e == 0 {
        abs.to_string()
    } else {
        let scale = 10u64.pow(e);
        format!("{}.{:0width$}", abs / scale, abs % scale, width = e as usize)
    };
    if symbol.is_empty() { format!("{sign}{number} {currency}") } else { format!("{sign}{symbol}{number}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amounts_are_read_however_they_are_written() {
        assert_eq!(parse_amount("12.50", 2, false), Some(1250));
        assert_eq!(parse_amount("-1,234.56", 2, false), Some(-123456));
        assert_eq!(parse_amount("1.234,56", 2, true), Some(123456));
        assert_eq!(parse_amount("1.234,56", 2, false), Some(123456), "two separators tell it apart");
        assert_eq!(parse_amount("(12.50)", 2, false), Some(-1250));
        assert_eq!(parse_amount("12.50 DR", 2, false), Some(-1250));
        assert_eq!(parse_amount("12.50 CR", 2, false), Some(1250));
        assert_eq!(parse_amount("£12", 2, false), Some(1200));
        assert_eq!(parse_amount("1,000", 2, false), Some(100000), "a thousands comma");
        assert_eq!(parse_amount("12,5", 2, true), Some(1250));
        assert_eq!(parse_amount("1500", 0, false), Some(1500), "yen have no decimals");
        assert_eq!(parse_amount("1.2345", 3, false), Some(1235), "rounded to three places");
        assert_eq!(parse_amount("", 2, false), None);
        assert_eq!(parse_amount("n/a", 2, false), None);
    }

    #[test]
    fn currencies_convert_between_their_units() {
        assert_eq!(convert(1000, "EUR", "GBP", 0.85), 850);
        assert_eq!(convert(1000, "JPY", "GBP", 0.0053), 530, "1,000 yen is £5.30");
        assert_eq!(display(-1250, "GBP"), "-£12.50");
        assert_eq!(display(1500, "JPY"), "¥1500");
        assert_eq!(display(12345, "KWD"), "12.345 KWD");
    }
}
