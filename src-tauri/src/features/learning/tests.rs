//! Tests for Learning against a throwaway in-memory database.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::outline::{from_book, from_text};
use super::service::*;
use super::types::{Draft, SessionFields, SkillFields, SourceFields};
use super::youtube::{iso_minutes, playlist_id};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, m, d).unwrap()
}

fn today() -> NaiveDate {
    day(10, 24)
}

fn draft(title: &str, level: i16) -> Draft {
    Draft { title: title.into(), level, minutes: None, page: None }
}

async fn rust_book(db: &DatabaseConnection) -> (String, String) {
    let skill = add_skill(db, SkillFields { name: "Rust".into(), icon: "🦀".into(), color: "orange".into(), why: String::new(), archived: false }).await.unwrap();
    let fields = SourceFields {
        skill_id: skill.id.clone(),
        kind: "book".into(),
        title: "The Rust Programming Language".into(),
        author: "Klabnik & Nichols".into(),
        link: None,
        cover_url: None,
        unit_name: String::new(),
        finish_by: None,
        notes: String::new(),
    };
    (skill.id, add_source(db, fields).await.unwrap().id)
}

// ---------- Pasted lists ----------

#[test]
fn a_pasted_book_contents_nests_by_numbering_and_keeps_page_numbers() {
    let text = "Contents\n\
                Part I Foundations\n\
                1 Getting Started ........ 1\n\
                1.1 Installation ........ 2\n\
                1.2 Hello, World! ........ 7\n\
                2 Guessing Game ........ 13\n\
                Part II Ownership\n\
                3 What Is Ownership? ........ 59\n";
    let units = from_text(text);
    let shape: Vec<(&str, i16, Option<i32>)> = units.iter().map(|u| (u.title.as_str(), u.level, u.page)).collect();
    assert_eq!(
        shape,
        [
            ("Part I Foundations", 0, None),
            ("1 Getting Started", 1, Some(1)),
            ("1.1 Installation", 2, Some(2)),
            ("1.2 Hello, World!", 2, Some(7)),
            ("2 Guessing Game", 1, Some(13)),
            ("Part II Ownership", 0, None),
            ("3 What Is Ownership?", 1, Some(59)),
        ]
    );
}

#[test]
fn a_pasted_udemy_curriculum_keeps_sections_and_lengths_and_drops_the_noise() {
    let text = "Course content\n\
                Section 1: Introduction\n\
                3 lectures • 10min\n\
                Welcome to the course\n\
                Preview\n\
                02:15\n\
                Setting up your machine\n\
                05:30\n\
                Section 2: Basics\n\
                Variables 12:01\n";
    let units = from_text(text);
    let shape: Vec<(&str, i16, Option<i32>)> = units.iter().map(|u| (u.title.as_str(), u.level, u.minutes)).collect();
    assert_eq!(
        shape,
        [
            ("Section 1: Introduction", 0, None),
            ("Welcome to the course", 1, Some(3)),
            ("Setting up your machine", 1, Some(6)),
            ("Section 2: Basics", 0, None),
            ("Variables", 1, Some(13)),
        ]
    );
}

#[test]
fn coursera_items_and_plain_lists_read_sensibly() {
    let units = from_text("Week 1\nVideo: Welcome • 5 min\nReading: Syllabus • 10 min\n");
    assert_eq!(units.iter().map(|u| (u.title.as_str(), u.minutes)).collect::<Vec<_>>(), [("Week 1", None), ("Welcome", Some(5)), ("Syllabus", Some(10))]);
    // A title that ends in a number keeps it when the rest don't have page numbers.
    let units = from_text("Installing Windows 11\nSetting up WSL\nYour first shell\n");
    assert_eq!(units[0].title, "Installing Windows 11");
    assert!(units.iter().all(|u| u.level == 0 && u.page.is_none()));
}

#[test]
fn indentation_nests_a_list_without_numbering() {
    let units = from_text("Basics\n  Syntax\n  Types\nAdvanced\n    Macros\n");
    assert_eq!(units.iter().map(|u| u.level).collect::<Vec<_>>(), [0, 1, 1, 0, 1], "never more than one level deeper");
}

// ---------- Book files ----------

/// A zip with each file stored, or deflated when asked: enough of an EPUB.
fn zip(files: &[(&str, &str, bool)]) -> Vec<u8> {
    use std::io::Write;
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, body, deflate) in files {
        let data = if *deflate {
            let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
            e.write_all(body.as_bytes()).unwrap();
            e.finish().unwrap()
        } else {
            body.as_bytes().to_vec()
        };
        let method: u16 = if *deflate { 8 } else { 0 };
        let offset = out.len() as u32;
        let mut local = vec![0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0];
        local.extend(method.to_le_bytes());
        local.extend([0; 8]); // time, date, crc
        local.extend((data.len() as u32).to_le_bytes());
        local.extend((body.len() as u32).to_le_bytes());
        local.extend((name.len() as u16).to_le_bytes());
        local.extend([0, 0]);
        local.extend(name.as_bytes());
        out.extend(&local);
        out.extend(&data);
        let mut entry = vec![0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0];
        entry.extend(method.to_le_bytes());
        entry.extend([0; 8]);
        entry.extend((data.len() as u32).to_le_bytes());
        entry.extend((body.len() as u32).to_le_bytes());
        entry.extend((name.len() as u16).to_le_bytes());
        entry.extend([0; 12]); // extra, comment, disk, attributes
        entry.extend(offset.to_le_bytes());
        entry.extend(name.as_bytes());
        central.extend(entry);
    }
    let start = out.len() as u32;
    out.extend(&central);
    out.extend([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);
    out.extend((files.len() as u16).to_le_bytes());
    out.extend((files.len() as u16).to_le_bytes());
    out.extend((central.len() as u32).to_le_bytes());
    out.extend(start.to_le_bytes());
    out.extend([0, 0]);
    out
}

#[test]
fn an_epubs_own_contents_become_units() {
    let container = r#"<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#;
    let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Learning Rust</dc:title><dc:creator>Ada Lovelace</dc:creator></metadata>
        <manifest><item id="ncx" href="toc%20file.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"/></package>"#;
    let ncx = r#"<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
        <navPoint><navLabel><text>Cover</text></navLabel></navPoint>
        <navPoint><navLabel><text>1. Ownership&nbsp;and borrowing</text></navLabel>
            <navPoint><navLabel><text>1.1 References</text></navLabel></navPoint>
        </navPoint>
        <navPoint><navLabel><text>2. Traits</text></navLabel></navPoint>
    </navMap></ncx>"#;
    let book = zip(&[("mimetype", "application/epub+zip", false), ("META-INF/container.xml", container, false), ("OEBPS/content.opf", opf, true), ("OEBPS/toc file.ncx", ncx, true)]);
    let found = from_book("learning-rust.epub", &book).unwrap();
    assert_eq!((found.title.as_deref(), found.author.as_deref()), (Some("Learning Rust"), Some("Ada Lovelace")));
    let shape: Vec<(&str, i16)> = found.units.iter().map(|u| (u.title.as_str(), u.level)).collect();
    assert_eq!(shape, [("1. Ownership and borrowing", 0), ("1.1 References", 1), ("2. Traits", 0)], "the cover's left out; &nbsp; is a space");
}

#[test]
fn a_pdfs_bookmarks_become_units_with_their_pages() {
    use lopdf::{Document, Object, dictionary};
    let mut doc = Document::with_version("1.5");
    let pages = doc.new_object_id();
    let page = |doc: &mut Document| doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages, "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()] });
    let (one, two) = (page(&mut doc), page(&mut doc));
    doc.objects.insert(pages, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => vec![one.into(), two.into()], "Count" => 2 }));

    let (outlines, ch1, sec, ch2) = (doc.new_object_id(), doc.new_object_id(), doc.new_object_id(), doc.new_object_id());
    let dest = |page: lopdf::ObjectId| Object::Array(vec![page.into(), Object::Name(b"Fit".to_vec())]);
    doc.objects.insert(ch1, Object::Dictionary(dictionary! { "Title" => Object::string_literal("Chapter 1 Basics"), "Parent" => outlines, "Next" => ch2, "First" => sec, "Last" => sec, "Count" => 1, "Dest" => dest(one) }));
    doc.objects.insert(sec, Object::Dictionary(dictionary! { "Title" => Object::string_literal("1.1 Variables"), "Parent" => ch1, "Dest" => dest(two) }));
    doc.objects.insert(ch2, Object::Dictionary(dictionary! { "Title" => Object::string_literal("Chapter 2 Ownership"), "Parent" => outlines, "Prev" => ch1, "Dest" => dest(two) }));
    doc.objects.insert(outlines, Object::Dictionary(dictionary! { "Type" => "Outlines", "First" => ch1, "Last" => ch2, "Count" => 3 }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages, "Outlines" => outlines });
    doc.trailer.set("Root", catalog);
    let info = doc.add_object(dictionary! { "Title" => Object::string_literal("Rust in Action") });
    doc.trailer.set("Info", info);
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).unwrap();

    let found = from_book("rust.pdf", &bytes).unwrap();
    assert_eq!(found.title.as_deref(), Some("Rust in Action"));
    let shape: Vec<(&str, i16, Option<i32>)> = found.units.iter().map(|u| (u.title.as_str(), u.level, u.page)).collect();
    assert_eq!(shape, [("Chapter 1 Basics", 0, Some(1)), ("1.1 Variables", 1, Some(2)), ("Chapter 2 Ownership", 0, Some(2))]);
}

#[test]
fn files_without_contents_say_what_to_do_instead() {
    let err = from_book("notes.pdf", b"%PDF-1.4 not really").unwrap_err().to_string();
    assert!(err.contains("PDF"), "{err}");
    assert!(from_book("notes.txt", b"hello").unwrap_err().to_string().contains("EPUB or PDF"));
    let empty = zip(&[("META-INF/container.xml", "<container/>", false)]);
    assert!(from_book("x.epub", &empty).is_err());
}

#[test]
fn youtube_links_and_lengths_are_read() {
    assert_eq!(playlist_id("https://www.youtube.com/playlist?list=PLabcdefghij123").as_deref(), Some("PLabcdefghij123"));
    assert_eq!(playlist_id("https://youtube.com/watch?v=x1&list=PLabcdefghij123&index=2").as_deref(), Some("PLabcdefghij123"));
    assert_eq!(playlist_id("https://youtube.com/watch?v=x1"), None);
    assert_eq!(iso_minutes("PT1H2M10S"), Some(63));
    assert_eq!(iso_minutes("PT45S"), Some(1));
    assert_eq!(iso_minutes("P0D"), None, "a live stream");
}

// ---------- Progress ----------

#[tokio::test]
async fn headings_dont_count_and_the_source_finishes_with_its_last_chapter() {
    let db = setup().await;
    let (_, source) = rust_book(&db).await;
    let added = add_units(&db, &source, vec![draft("Part I", 0), draft("Chapter 1", 1), draft("Chapter 2", 1), draft("Appendix", 0)], false, today()).await.unwrap();
    let detail = get_source(&db, &source, today()).await.unwrap();
    assert_eq!((detail.card.tally.done, detail.card.tally.total), (0, 3), "Part I is a heading");
    assert_eq!(detail.card.next.as_deref(), Some("Chapter 1"));

    for u in &added[1..] {
        set_done(&db, &u.id, true, today()).await.unwrap();
    }
    let detail = get_source(&db, &source, today()).await.unwrap();
    assert_eq!(detail.card.tally.percent, Some(100.0));
    assert_eq!(detail.card.source.finished_on, Some(today()));
    set_done(&db, &added[3].id, false, today()).await.unwrap();
    assert_eq!(get_source(&db, &source, today()).await.unwrap().card.source.finished_on, None, "undone again");
}

#[tokio::test]
async fn reviews_come_back_after_days_then_a_week_then_a_month() {
    let db = setup().await;
    let (_, source) = rust_book(&db).await;
    let unit = add_units(&db, &source, vec![draft("Lifetimes", 0)], false, today()).await.unwrap().remove(0);

    let u = review(&db, &unit.id, "later", today()).await.unwrap();
    assert_eq!((u.review_stage, u.review_on), (1, Some(day(10, 27))));
    assert!(summary(&db, today()).await.unwrap().reviews.is_empty(), "not due yet");
    assert_eq!(summary(&db, day(10, 27)).await.unwrap().reviews.len(), 1);

    let u = review(&db, &unit.id, "reviewed", day(10, 27)).await.unwrap();
    assert_eq!((u.review_stage, u.review_on), (2, Some(day(11, 3))));
    let u = review(&db, &unit.id, "reviewed", day(11, 3)).await.unwrap();
    assert_eq!((u.review_stage, u.review_on), (3, Some(day(12, 3))));
    let u = review(&db, &unit.id, "reviewed", day(12, 3)).await.unwrap();
    assert_eq!((u.review_stage, u.review_on), (0, None), "learnt");
}

#[tokio::test]
async fn the_summary_adds_up_time_streaks_and_pace() {
    let db = setup().await;
    let (_, source) = rust_book(&db).await;
    let units = add_units(&db, &source, (1..=10).map(|n| draft(&format!("Chapter {n}"), 0)).collect(), false, today()).await.unwrap();
    // Two chapters in the last four weeks: one a fortnight.
    set_done(&db, &units[0].id, true, day(10, 10)).await.unwrap();
    set_done(&db, &units[1].id, true, day(10, 23)).await.unwrap();
    for (d, minutes) in [(day(10, 22), 30), (day(10, 23), 45), (today(), 20)] {
        add_session(&db, SessionFields { source_id: source.clone(), day: d, minutes, note: String::new() }).await.unwrap();
    }

    let s = summary(&db, today()).await.unwrap();
    assert_eq!((s.today_minutes, s.week_minutes, s.week_units), (20, 95, 1));
    assert_eq!(s.streak, 3, "22nd, 23rd and today");
    assert_eq!(s.days.len(), 14);
    let card = &s.skills[0].sources[0];
    assert_eq!(card.last_studied, Some(today()));
    // 8 to go at 2 per 28 days: 112 days.
    assert_eq!(card.expected, Some(today() + chrono::Days::new(112)));
    assert_eq!(s.skills[0].tally.total_minutes, 95);
    assert_eq!(s.recent.len(), 3);

    assert!(add_session(&db, SessionFields { source_id: source.clone(), day: today(), minutes: 0, note: String::new() }).await.is_err());
}

#[tokio::test]
async fn deleting_a_skill_takes_its_sources_units_and_sessions() {
    let db = setup().await;
    let (skill, source) = rust_book(&db).await;
    add_units(&db, &source, vec![draft("Chapter 1", 0)], false, today()).await.unwrap();
    add_session(&db, SessionFields { source_id: source.clone(), day: today(), minutes: 10, note: String::new() }).await.unwrap();
    delete_skill(&db, &skill).await.unwrap();
    let s = summary(&db, today()).await.unwrap();
    assert!(s.skills.is_empty() && s.recent.is_empty());
    assert!(get_source(&db, &source, today()).await.is_err());
}

#[tokio::test]
async fn replacing_units_swaps_the_list_and_bad_input_is_refused() {
    let db = setup().await;
    let (_, source) = rust_book(&db).await;
    add_units(&db, &source, vec![draft("Old", 0)], false, today()).await.unwrap();
    add_units(&db, &source, vec![draft("New 1", 0), draft("  ", 0), draft("New 2", 0)], true, today()).await.unwrap();
    let titles: Vec<String> = get_source(&db, &source, today()).await.unwrap().units.into_iter().map(|u| u.title).collect();
    assert_eq!(titles, ["New 1", "New 2"]);
    assert!(add_units(&db, &source, vec![draft(" ", 0)], false, today()).await.is_err());
    let bad = SkillFields { name: " ".into(), icon: String::new(), color: "blue".into(), why: String::new(), archived: false };
    assert!(add_skill(&db, bad).await.is_err());
}
