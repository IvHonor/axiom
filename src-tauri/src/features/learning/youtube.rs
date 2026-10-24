//! Importing a YouTube playlist: each video becomes a unit, with its length.
//!
//! Uses the YouTube Data API with a key built into the app
//! (`AXIOM_YOUTUBE_API_KEY`, see `build.rs`). Without one, the import isn't
//! offered. A playlist page costs 1 unit of the free 10,000 a day.

use serde::Deserialize;

use super::types::{Draft, Found};
use crate::error::{Error, Result};

const KEY: &str = match option_env!("AXIOM_YOUTUBE_API_KEY") {
    Some(key) => key,
    None => "",
};
const API: &str = "https://www.googleapis.com/youtube/v3";
/// The most videos one import takes (ten pages).
const MAX_VIDEOS: usize = 500;

pub fn available() -> bool {
    !KEY.is_empty()
}

/// The playlist's id from a link ("…/playlist?list=PL…", "…watch?v=…&list=PL…")
/// or the id itself.
pub fn playlist_id(link: &str) -> Option<String> {
    let link = link.trim();
    let id = match link.split_once("list=") {
        Some((_, rest)) => rest.split(['&', '#']).next().unwrap_or(""),
        None if !link.contains('/') => link,
        None => "",
    };
    (id.len() >= 10 && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')).then(|| id.to_owned())
}

#[derive(Deserialize)]
struct Page<T> {
    items: Vec<T>,
    #[serde(rename = "nextPageToken")]
    next: Option<String>,
}

#[derive(Deserialize)]
struct Playlist {
    snippet: PlaylistSnippet,
}

#[derive(Deserialize)]
struct PlaylistSnippet {
    title: String,
    #[serde(rename = "channelTitle")]
    channel: String,
}

#[derive(Deserialize)]
struct Item {
    snippet: ItemSnippet,
    #[serde(rename = "contentDetails")]
    details: ItemDetails,
}

#[derive(Deserialize)]
struct ItemSnippet {
    title: String,
}

#[derive(Deserialize)]
struct ItemDetails {
    #[serde(rename = "videoId")]
    video: String,
}

#[derive(Deserialize)]
struct Video {
    id: String,
    #[serde(rename = "contentDetails")]
    details: VideoDetails,
}

#[derive(Deserialize)]
struct VideoDetails {
    duration: String,
}

async fn get<T: for<'de> Deserialize<'de>>(http: &reqwest::Client, path: &str, query: &[(&str, &str)]) -> Result<T> {
    let failed = || Error::Invalid("Couldn't reach YouTube. Check your internet connection and try again.".into());
    let response = http.get(format!("{API}/{path}")).query(query).query(&[("key", KEY)]).send().await.map_err(|_| failed())?;
    match response.status().as_u16() {
        200 => response.json().await.map_err(|_| failed()),
        404 => Err(Error::Invalid("That playlist doesn't exist, or it's private.".into())),
        403 => Err(Error::Invalid("YouTube's daily limit for Axiom has been reached. Try again tomorrow, or paste the list instead.".into())),
        _ => Err(failed()),
    }
}

/// Every video in a playlist, in order, with lengths.
pub async fn playlist(link: &str) -> Result<Found> {
    if !available() {
        return Err(Error::Invalid("YouTube import isn't set up in this copy of Axiom.".into()));
    }
    let id = playlist_id(link).ok_or_else(|| Error::Invalid("That doesn't look like a YouTube playlist link. It should contain \"list=\".".into()))?;
    let http = reqwest::Client::new();

    let about: Page<Playlist> = get(&http, "playlists", &[("part", "snippet"), ("id", &id)]).await?;
    let about = about.items.into_iter().next().ok_or_else(|| Error::Invalid("That playlist doesn't exist, or it's private.".into()))?;

    let mut items: Vec<Item> = Vec::new();
    let mut token: Option<String> = None;
    loop {
        let mut query = vec![("part", "snippet,contentDetails"), ("playlistId", id.as_str()), ("maxResults", "50")];
        if let Some(t) = &token {
            query.push(("pageToken", t));
        }
        let page: Page<Item> = get(&http, "playlistItems", &query).await?;
        items.extend(page.items);
        token = page.next;
        if token.is_none() || items.len() >= MAX_VIDEOS {
            break;
        }
    }
    // Deleted and private videos stay in a playlist under these titles.
    items.retain(|i| !matches!(i.snippet.title.as_str(), "Deleted video" | "Private video"));
    items.truncate(MAX_VIDEOS);

    let mut minutes = std::collections::HashMap::new();
    for chunk in items.chunks(50) {
        let ids: Vec<&str> = chunk.iter().map(|i| i.details.video.as_str()).collect();
        let page: Page<Video> = get(&http, "videos", &[("part", "contentDetails"), ("id", &ids.join(","))]).await?;
        for v in page.items {
            if let Some(m) = iso_minutes(&v.details.duration) {
                minutes.insert(v.id, m);
            }
        }
    }
    let units = items
        .into_iter()
        .map(|i| Draft { minutes: minutes.get(&i.details.video).copied(), title: i.snippet.title, level: 0, page: None })
        .collect();
    Ok(Found { title: Some(about.snippet.title), author: Some(about.snippet.channel).filter(|c| !c.is_empty()), units })
}

/// "PT1H2M10S" → 63 minutes (rounded up). None for a live stream's "P0D".
pub fn iso_minutes(duration: &str) -> Option<i32> {
    let time = duration.strip_prefix("PT").or_else(|| duration.split_once('T').map(|(_, t)| t))?;
    let (mut seconds, mut number) = (0i64, String::new());
    for c in time.chars() {
        if c.is_ascii_digit() {
            number.push(c);
            continue;
        }
        let n: i64 = number.parse().ok()?;
        number.clear();
        seconds += n * match c {
            'H' => 3600,
            'M' => 60,
            'S' => 1,
            _ => return None,
        };
    }
    let days: i64 = duration.strip_prefix('P').and_then(|d| d.split_once('D')).and_then(|(d, _)| d.parse().ok()).unwrap_or(0);
    let total = seconds + days * 86_400;
    (total > 0).then(|| ((total + 59) / 60) as i32)
}
