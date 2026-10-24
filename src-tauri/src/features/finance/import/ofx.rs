//! OFX and QFX (Quicken's OFX): the structured format many banks export.
//! Older files are SGML (tags without closing tags), newer ones XML; both
//! are read the same way. Each transaction has the bank's own id (FITID),
//! so importing the same statement twice is always caught.

use chrono::NaiveDate;

use super::Parsed;
use crate::features::finance::money;

pub struct Statement {
    pub currency: Option<String>,
    pub transactions: Vec<Parsed>,
}

/// The value of `<TAG>` in a block: up to the next tag or line end.
fn value<'a>(block: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = block.find(&open)? + open.len();
    let rest = &block[start..];
    let end = rest.find(['<', '\n', '\r']).unwrap_or(rest.len());
    Some(rest[..end].trim()).filter(|v| !v.is_empty())
}

fn unescape(text: &str) -> String {
    text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'")
}

pub fn read(text: &str, exponent: u32) -> Statement {
    let upper = text.replace("<stmttrn>", "<STMTTRN>").replace("</stmttrn>", "</STMTTRN>");
    let currency = value(&upper, "CURDEF").map(str::to_uppercase).filter(|c| money::is_currency(c));
    let mut transactions = Vec::new();
    for chunk in upper.split("<STMTTRN>").skip(1) {
        let block = chunk.split("</STMTTRN>").next().unwrap_or(chunk);
        // "20261023", "20261023120000[0:GMT]".
        let Some(day) = value(block, "DTPOSTED").and_then(|d| NaiveDate::parse_from_str(d.get(..8)?, "%Y%m%d").ok()) else { continue };
        let Some(amount) = value(block, "TRNAMT").and_then(|a| money::parse_amount(a, exponent, false)) else { continue };
        let name = value(block, "NAME").map(unescape).unwrap_or_default();
        let memo = value(block, "MEMO").map(unescape).unwrap_or_default();
        let (payee, notes) = if name.is_empty() { (memo, String::new()) } else { (name, memo) };
        transactions.push(Parsed { day, amount, payee, notes, bank_id: value(block, "FITID").map(String::from) });
    }
    Statement { currency, transactions }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sgml_and_xml_ofx() {
        let sgml = "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>GBP\n<BANKTRANLIST>\n\
                    <STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261023120000[0:GMT]\n<TRNAMT>-12.50\n<FITID>2026102301\n<NAME>TESCO STORES 4521\n<MEMO>CONTACTLESS\n\
                    <STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261024\n<TRNAMT>2400.00\n<FITID>2026102402\n<NAME>ACME &amp; SONS\n\
                    </BANKTRANLIST>";
        let s = read(sgml, 2);
        assert_eq!(s.currency.as_deref(), Some("GBP"));
        assert_eq!(s.transactions.len(), 2);
        assert_eq!((s.transactions[0].amount, s.transactions[0].payee.as_str(), s.transactions[0].bank_id.as_deref()), (-1250, "TESCO STORES 4521", Some("2026102301")));
        assert_eq!(s.transactions[1].payee, "ACME & SONS");

        let xml = "<?xml version=\"1.0\"?><OFX><CURDEF>EUR</CURDEF><STMTTRN><DTPOSTED>20261101</DTPOSTED><TRNAMT>-5,00</TRNAMT><FITID>a1</FITID><NAME>Café</NAME></STMTTRN></OFX>";
        let s = read(xml, 2);
        assert_eq!((s.currency.as_deref(), s.transactions[0].amount), (Some("EUR"), -500));
    }
}
