//! Tests for the Reading Tracker against a throwaway in-memory database, and
//! Open Library against a stand-in server.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use serde_json::json;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::library::{as_isbn, OpenLibrary};
use super::service::*;
use super::types::{BookFields, EditionChoice, NewBook, NoteFields};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
}

const TODAY: u32 = 22;

fn new_book(title: &str, pages: Option<i32>, status: &str) -> NewBook {
    NewBook {
        title: title.into(),
        authors: "Andy Weir".into(),
        work_key: Some(format!("/works/{title}")),
        api_pages: pages,
        format: "print".into(),
        status: status.into(),
        ..Default::default()
    }
}

fn fields_of(card: &super::types::BookCard) -> BookFields {
    let b = &card.book;
    BookFields {
        title: b.title.clone(),
        authors: b.authors.clone(),
        cover_url: b.cover_url.clone(),
        pages: b.pages,
        format: b.format.clone(),
        unit: b.unit.clone(),
        audio_minutes: b.audio_minutes,
        rating: b.rating,
        review: b.review.clone(),
        started_on: b.started_on,
        finished_on: b.finished_on,
    }
}

#[tokio::test]
async fn adding_a_book_twice_is_refused() {
    let db = setup().await;
    let added = add_book(&db, new_book("Hail Mary", Some(496), "want"), day(TODAY)).await.unwrap();
    assert_eq!((added.book.status.as_str(), added.total, added.book.started_on), ("want", Some(496), None));
    let again = add_book(&db, new_book("Hail Mary", Some(496), "reading"), day(TODAY)).await;
    assert!(again.unwrap_err().to_string().contains("already in your library"));
}

#[tokio::test]
async fn your_page_count_overrides_open_library() {
    let db = setup().await;
    let added = add_book(&db, new_book("Hail Mary", Some(496), "reading"), day(TODAY)).await.unwrap();
    let card = log_progress(&db, &added.book.id, 300, None, day(TODAY)).await.unwrap();
    assert_eq!(card.total, Some(496));

    let mut fields = fields_of(&card);
    fields.pages = Some(250);
    let card = update_book(&db, &added.book.id, fields, day(TODAY)).await.unwrap();
    assert_eq!((card.total, card.book.api_pages), (Some(250), Some(496)), "yours wins, Open Library's is kept");
    assert_eq!(card.book.progress, 250, "can't be past the end of a shorter book");

    let card = choose_edition(
        &db,
        &added.book.id,
        EditionChoice { edition_key: "/books/OL1M".into(), pages: Some(517), cover_url: None, isbn: Some("9789401614085".into()) },
        day(TODAY),
    )
    .await
    .unwrap();
    assert_eq!((card.book.api_pages, card.total), (Some(517), Some(250)), "an edition doesn't undo your own count");
}

#[tokio::test]
async fn progress_starts_logs_and_finishes_a_book() {
    let db = setup().await;
    let id = add_book(&db, new_book("Hail Mary", Some(400), "want"), day(10)).await.unwrap().book.id;

    let card = log_progress(&db, &id, 40, Some(30), day(20)).await.unwrap();
    assert_eq!((card.book.status.as_str(), card.book.started_on), ("reading", Some(day(20))), "starting a book from the want list");
    // More the same day adds to the same entry in the log.
    log_progress(&db, &id, 100, Some(20), day(20)).await.unwrap();
    let card = log_progress(&db, &id, 200, None, day(21)).await.unwrap();
    assert_eq!(card.percent, Some(50.0));

    let detail = get_book(&db, &id, day(21)).await.unwrap();
    let log: Vec<(i32, i32, i32, i32)> = detail.sessions.iter().map(|s| (s.start_progress, s.end_progress, s.pages, s.minutes)).collect();
    assert_eq!(log, vec![(100, 200, 100, 0), (0, 100, 100, 50)]);
    // 200 pages over two days: 100 a day, 200 to go.
    assert_eq!(detail.card.finish_estimate, Some(day(23)));

    let card = log_progress(&db, &id, 999, None, day(TODAY)).await.unwrap();
    assert_eq!((card.book.progress, card.book.status.as_str(), card.book.finished_on), (400, "finished", Some(day(TODAY))));
}

#[tokio::test]
async fn ebooks_in_percent_still_count_pages() {
    let db = setup().await;
    let mut book = new_book("Kindle", Some(300), "reading");
    book.format = "ebook".into();
    let id = add_book(&db, book, day(TODAY)).await.unwrap().book.id;
    let card = log_progress(&db, &id, 150, None, day(TODAY)).await.unwrap();
    assert_eq!((card.book.unit.as_str(), card.book.progress, card.total), ("percent", 100, Some(100)), "percent stops at 100");

    let detail = get_book(&db, &id, day(TODAY)).await.unwrap();
    assert_eq!(detail.sessions[0].pages, 300);

    // Switching a half-read ebook to pages keeps your place.
    let mut b = new_book("Kobo", Some(300), "reading");
    b.format = "ebook".into();
    let id = add_book(&db, b, day(TODAY)).await.unwrap().book.id;
    let card = log_progress(&db, &id, 50, None, day(TODAY)).await.unwrap();
    let mut fields = fields_of(&card);
    fields.unit = "pages".into();
    let card = update_book(&db, &id, fields, day(TODAY)).await.unwrap();
    assert_eq!((card.book.unit.as_str(), card.book.progress), ("pages", 150));
}

#[tokio::test]
async fn audiobooks_count_minutes_listened() {
    let db = setup().await;
    let mut book = new_book("Audio", None, "reading");
    book.format = "audio".into();
    book.audio_minutes = Some(600);
    let id = add_book(&db, book, day(TODAY)).await.unwrap().book.id;
    let card = log_progress(&db, &id, 90, None, day(TODAY)).await.unwrap();
    assert_eq!((card.book.unit.as_str(), card.total), ("minutes", Some(600)));
    let stats = stats(&db, 2026, day(TODAY)).await.unwrap();
    assert_eq!((stats.listened_minutes, stats.pages), (90, 0));
}

#[tokio::test]
async fn shelves_keep_dates_sensible_and_rereads_keep_history() {
    let db = setup().await;
    let id = add_book(&db, new_book("Dune", Some(600), "reading"), day(1)).await.unwrap().book.id;
    let card = set_status(&db, &id, "finished", day(15)).await.unwrap();
    assert_eq!((card.book.started_on, card.book.finished_on, card.book.progress), (Some(day(1)), Some(day(15)), 600));

    let card = read_again(&db, &id, day(TODAY)).await.unwrap();
    assert_eq!((card.book.status.as_str(), card.book.progress, card.book.started_on, card.book.finished_on), ("reading", 0, Some(day(TODAY)), None));
    let detail = get_book(&db, &id, day(TODAY)).await.unwrap();
    assert_eq!(detail.reads.len(), 1);
    assert_eq!((detail.reads[0].started_on, detail.reads[0].finished_on), (Some(day(1)), Some(day(15))));

    let card = set_status(&db, &id, "dnf", day(TODAY)).await.unwrap();
    assert_eq!(card.book.finished_on, Some(day(TODAY)));
    let card = set_status(&db, &id, "want", day(TODAY)).await.unwrap();
    assert_eq!((card.book.started_on, card.book.finished_on), (None, None));

    assert!(read_again(&db, &id, day(TODAY)).await.is_err(), "only finished books are read again");
}

#[tokio::test]
async fn notes_need_text_bookmarks_need_a_page_and_search_finds_both() {
    let db = setup().await;
    let id = add_book(&db, new_book("Hail Mary", Some(496), "reading"), day(TODAY)).await.unwrap().book.id;
    let note = |kind: &str, page: Option<i32>, text: &str| NoteFields { kind: kind.into(), page, text: text.into() };

    assert!(add_note(&db, &id, note("bookmark", None, "")).await.is_err());
    assert!(add_note(&db, &id, note("quote", Some(3), "  ")).await.is_err());
    add_note(&db, &id, note("quote", Some(120), "Fist my bump")).await.unwrap();
    add_note(&db, &id, note("bookmark", Some(42), "")).await.unwrap();
    add_note(&db, &id, note("note", None, "Rocky is the best")).await.unwrap();

    let pages: Vec<Option<i32>> = get_book(&db, &id, day(TODAY)).await.unwrap().notes.iter().map(|n| n.page).collect();
    assert_eq!(pages, vec![Some(42), Some(120), None], "page order, unpaged last");

    let hits = search_notes(&db, "rocky").await.unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(search_notes(&db, "hail").await.unwrap().len(), 3, "matching the book's title finds all its notes");

    delete_book(&db, &id).await.unwrap();
    assert!(search_notes(&db, "").await.unwrap().is_empty(), "a deleted book's notes go with it");
}

#[tokio::test]
async fn goal_streaks_and_stats() {
    let db = setup().await;
    set_goal(&db, 2026, 24).await.unwrap();
    let a = add_book(&db, new_book("A", Some(100), "reading"), day(1)).await.unwrap().book.id;
    let b = add_book(&db, new_book("B", Some(100), "reading"), day(1)).await.unwrap().book.id;
    log_progress(&db, &a, 100, None, day(19)).await.unwrap();
    log_progress(&db, &b, 30, None, day(20)).await.unwrap();
    log_progress(&db, &b, 60, None, day(21)).await.unwrap();
    let mut fields = fields_of(&get_book(&db, &a, day(TODAY)).await.unwrap().card);
    fields.rating = Some(9);
    update_book(&db, &a, fields, day(TODAY)).await.unwrap();

    let summary = summary(&db, day(TODAY)).await.unwrap();
    assert_eq!(summary.streak, 3, "19th to 21st; today isn't over yet");
    assert_eq!((summary.goal.books, summary.goal.finished), (Some(24), 1));
    assert_eq!(summary.reading.len(), 1);
    assert_eq!((summary.shelves.reading, summary.shelves.finished), (1, 1));
    assert!((summary.goal.expected - 24.0 * 295.0 / 365.0).abs() < 0.01);

    let stats = stats(&db, 2026, day(TODAY)).await.unwrap();
    assert_eq!((stats.pages, stats.months[9].pages, stats.months[9].books), (160, 160, 1));
    assert_eq!((stats.longest_streak, stats.reading_days), (3, 3));
    assert_eq!(stats.average_rating, Some(4.5));
    assert_eq!(stats.finished[0].days, Some(19));

    set_goal(&db, 2026, 0).await.unwrap();
    assert_eq!(super::service::summary(&db, day(TODAY)).await.unwrap().goal.books, None);
    set_goal(&db, 2026, 12).await.unwrap();
    assert_eq!(super::service::summary(&db, day(TODAY)).await.unwrap().goal.books, Some(12), "a cleared goal can be set again");
}

#[tokio::test]
async fn want_to_read_keeps_your_order() {
    let db = setup().await;
    let mut ids = Vec::new();
    for t in ["A", "B", "C"] {
        ids.push(add_book(&db, new_book(t, None, "want"), day(TODAY)).await.unwrap().book.id);
    }
    move_book(&db, &ids[2], Some(&ids[0]), day(TODAY)).await.unwrap();
    let order: Vec<String> = list_books(&db, day(TODAY)).await.unwrap().into_iter().map(|c| c.book.title).collect();
    assert_eq!(order, vec!["C", "A", "B"]);
}

#[test]
fn isbns_are_recognised() {
    assert_eq!(as_isbn("978-0-593-13520-4").as_deref(), Some("9780593135204"));
    assert_eq!(as_isbn("0 593 13522 x").as_deref(), Some("059313522X"));
    assert_eq!(as_isbn("Project Hail Mary"), None);
    assert_eq!(as_isbn("12345"), None);
}

#[tokio::test]
async fn search_reads_open_library() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/search.json"))
        .and(query_param("q", "hail mary"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "docs": [{
            "key": "/works/OL21745884W", "title": "Project Hail Mary", "author_name": ["Andy Weir"],
            "cover_i": 11200092, "number_of_pages_median": 496, "first_publish_year": 2021, "edition_count": 32
        }, { "key": "/works/OL2W", "title": "No cover", "cover_i": -1 }]})))
        .mount(&server)
        .await;
    let library = OpenLibrary::with_urls(&server.uri(), "https://covers.example", None);
    let found = library.search("hail mary").await.unwrap();
    assert_eq!(found.len(), 2);
    assert_eq!(found[0].title, "Project Hail Mary");
    assert_eq!((found[0].pages, found[0].year, found[0].editions), (Some(496), Some(2021), 32));
    assert_eq!(found[0].cover_url.as_deref(), Some("https://covers.example/b/id/11200092-M.jpg"));
    assert_eq!(found[1].cover_url, None);
}

#[tokio::test]
async fn an_isbn_finds_that_exact_edition() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/search.json"))
        .and(query_param("q", "isbn:9780593135204"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "docs": [{
            "key": "/works/OL21745884W", "title": "Project Hail Mary", "cover_i": 1, "number_of_pages_median": 496
        }]})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/isbn/9780593135204.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "key": "/books/OL30036715M", "number_of_pages": 497, "covers": [-1, 12455001] })))
        .mount(&server)
        .await;
    let library = OpenLibrary::with_urls(&server.uri(), "https://covers.example", None);
    let found = library.search("978-0593135204").await.unwrap();
    assert_eq!(found[0].edition_key.as_deref(), Some("/books/OL30036715M"));
    assert_eq!((found[0].pages, found[0].isbn.as_deref()), (Some(497), Some("9780593135204")));
    assert_eq!(found[0].cover_url.as_deref(), Some("https://covers.example/b/id/12455001-M.jpg"));
}

#[tokio::test]
async fn editions_with_page_counts_come_first() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/works/OL1W/editions.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "entries": [
            { "key": "/books/A", "title": "No pages", "languages": [{ "key": "/languages/spa" }] },
            { "key": "/books/B", "title": "Paperback", "number_of_pages": 497, "physical_format": "Paperback",
              "publishers": ["Ballantine"], "isbn_10": ["0593135229"], "isbn_13": ["9780593135228"], "languages": [{ "key": "/languages/eng" }] }
        ]})))
        .mount(&server)
        .await;
    let library = OpenLibrary::with_urls(&server.uri(), "https://covers.example", None);
    let editions = library.editions("/works/OL1W").await.unwrap();
    assert_eq!(editions[0].key, "/books/B");
    assert_eq!((editions[0].pages, editions[0].isbn.as_deref(), editions[0].language.as_deref()), (Some(497), Some("9780593135228"), Some("eng")));
    assert_eq!(editions[1].language.as_deref(), Some("spa"));
    assert!(library.editions("/../../etc").await.is_err());
}

#[tokio::test]
async fn covers_are_cached_on_disk() {
    let server = MockServer::start().await;
    let jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];
    Mock::given(method("GET"))
        .and(path("/b/id/5-L.jpg"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET")).and(path("/page.html")).respond_with(ResponseTemplate::new(200).set_body_string("<html>")).mount(&server).await;
    let dir = std::env::temp_dir().join(format!("axiom-covers-{}", crate::db::new_id()));
    let library = OpenLibrary::with_urls(&server.uri(), &server.uri(), Some(dir.clone()));
    let url = format!("{}/b/id/5-L.jpg", server.uri());
    let first = library.cover_image(&url).await.unwrap();
    assert!(first.starts_with("data:image/jpeg;base64,"));
    assert_eq!(library.cover_image(&url).await.unwrap(), first, "the second time comes from disk");
    assert!(library.cover_image(&format!("{}/page.html", server.uri())).await.is_err(), "only images");
    assert!(library.cover_image("file:///C:/secret.jpg").await.is_err());
    let _ = std::fs::remove_dir_all(dir);
}
