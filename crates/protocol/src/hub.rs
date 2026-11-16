//! The Hub, now Nexus: a live, global 3D city where people walk their AI
//! between districts, see who else is near right now, and wave, emote or say
//! a quick phrase.
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

/// Nexus's districts: (id, centre x, centre z, radius), in metres on the city
/// map (x east, z south). The app's map (src/features/playground/nexus/world.ts)
/// has the same, and a test keeps the two together.
pub const DISTRICTS: &[(&str, f32, f32, f32)] = &[
    ("nexus", 0.0, 0.0, 52.0),
    ("memory", -145.0, -78.0, 62.0),
    ("computation", 145.0, -78.0, 62.0),
    ("simulation", 132.0, 120.0, 62.0),
    ("gardens", -132.0, 120.0, 62.0),
];

/// The buildings you can go inside: (id, the district it's in, half its width,
/// half its depth), in metres from the middle of the room. Inside, you see only
/// who's inside with you. The app's are in src/features/playground/nexus/interiors.ts.
pub const INTERIORS: &[(&str, &str, f32, f32)] =
    &[("library", "memory", 32.0, 22.0), ("core", "computation", 26.0, 20.0), ("observatory", "simulation", 24.0, 24.0), ("forge", "gardens", 26.0, 22.0)];

/// The city runs this far from the middle each way.
pub const HALF: f32 = 230.0;

/// You see everyone within this many metres: your district, and the Nexus
/// between it and the rest.
pub const VIEW: f32 = 200.0;

/// Most people you're sent at once (the nearest).
pub const MAX_SEEN: usize = 40;

/// Most people in Nexus at once.
pub const CAPACITY: usize = 400;

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

/// The district someone's in: the building's, if they're inside one.
pub fn district_of(x: f32, z: f32, inside: Option<&str>) -> Option<&'static str> {
    match inside {
        Some(id) => INTERIORS.iter().find(|i| i.0 == id).map(|i| i.1),
        None => district_at(x, z),
    }
}

/// The district a spot's in, if any (the roads between are none).
pub fn district_at(x: f32, z: f32) -> Option<&'static str> {
    DISTRICTS.iter().find(|(_, cx, cz, r)| (x - cx).hypot(z - cz) <= *r).map(|(id, ..)| *id)
}

/// Body of `HUB_ENTER` and `HUB_SYNC`: where you are, in metres on the city map.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubWhere {
    pub x: f32,
    pub z: f32,
    /// The building you're inside (from `INTERIORS`), with `x` and `z` from its
    /// middle; none out in the city.
    #[serde(default)]
    pub inside: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActKind {
    Emote,
    Phrase,
}

/// Body of `HUB_ACT`: an emote or phrase, for everyone near, maybe aimed at someone.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubAct {
    pub kind: ActKind,
    /// From `EMOTES` or `PHRASES`.
    pub id: String,
    /// Someone near you it's for (they're told).
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

/// Someone near you.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubPerson {
    pub player: Player,
    pub x: f32,
    pub z: f32,
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
pub struct DistrictCount {
    pub id: String,
    pub count: u32,
}

/// What `HUB_ENTER` and `HUB_SYNC` return: who's around you now.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubState {
    /// Everyone else within `VIEW`, nearest first (at most `MAX_SEEN`).
    pub people: Vec<HubPerson>,
    /// How many are in each district.
    pub districts: Vec<DistrictCount>,
    pub online: u32,
    /// Done to you since you last checked in.
    pub events: Vec<HubEvent>,
}

/// What `HUB_PEEK` returns: a look in without entering (the overview tile).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubPeek {
    pub online: u32,
    pub districts: Vec<DistrictCount>,
    /// Some of who's in the Nexus itself.
    pub nexus: Vec<HubPerson>,
}

/// Checks a position is in the city.
pub fn in_city(x: f32, z: f32) -> bool {
    x.is_finite() && z.is_finite() && x.abs() <= HALF && z.abs() <= HALF
}

/// Checks a position is somewhere: in the city, or inside a known building.
pub fn somewhere(w: &HubWhere) -> bool {
    match &w.inside {
        None => in_city(w.x, w.z),
        Some(id) => INTERIORS.iter().any(|(i, _, half_w, half_d)| i == id && w.x.is_finite() && w.z.is_finite() && w.x.abs() <= *half_w && w.z.abs() <= *half_d),
    }
}
