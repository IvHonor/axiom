//! Turning a contents list into units: pasted text (a book's contents, a
//! course curriculum), or the table of contents inside an EPUB or PDF.
//!
//! Book databases rarely know a textbook's chapters, so these are the
//! dependable ways in. Everything here is offline.

use std::io::Read;

use super::types::{Draft, Found};
use crate::error::{Error, Result};

/// The most units one import adds.
const MAX_UNITS: usize = 2000;
/// The most a single file inside an EPUB may unpack to: a table of contents
/// is small, so anything bigger is a broken file (or a zip bomb).
const MAX_ENTRY: usize = 16 * 1024 * 1024;

// ---------- Pasted text ----------

/// Units from a pasted list: one per line, nested by numbering ("1", "1.2",
/// "Part II", "Section 3:") or indentation, with page numbers and lecture
/// lengths taken off the end. Course pages' extra lines ("Preview", "5
/// lectures • 23min") are skipped.
pub fn from_text(text: &str) -> Vec<Draft> {
    let lines: Vec<&str> = text.lines().map(|l| l.trim_end()).filter(|l| !l.trim().is_empty()).collect();
    // Trailing numbers are page numbers only when most lines have one; a
    // lone "Windows 11" keeps its number.
    let ending_in_number = lines.iter().filter(|l| trailing_page(l.trim()).is_some()).count();
    let pages = ending_in_number * 2 > lines.len();
    let has_parts = lines.iter().any(|l| part_heading(l.trim()));
    let has_sections = lines.iter().any(|l| course_section(l.trim()));

    let mut out: Vec<Draft> = Vec::new();
    for raw in lines {
        let line = raw.trim();
        if is_noise(line) {
            continue;
        }
        // A length on a line of its own belongs to the line before (Udemy).
        if let Some(minutes) = duration_only(line) {
            if let Some(last) = out.last_mut() {
                last.minutes.get_or_insert(minutes);
            }
            continue;
        }
        let (mut title, minutes) = take_minutes(line);
        let mut page = None;
        if pages && let Some((rest, n)) = trailing_page(&title) {
            title = rest;
            page = Some(n);
        }
        let title = strip_kind_prefix(title.trim_end_matches(['.', ' ', '\t']).trim());
        if title.is_empty() {
            continue;
        }
        let level = if part_heading(&title) || course_section(&title) {
            0
        } else if let Some(depth) = numbering_depth(&title) {
            depth + i16::from(has_parts)
        } else if has_sections {
            1
        } else {
            indent_level(raw)
        };
        out.push(Draft { title, level, minutes, page });
        if out.len() >= MAX_UNITS {
            break;
        }
    }
    tidy_levels(&mut out);
    out
}

fn is_noise(line: &str) -> bool {
    let lower = line.to_lowercase();
    matches!(lower.as_str(), "preview" | "start" | "play" | "resume" | "contents" | "table of contents" | "course content" | "expand all sections" | "collapse all sections")
        // "5 lectures • 23min", "12 sections • 103 lectures • 9h 34m total length"
        || (lower.contains('•') && lower.split('•').all(|part| part.trim().is_empty() || part.trim().starts_with(|c: char| c.is_ascii_digit())))
}

/// "02:15" or "1:02:15" on its own: a lecture's length, in minutes (rounded up).
fn duration_only(line: &str) -> Option<i32> {
    let parts: Vec<&str> = line.split(':').collect();
    if !(2..=3).contains(&parts.len()) || !parts.iter().all(|p| !p.is_empty() && p.len() <= 2 && p.bytes().all(|b| b.is_ascii_digit())) {
        return None;
    }
    let n: Vec<i32> = parts.iter().map(|p| p.parse().unwrap_or(0)).collect();
    let seconds = if n.len() == 3 { n[0] * 3600 + n[1] * 60 + n[2] } else { n[0] * 60 + n[1] };
    Some((seconds + 59) / 60)
}

/// A length on the end of a line: "Intro • 5 min", "Intro (12m)", "Intro 03:40".
fn take_minutes(line: &str) -> (String, Option<i32>) {
    let mut words: Vec<&str> = line.split_whitespace().collect();
    let strip = |w: &str| w.trim_matches(|c: char| matches!(c, '(' | ')' | '[' | ']' | '•' | '·' | ',' | '-')).to_lowercase();
    if words.len() >= 2 {
        if let Some(m) = duration_only(&strip(words[words.len() - 1])) {
            words.pop();
            return (clean_end(&words.join(" ")), Some(m));
        }
        // "5 min", "12 mins", "1 hr"
        let unit = strip(words[words.len() - 1]);
        let number = strip(words[words.len() - 2]);
        if let Ok(n) = number.parse::<i32>() {
            let minutes = match unit.as_str() {
                "min" | "mins" | "minute" | "minutes" | "m" => Some(n),
                "hr" | "hrs" | "hour" | "hours" | "h" => Some(n * 60),
                _ => None,
            };
            if let Some(m) = minutes.filter(|_| words.len() > 2) {
                words.truncate(words.len() - 2);
                return (clean_end(&words.join(" ")), Some(m));
            }
        }
        // "12m", "1h"
        if let Some(n) = unit.strip_suffix('m').and_then(|n| n.parse::<i32>().ok()) {
            words.pop();
            return (clean_end(&words.join(" ")), Some(n));
        }
    }
    (line.to_owned(), None)
}

fn clean_end(text: &str) -> String {
    text.trim_end_matches(['•', '·', '-', '–', '(', ',', ' ']).to_owned()
}

/// "Video: Welcome", "Reading: Syllabus" (Coursera): the title, without the kind.
fn strip_kind_prefix(title: &str) -> String {
    for prefix in ["Video:", "Reading:", "Lecture:", "Quiz:", "Practice Quiz:", "Graded Assignment:", "Lab:"] {
        if let Some(rest) = title.strip_prefix(prefix) {
            return rest.trim().to_owned();
        }
    }
    title.to_owned()
}

/// A page number on the end, after a space, tab or dot leaders:
/// "Background ......... 14", "Background\t14".
fn trailing_page(line: &str) -> Option<(String, i32)> {
    let (last, c) = line.char_indices().rev().find(|(_, c)| !c.is_ascii_digit())?;
    let digits = &line[last + c.len_utf8()..];
    if digits.is_empty() || digits.len() > 4 || !matches!(c, ' ' | '\t' | '.' | '…') {
        return None;
    }
    let rest = line[..last].trim_end_matches(['.', ' ', '\t', '…']).trim();
    // Not the number that's part of the title ("Chapter 12").
    let word = rest.split_whitespace().last().unwrap_or("").to_lowercase();
    if rest.is_empty() || matches!(word.as_str(), "chapter" | "part" | "section" | "lecture" | "week" | "module" | "unit" | "lesson") {
        return None;
    }
    Some((rest.to_owned(), digits.parse().ok()?))
}

/// "Part II", "Part 3: Methods", "Book One".
fn part_heading(line: &str) -> bool {
    let mut words = line.split_whitespace();
    let first = words.next().unwrap_or("").to_lowercase();
    let second = words.next().unwrap_or("").trim_end_matches([':', '.', '-']).to_lowercase();
    matches!(first.as_str(), "part" | "book")
        && !second.is_empty()
        && (second.chars().all(|c| c.is_ascii_digit())
            || second.chars().all(|c| "ivxlc".contains(c))
            || matches!(second.as_str(), "one" | "two" | "three" | "four" | "five" | "six" | "seven" | "eight" | "nine" | "ten"))
}

/// "Section 1: Introduction", "Week 2", "Module 3 - …" (course pages).
fn course_section(line: &str) -> bool {
    let mut words = line.split_whitespace();
    let first = words.next().unwrap_or("").to_lowercase();
    matches!(first.as_str(), "section" | "week" | "module") && words.next().is_some_and(|w| w.trim_end_matches([':', '.']).chars().all(|c| c.is_ascii_digit()) && !w.is_empty())
}

/// How deep a numbered line is: "3 Methods" and "Chapter 3" are 0,
/// "3.2 Results" is 1, "3.2.1" is 2. None without numbering.
fn numbering_depth(line: &str) -> Option<i16> {
    let lower = line.to_lowercase();
    if let Some(rest) = lower.strip_prefix("chapter ").or_else(|| lower.strip_prefix("lecture ")).or_else(|| lower.strip_prefix("lesson ")) {
        return rest.chars().next().filter(|c| c.is_ascii_alphanumeric()).map(|_| 0);
    }
    let first = line.split_whitespace().next()?.trim_end_matches(['.', ':', ')']);
    let parts: Vec<&str> = first.split('.').collect();
    let numbered = !first.is_empty() && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.bytes().all(|b| b.is_ascii_digit()));
    // A number alone ("1999") isn't numbering; it needs a title after it.
    (numbered && line.split_whitespace().nth(1).is_some()).then(|| (parts.len() - 1).min(4) as i16)
}

/// Nesting from leading tabs or pairs of spaces, for lists without numbering.
fn indent_level(raw: &str) -> i16 {
    let mut level = 0;
    let mut spaces = 0;
    for c in raw.chars() {
        match c {
            '\t' => level += 1,
            ' ' => spaces += 1,
            _ => break,
        }
    }
    (level + spaces / 2).min(4)
}

/// No unit more than one level deeper than the one before it, and the
/// shallowest at 0, so headings always have something under them.
fn tidy_levels(units: &mut [Draft]) {
    let min = units.iter().map(|u| u.level).min().unwrap_or(0);
    let mut previous = -1;
    for u in units.iter_mut() {
        u.level = (u.level - min).clamp(0, previous + 1);
        previous = u.level;
    }
}

// ---------- Book files ----------

/// The chapters inside a book file, by its name.
pub fn from_book(name: &str, bytes: &[u8]) -> Result<Found> {
    let lower = name.to_lowercase();
    if lower.ends_with(".epub") || bytes.starts_with(b"PK") {
        from_epub(bytes)
    } else if lower.ends_with(".pdf") || bytes.starts_with(b"%PDF") {
        from_pdf(bytes)
    } else {
        Err(Error::Invalid("Choose an EPUB or PDF file.".into()))
    }
}

fn from_pdf(bytes: &[u8]) -> Result<Found> {
    let doc = lopdf::Document::load_mem(bytes).map_err(|_| Error::Invalid("That PDF couldn't be read. If it's password-protected, remove the password first.".into()))?;
    let toc = doc.get_toc().map_err(|_| Error::Invalid(NO_CONTENTS.into()))?;
    let mut units: Vec<Draft> = toc
        .toc
        .into_iter()
        .filter(|t| !t.title.trim().is_empty())
        .take(MAX_UNITS)
        .map(|t| Draft { title: t.title.trim().to_owned(), level: t.level.min(20) as i16, minutes: None, page: i32::try_from(t.page).ok().filter(|p| *p > 0) })
        .collect();
    if units.is_empty() {
        return Err(Error::Invalid(NO_CONTENTS.into()));
    }
    tidy_levels(&mut units);
    let info = |key: &[u8]| {
        doc.trailer
            .get(b"Info")
            .ok()
            .and_then(|i| doc.dereference(i).ok())
            .and_then(|(_, o)| o.as_dict().ok().and_then(|d| d.get(key).ok()).and_then(|v| lopdf::decode_text_string(v).ok()))
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
    };
    Ok(Found { title: info(b"Title"), author: info(b"Author"), units })
}

const NO_CONTENTS: &str = "That file has no built-in table of contents. Paste the contents instead, or add chapters by hand.";

/// Front matter that's not worth ticking off.
fn front_matter(title: &str) -> bool {
    matches!(
        title.trim().to_lowercase().as_str(),
        "cover" | "title page" | "title" | "copyright" | "copyright page" | "contents" | "table of contents" | "dedication" | "half title" | "half-title page"
    )
}

fn from_epub(bytes: &[u8]) -> Result<Found> {
    let zip = Zip::open(bytes).ok_or_else(|| Error::Invalid("That EPUB couldn't be opened. It may be damaged.".into()))?;
    let text = |path: &str| zip.read(path).and_then(|b| String::from_utf8(b).ok()).map(numeric_entities);
    let container = text("META-INF/container.xml").ok_or_else(|| Error::Invalid("That EPUB is missing its contents file.".into()))?;
    let opf_path = xml(&container)?
        .descendants()
        .find(|n| n.has_tag_name("rootfile"))
        .and_then(|n| n.attribute("full-path"))
        .map(str::to_owned)
        .ok_or_else(|| Error::Invalid("That EPUB is missing its contents file.".into()))?;
    let opf_text = text(&opf_path).ok_or_else(|| Error::Invalid("That EPUB is missing its contents file.".into()))?;
    let opf = xml(&opf_text)?;
    let base = opf_path.rsplit_once('/').map(|(dir, _)| format!("{dir}/")).unwrap_or_default();
    let meta = |tag: &str| opf.descendants().find(|n| n.tag_name().name() == tag).and_then(|n| n.text()).map(|t| t.trim().to_owned()).filter(|t| !t.is_empty());
    let items: Vec<roxmltree::Node> = opf.descendants().filter(|n| n.has_tag_name("item") || n.tag_name().name() == "item").collect();

    // EPUB 2's NCX (most books carry one), else EPUB 3's nav page.
    let ncx = opf
        .descendants()
        .find(|n| n.tag_name().name() == "spine")
        .and_then(|s| s.attribute("toc"))
        .and_then(|id| items.iter().find(|i| i.attribute("id") == Some(id)))
        .or_else(|| items.iter().find(|i| i.attribute("media-type") == Some("application/x-dtbncx+xml")))
        .and_then(|i| i.attribute("href"));
    let nav = items.iter().find(|i| i.attribute("properties").is_some_and(|p| p.split_whitespace().any(|p| p == "nav"))).and_then(|i| i.attribute("href"));

    let mut units = Vec::new();
    if let Some(href) = ncx.and_then(|h| text(&format!("{base}{}", decode_path(h)))) {
        let doc = xml(&href)?;
        if let Some(map) = doc.descendants().find(|n| n.tag_name().name() == "navMap") {
            ncx_points(map, 0, &mut units);
        }
    }
    if units.is_empty()
        && let Some(page) = nav.and_then(|h| text(&format!("{base}{}", decode_path(h))))
    {
        let doc = xml(&page)?;
        let toc = doc
            .descendants()
            .find(|n| n.tag_name().name() == "nav" && n.attributes().any(|a| a.name() == "type" && a.value().split_whitespace().any(|v| v == "toc")))
            .or_else(|| doc.descendants().find(|n| n.tag_name().name() == "nav"));
        if let Some(list) = toc.and_then(|t| t.children().find(|c| c.tag_name().name() == "ol")) {
            nav_list(list, 0, &mut units);
        }
    }
    units.retain(|u| !front_matter(&u.title));
    units.truncate(MAX_UNITS);
    if units.is_empty() {
        return Err(Error::Invalid(NO_CONTENTS.into()));
    }
    tidy_levels(&mut units);
    Ok(Found { title: meta("title"), author: meta("creator"), units })
}

fn ncx_points(parent: roxmltree::Node, level: i16, out: &mut Vec<Draft>) {
    for point in parent.children().filter(|n| n.tag_name().name() == "navPoint") {
        let title = point
            .children()
            .find(|n| n.tag_name().name() == "navLabel")
            .and_then(|l| l.descendants().find(|n| n.tag_name().name() == "text"))
            .map(|t| squash(&all_text(t)))
            .unwrap_or_default();
        if !title.is_empty() {
            out.push(Draft { title, level, minutes: None, page: None });
        }
        ncx_points(point, level + 1, out);
    }
}

fn nav_list(list: roxmltree::Node, level: i16, out: &mut Vec<Draft>) {
    for item in list.children().filter(|n| n.tag_name().name() == "li") {
        let label = item.children().find(|n| matches!(n.tag_name().name(), "a" | "span")).map(|n| squash(&all_text(n))).unwrap_or_default();
        if !label.is_empty() {
            out.push(Draft { title: label, level, minutes: None, page: None });
        }
        if let Some(sub) = item.children().find(|n| n.tag_name().name() == "ol") {
            nav_list(sub, level + 1, out);
        }
    }
}

fn all_text(node: roxmltree::Node) -> String {
    node.descendants().filter(|n| n.is_text()).filter_map(|n| n.text()).collect()
}

fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// "Text/Chapter%201.xhtml#x" → "Text/Chapter 1.xhtml".
fn decode_path(href: &str) -> String {
    let path = href.split('#').next().unwrap_or(href);
    let mut out = Vec::new();
    let bytes = path.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // Bytes, not a str slice: what follows a '%' needn't be ASCII.
        let hex = (bytes[i] == b'%').then(|| bytes.get(i + 1..i + 3)).flatten().and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
        if let Some(b) = hex {
            out.push(b);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| path.to_owned())
}

/// XHTML's named entities that ebooks use, as numbers: roxmltree only knows XML's five.
fn numeric_entities(text: String) -> String {
    const NAMED: &[(&str, &str)] = &[
        ("&nbsp;", "&#160;"),
        ("&mdash;", "&#8212;"),
        ("&ndash;", "&#8211;"),
        ("&rsquo;", "&#8217;"),
        ("&lsquo;", "&#8216;"),
        ("&ldquo;", "&#8220;"),
        ("&rdquo;", "&#8221;"),
        ("&hellip;", "&#8230;"),
    ];
    if !text.contains('&') {
        return text;
    }
    NAMED.iter().fold(text, |t, (name, number)| t.replace(name, number))
}

/// Parses XML (or XHTML) already passed through `numeric_entities`.
fn xml(text: &str) -> Result<roxmltree::Document<'_>> {
    let options = roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() };
    roxmltree::Document::parse_with_options(text, options).map_err(|_| Error::Invalid("That EPUB's contents couldn't be read. It may be damaged.".into()))
}

/// Just enough of a zip reader for an EPUB: find an entry by name and
/// unpack it (stored or deflated).
struct Zip<'a> {
    bytes: &'a [u8],
    entries: Vec<(String, u16, usize, usize, usize)>,
}

impl<'a> Zip<'a> {
    fn open(bytes: &'a [u8]) -> Option<Self> {
        let u16_at = |i: usize| bytes.get(i..i + 2).map(|b| u16::from_le_bytes([b[0], b[1]]));
        let u32_at = |i: usize| bytes.get(i..i + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]));
        // The end of central directory record is in the last 64 KiB or so.
        let from = bytes.len().saturating_sub(22 + 65_535);
        let end = (from..bytes.len().saturating_sub(21)).rev().find(|&i| u32_at(i) == Some(0x0605_4b50))?;
        let count = u16_at(end + 10)? as usize;
        let mut at = u32_at(end + 16)? as usize;
        let mut entries = Vec::with_capacity(count.min(10_000));
        for _ in 0..count.min(10_000) {
            if u32_at(at)? != 0x0201_4b50 {
                return None;
            }
            let method = u16_at(at + 10)?;
            let compressed = u32_at(at + 20)? as usize;
            let size = u32_at(at + 24)? as usize;
            let (name_len, extra, comment) = (u16_at(at + 28)? as usize, u16_at(at + 30)? as usize, u16_at(at + 32)? as usize);
            let local = u32_at(at + 42)? as usize;
            let name = String::from_utf8_lossy(bytes.get(at + 46..at + 46 + name_len)?).into_owned();
            entries.push((name, method, compressed, size, local));
            at += 46 + name_len + extra + comment;
        }
        Some(Self { bytes, entries })
    }

    fn read(&self, path: &str) -> Option<Vec<u8>> {
        let (_, method, compressed, size, local) = self.entries.iter().find(|e| e.0 == path || e.0.eq_ignore_ascii_case(path))?;
        if *size > MAX_ENTRY {
            return None;
        }
        let u16_at = |i: usize| self.bytes.get(i..i + 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as usize);
        let start = local + 30 + u16_at(local + 26)? + u16_at(local + 28)?;
        let data = self.bytes.get(start..start.checked_add(*compressed)?)?;
        match method {
            0 => Some(data.to_vec()),
            8 => {
                let mut out = Vec::with_capacity(*size);
                flate2::read::DeflateDecoder::new(data).take(MAX_ENTRY as u64 + 1).read_to_end(&mut out).ok()?;
                (out.len() <= MAX_ENTRY).then_some(out)
            }
            _ => None,
        }
    }
}
