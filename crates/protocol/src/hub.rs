//! The Hub: a live, global place where people walk their AI between rooms,
//! see who else is there right now, and wave, emote or say a quick phrase.
//!
//! Live only: someone's AI is in the Hub while their app is (it checks in
//! about once a second) and leaves the moment they do, or ~15 seconds after
//! their app goes quiet. Nothing's kept: presence lives in the server's memory.
//!
//! People talk with fixed phrases and emotes, never free text, so strangers
//! can meet without anything needing moderation. Both sides know them by id.
//! camelCase on the wire, like the rest of the Playground.

use serde::{Deserialize, Serialize};

use crate::playground::Player;

/// The rooms, in the order the app lists them.
pub const ROOMS: &[&str] = &["plaza", "library", "lab", "terrace", "arcade"];

/// What an AI can do.
pub const EMOTES: &[&str] = &["wave", "dance", "highfive", "heart", "laugh", "clap", "sparkle", "think"];

/// What people can say: (id, words). Friendly, and nothing to moderate.
pub const PHRASES: &[(&str, &str)] = &[
    ("hi", "Hi!"),
    ("hello", "Hello there!"),
    ("streak", "Nice streak!"),
    ("friends", "Want to be friends?"),
    ("luck", "Good luck this week!"),
    ("gg", "Well played!"),
    ("got_this", "You've got this!"),
    ("reading", "What are you reading?"),
    ("focus", "Focus mode: on."),
    ("thanks", "Thanks!"),
    ("wow", "Wow!"),
    ("bye", "See you later!"),
];

/// Most people a room holds; someone entering a full room is offered another.
pub const ROOM_CAPACITY: usize = 40;

pub fn is_room(id: &str) -> bool {
    ROOMS.contains(&id)
}

/// Body of `HUB_ENTER` and `HUB_SYNC`: where you are. Positions are shares of the room's floor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubWhere {
    pub room: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActKind {
    Emote,
    Phrase,
}

/// Body of `HUB_ACT`: an emote or phrase, to the room, maybe aimed at someone.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubAct {
    pub kind: ActKind,
    /// From `EMOTES` or `PHRASES`.
    pub id: String,
    /// Someone in the room it's for (they're told).
    #[serde(default)]
    pub to: Option<String>,
}

/// An emote or phrase someone's showing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shown {
    pub kind: ActKind,
    pub id: String,
    /// How long ago, in ms: the app shows it for a few seconds.
    pub age: u32,
    pub to: Option<String>,
}

/// Someone in your room.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubPerson {
    pub player: Player,
    pub x: f32,
    pub y: f32,
    pub shown: Option<Shown>,
}

/// Something someone did to you: a wave, a hi.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubEvent {
    pub id: u64,
    pub from: Player,
    pub kind: ActKind,
    pub item: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomCount {
    pub id: String,
    pub count: u32,
}

/// What `HUB_ENTER` and `HUB_SYNC` return: your room as it is now.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubState {
    /// Where you are (a full room on entering puts you somewhere else).
    pub room: String,
    /// Everyone else in it.
    pub people: Vec<HubPerson>,
    pub rooms: Vec<RoomCount>,
    pub online: u32,
    /// Done to you since you last checked in.
    pub events: Vec<HubEvent>,
}

/// What `HUB_PEEK` returns: a look in without entering (the overview tile).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubPeek {
    pub online: u32,
    pub rooms: Vec<RoomCount>,
    /// Some of who's in the plaza.
    pub plaza: Vec<HubPerson>,
}

/// Checks a position is on the floor.
pub fn on_floor(x: f32, y: f32) -> bool {
    (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y)
}
