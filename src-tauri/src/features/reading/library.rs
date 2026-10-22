//! Finding books on Open Library (openlibrary.org): free, no key needed.
//!
//! Open Library asks apps to name themselves in the User-Agent, which lifts
//! the limit from one request a second to three. Covers are looked up by
//! cover id, which isn't rate limited, and kept on disk so the library
//! shows them offline.

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};

const USER_AGENT: &str = concat!("Axiom/", env!("CARGO_PKG_VERSION"), " (https://github.com/IvHonor/axiom)");
const SEARCH_FIELDS: &str = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year,edition_count";
const MAX_COVER_BYTES: usize = 8 * 1024 * 1024;

/// Kept in Tauri's managed state.
pub struct OpenLibrary {
    http: reqwest::Client,
    api: String,
    covers: String,
    /// Where covers are kept; None keeps nothing (tests).
    cache: Option<PathBuf>,
}

/// A book found by a search.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub work_key: String,
    /// Set when the search was an ISBN: that exact edition.
    pub edition_key: Option<String>,
    pub title: String,
    pub authors: String,
    pub year: Option<i32>,
    /// The edition's own count for an ISBN, otherwise the median of all editions.
    pub pages: Option<i32>,
    pub cover_url: Option<String>,
    pub isbn: Option<String>,
    pub editions: i32,
}

/// One edition of a book, to pick yours.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edition {
    pub key: String,
    pub title: String,
    pub pages: Option<i32>,
    pub cover_url: Option<String>,
    pub publisher: Option<String>,
    pub published: Option<String>,
    pub format: Option<String>,
    pub isbn: Option<String>,
    /// e.g. "eng".
    pub language: Option<String>,
}

#[derive(Deserialize)]
struct SearchPage {
    #[serde(default)]
    docs: Vec<SearchDoc>,
}

#[derive(Deserialize)]
struct SearchDoc {
    key: String,
    #[serde(default)]
    title: String,
    author_name: Option<Vec<String>>,
    cover_i: Option<i64>,
    number_of_pages_median: Option<i32>,
    first_publish_year: Option<i32>,
    edition_count: Option<i32>,
}

#[derive(Deserialize)]
struct EditionsPage {
    #[serde(default)]
    entries: Vec<EditionDoc>,
}

#[derive(Deserialize)]
struct EditionDoc {
    key: String,
    #[serde(default)]
    title: String,
    number_of_pages: Option<i32>,
    covers: Option<Vec<i64>>,
    publishers: Option<Vec<String>>,
    publish_date: Option<String>,
    physical_format: Option<String>,
    isbn_13: Option<Vec<String>>,
    isbn_10: Option<Vec<String>>,
    languages: Option<Vec<KeyRef>>,
}

#[derive(Deserialize)]
struct KeyRef {
    key: String,
}

/// The digits of an ISBN-10 or -13 typed with or without dashes and spaces.
pub fn as_isbn(query: &str) -> Option<String> {
    let digits: String = query.chars().filter(|c| !matches!(c, '-' | ' ')).collect::<String>().to_uppercase();
    let valid = match digits.len() {
        10 => digits[..9].chars().all(|c| c.is_ascii_digit()) && digits[9..].chars().all(|c| c.is_ascii_digit() || c == 'X'),
        13 => digits.chars().all(|c| c.is_ascii_digit()),
        _ => false,
    };
    valid.then_some(digits)
}

fn offline(err: reqwest::Error) -> Error {
    eprintln!("reading: open library: {err}");
    Error::Invalid("Couldn't reach Open Library. Check your internet connection and try again.".into())
}

impl OpenLibrary {
    pub fn new(cache: Option<PathBuf>) -> Self {
        Self::with_urls("https://openlibrary.org", "https://covers.openlibrary.org", cache)
    }

    pub fn with_urls(api: &str, covers: &str, cache: Option<PathBuf>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(USER_AGENT)
            .build()
            .expect("an HTTP client with default settings");
        Self { http, api: api.trim_end_matches('/').into(), covers: covers.trim_end_matches('/').into(), cache }
    }

    fn cover(&self, id: Option<i64>, size: char) -> Option<String> {
        id.filter(|id| *id > 0).map(|id| format!("{}/b/id/{id}-{size}.jpg", self.covers))
    }

    async fn get<T: for<'de> Deserialize<'de>>(&self, url: &str, query: &[(&str, &str)]) -> Result<Option<T>> {
        let response = self.http.get(url).query(query).send().await.map_err(offline)?;
        match response.status().as_u16() {
            200 => Ok(Some(response.json().await.map_err(offline)?)),
            404 => Ok(None),
            429 | 503 => Err(Error::Invalid("Open Library is busy right now. Try again in a moment.".into())),
            code => Err(Error::Invalid(format!("Open Library couldn't search just now (error {code}). Try again later."))),
        }
    }

    /// Books matching a title, author or ISBN, best first.
    pub async fn search(&self, query: &str) -> Result<Vec<Found>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let isbn = as_isbn(query);
        let q = isbn.as_ref().map_or_else(|| query.to_owned(), |i| format!("isbn:{i}"));
        let page: SearchPage = self
            .get(&format!("{}/search.json", self.api), &[("q", &q), ("fields", SEARCH_FIELDS), ("limit", "20")])
            .await?
            .unwrap_or(SearchPage { docs: Vec::new() });
        let mut found: Vec<Found> = page
            .docs
            .into_iter()
            .filter(|d| d.key.starts_with("/works/") && !d.title.is_empty())
            .map(|d| Found {
                cover_url: self.cover(d.cover_i, 'M'),
                work_key: d.key,
                edition_key: None,
                title: d.title,
                authors: d.author_name.unwrap_or_default().join(", "),
                year: d.first_publish_year,
                pages: d.number_of_pages_median,
                isbn: None,
                editions: d.edition_count.unwrap_or(1),
            })
            .collect();

        // For an ISBN, that exact edition's pages and cover beat the work's.
        if let (Some(isbn), Some(first)) = (isbn, found.first_mut()) {
            if let Some(edition) = self.get::<EditionDoc>(&format!("{}/isbn/{isbn}.json", self.api), &[]).await.ok().flatten() {
                first.edition_key = Some(edition.key);
                first.pages = edition.number_of_pages.or(first.pages);
                first.cover_url = self.cover(edition.covers.and_then(|c| c.into_iter().find(|id| *id > 0)), 'M').or(first.cover_url.take());
            }
            first.isbn = Some(isbn);
        }
        Ok(found)
    }

    /// A work's editions, the ones with a page count first.
    pub async fn editions(&self, work_key: &str) -> Result<Vec<Edition>> {
        if !work_key.starts_with("/works/") || work_key.contains("..") {
            return Err(Error::Invalid("That isn't an Open Library book.".into()));
        }
        let page: EditionsPage = self
            .get(&format!("{}{work_key}/editions.json", self.api), &[("limit", "100")])
            .await?
            .unwrap_or(EditionsPage { entries: Vec::new() });
        let mut editions: Vec<Edition> = page
            .entries
            .into_iter()
            .map(|e| Edition {
                cover_url: self.cover(e.covers.and_then(|c| c.into_iter().find(|id| *id > 0)), 'M'),
                key: e.key,
                title: e.title,
                pages: e.number_of_pages.filter(|p| *p > 0),
                publisher: e.publishers.and_then(|p| p.into_iter().next()),
                published: e.publish_date,
                format: e.physical_format,
                isbn: e.isbn_13.and_then(|i| i.into_iter().next()).or(e.isbn_10.and_then(|i| i.into_iter().next())),
                language: e.languages.and_then(|l| l.into_iter().next()).map(|l| l.key.trim_start_matches("/languages/").to_owned()),
            })
            .collect();
        editions.sort_by_key(|e| e.pages.is_none());
        Ok(editions)
    }

    /// A cover image as a data URL, from the disk cache or downloaded once.
    pub async fn cover_image(&self, url: &str) -> Result<String> {
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(Error::Invalid("A cover has to be a web address.".into()));
        }
        let file = self.cache.as_ref().map(|dir| dir.join(format!("{:x}", Sha256::digest(url.as_bytes()))));
        if let Some(bytes) = file.as_ref().and_then(|f| std::fs::read(f).ok()) {
            return Ok(data_url(&bytes));
        }
        let response = self.http.get(url).send().await.map_err(offline)?;
        if !response.status().is_success() {
            return Err(Error::Invalid("That cover isn't available.".into()));
        }
        let bytes = response.bytes().await.map_err(offline)?;
        if bytes.len() > MAX_COVER_BYTES || image_type(&bytes).is_none() {
            return Err(Error::Invalid("That address isn't an image.".into()));
        }
        if let Some(file) = file {
            if let Some(dir) = file.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(&file, &bytes);
        }
        Ok(data_url(&bytes))
    }
}

fn image_type(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xD8, ..] => Some("image/jpeg"),
        [0x89, b'P', b'N', b'G', ..] => Some("image/png"),
        [b'G', b'I', b'F', ..] => Some("image/gif"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("image/webp"),
        _ => None,
    }
}

fn data_url(bytes: &[u8]) -> String {
    let mime = image_type(bytes).unwrap_or("image/jpeg");
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}
