//! Reads birthdays and anniversaries out of a contacts file (.vcf), as
//! exported by Google Contacts, iCloud, Outlook and phones. vCard 2.1, 3.0
//! and 4.0.

#[derive(Debug, PartialEq)]
pub struct Found {
    pub name: String,
    pub occasion: &'static str,
    pub month: i16,
    pub day: i16,
    pub year: Option<i32>,
}

#[derive(Debug, Default)]
pub struct Contacts {
    pub dates: Vec<Found>,
    pub without_date: u32,
}

/// Lines, with folded ones (starting with a space or tab) joined back on.
fn unfold(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.lines() {
        match (raw.strip_prefix(' ').or_else(|| raw.strip_prefix('\t')), lines.last_mut()) {
            (Some(rest), Some(last)) => last.push_str(rest),
            _ => lines.push(raw.trim_end_matches('\r').to_owned()),
        }
    }
    lines
}

fn unescape(value: &str) -> String {
    value.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").trim().to_owned()
}

/// "1990-05-12", "19900512", "--05-12", "--0512", "1990-05-12T00:00:00Z".
/// Apple writes year 1604 when there isn't one.
fn date(value: &str) -> Option<(i16, i16, Option<i32>)> {
    let digits = value.trim().split('T').next()?.replace('-', "");
    if !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let (year, rest) = match digits.len() {
        4 => (None, &digits[..]),
        8 => (digits[..4].parse::<i32>().ok().filter(|y| *y != 1604), &digits[4..]),
        _ => return None,
    };
    let month: i16 = rest.get(..2)?.parse().ok()?;
    let day: i16 = rest.get(2..4)?.parse().ok()?;
    chrono::NaiveDate::from_ymd_opt(2024, month as u32, day as u32)?;
    Some((month, day, year))
}

pub fn parse(text: &str) -> Contacts {
    let mut out = Contacts::default();
    let mut card: Option<Vec<(String, String)>> = None;
    for line in unfold(text) {
        let upper = line.to_ascii_uppercase();
        if upper == "BEGIN:VCARD" {
            card = Some(Vec::new());
        } else if upper == "END:VCARD" {
            if let Some(fields) = card.take() {
                take(&fields, &mut out);
            }
        } else if let (Some(fields), Some((key, value))) = (card.as_mut(), line.split_once(':')) {
            // "item1.BDAY;VALUE=date" -> "BDAY"
            let name = key.split(';').next().unwrap_or_default();
            let name = name.rsplit('.').next().unwrap_or_default().to_ascii_uppercase();
            fields.push((name, value.to_owned()));
        }
    }
    out
}

fn take(fields: &[(String, String)], out: &mut Contacts) {
    let field = |n: &str| fields.iter().find(|(k, _)| k == n).map(|(_, v)| v.as_str());
    let name = field("FN").map(unescape).filter(|n| !n.is_empty()).or_else(|| {
        // N is "Family;Given;Middle;Prefix;Suffix".
        let parts: Vec<String> = field("N")?.split(';').map(unescape).collect();
        let full = [parts.get(1), parts.first()].into_iter().flatten().filter(|p| !p.is_empty()).cloned().collect::<Vec<_>>().join(" ");
        (!full.is_empty()).then_some(full)
    });
    let Some(name) = name else { return };
    let mut any = false;
    for (key, occasion) in [("BDAY", "birthday"), ("ANNIVERSARY", "anniversary"), ("X-ANNIVERSARY", "anniversary")] {
        if let Some((month, day, year)) = field(key).and_then(date) {
            out.dates.push(Found { name: name.clone(), occasion, month, day, year });
            any = true;
        }
    }
    if !any {
        out.without_date += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_ways_contacts_apps_write_dates() {
        assert_eq!(date("1990-05-12"), Some((5, 12, Some(1990))));
        assert_eq!(date("19900512"), Some((5, 12, Some(1990))));
        assert_eq!(date("--05-12"), Some((5, 12, None)));
        assert_eq!(date("--0512"), Some((5, 12, None)));
        assert_eq!(date("1604-02-29"), Some((2, 29, None)), "Apple's no-year year");
        assert_eq!(date("1985-07-04T00:00:00Z"), Some((7, 4, Some(1985))));
        assert_eq!(date("2024-02-30"), None);
        assert_eq!(date("soon"), None);
    }

    #[test]
    fn reads_cards_with_folded_lines_and_grouped_fields() {
        let text = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\n  Lovelace\r\nBDAY;VALUE=date:1815-12-10\r\nEND:VCARD\r\n\
                    BEGIN:VCARD\nVERSION:4.0\nN:Smith;Sam;;;\nitem1.X-ANNIVERSARY:2015-06-20\nEND:VCARD\n\
                    BEGIN:VCARD\nFN:No Date\nTEL:123\nEND:VCARD\n";
        let c = parse(text);
        assert_eq!(c.without_date, 1);
        assert_eq!(c.dates, [
            Found { name: "Ada Lovelace".into(), occasion: "birthday", month: 12, day: 10, year: Some(1815) },
            Found { name: "Sam Smith".into(), occasion: "anniversary", month: 6, day: 20, year: Some(2015) },
        ]);
    }
}
