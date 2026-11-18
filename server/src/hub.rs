//! Nexus's live presence (see `axiom_protocol::hub`). Everything's in memory:
//! who's where in the city, what they're showing, and what's been done to them
//! since they last checked in. Nothing touches the database after entering, so
//! a city full of people checking in every second costs nothing but memory.
//! Each check-in sends back only who's near you (within `VIEW`, the nearest
//! `MAX_SEEN`). Someone quiet for `timeout` is gone.
//!
//! People who've blocked each other (see `playground::block`) don't see each
//! other here, and can't reach each other. A building holds `ROOM_CAPACITY`,
//! and nobody moves faster than `MAX_SPEED` between check-ins.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axiom_protocol::hub::{
    ActKind, CAPACITY, DISTRICTS, DistrictCount, EMOTES, HubAct, HubEvent, HubPeek, HubPerson, HubState, HubWhere, MAX_SEEN, MAX_SPEED, PHRASES,
    ROOM_CAPACITY, Shown, VIEW,
    district_at, district_of, somewhere,
};
use axiom_protocol::playground::Player;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::ApiError;

/// How long an emote or phrase stays up.
const SHOW: Duration = Duration::from_secs(5);
/// Most waves and hi's waiting for someone.
const MAX_EVENTS: usize = 20;
/// Most people the peek into the Nexus shows.
const PEEK: usize = 12;

struct Presence {
    player: Player,
    x: f32,
    z: f32,
    /// The building they're inside, if any (`x` and `z` are then from its middle).
    inside: Option<String>,
    shown: Option<(ActKind, String, Instant, Option<String>)>,
    seen: Instant,
    /// When `x` and `z` last changed, for `MAX_SPEED`.
    moved: Instant,
    events: Vec<HubEvent>,
    /// People blocked either way: neither sees nor reaches the other.
    hidden: HashSet<String>,
}

pub struct Hub {
    people: Mutex<HashMap<String, Presence>>,
    next_event: Mutex<u64>,
    /// Quiet this long and you've left.
    timeout: Duration,
}

impl Default for Hub {
    fn default() -> Self {
        Self::with_timeout(Duration::from_secs(15))
    }
}

impl Hub {
    pub fn with_timeout(timeout: Duration) -> Self {
        Self { people: Mutex::default(), next_event: Mutex::new(0), timeout }
    }

    /// Whether someone's in the Hub now (so anyone may see their picture).
    pub fn is_present(&self, user_id: &str) -> bool {
        let mut people = self.people.lock().unwrap();
        self.prune(&mut people);
        people.contains_key(user_id)
    }

    /// Hides two people from each other (or shows them again), if they're here.
    pub fn set_blocked(&self, a: &str, b: &str, on: bool) {
        let mut people = self.people.lock().unwrap();
        for (me, them) in [(a, b), (b, a)] {
            if let Some(p) = people.get_mut(me) {
                if on {
                    p.hidden.insert(them.to_owned());
                } else {
                    p.hidden.remove(them);
                }
            }
        }
    }

    fn prune(&self, people: &mut HashMap<String, Presence>) {
        let timeout = self.timeout;
        people.retain(|_, p| p.seen.elapsed() < timeout);
    }

    fn counts(people: &HashMap<String, Presence>) -> Vec<DistrictCount> {
        let mut counts: Vec<DistrictCount> = DISTRICTS.iter().map(|(id, ..)| DistrictCount { id: (*id).into(), count: 0 }).collect();
        for id in people.values().filter_map(|p| district_of(p.x, p.z, p.inside.as_deref())) {
            if let Some(c) = counts.iter_mut().find(|c| c.id == id) {
                c.count += 1;
            }
        }
        counts
    }

    fn person(p: &Presence) -> HubPerson {
        HubPerson {
            player: p.player.clone(),
            x: p.x,
            z: p.z,
            shown: p.shown.as_ref().filter(|(_, _, at, _)| at.elapsed() < SHOW).map(|(kind, id, at, to)| Shown {
                kind: *kind,
                id: id.clone(),
                age: at.elapsed().as_millis() as u32,
                to: to.clone(),
            }),
        }
    }

    fn state(people: &mut HashMap<String, Presence>, me: &str) -> HubState {
        let (x, z, inside, events, hidden) = match people.get_mut(me) {
            Some(p) => (p.x, p.z, p.inside.clone(), std::mem::take(&mut p.events), p.hidden.clone()),
            None => (0.0, 0.0, None, Vec::new(), HashSet::new()),
        };
        HubState {
            people: Self::near(people, me, &hidden, x, z, inside.as_deref()).into_iter().map(Self::person).collect(),
            districts: Self::counts(people),
            online: people.len() as u32,
            events,
        }
    }

    /// Everyone but `me` in the same place (the city, or the same building) and
    /// within `VIEW` of a spot, nearest first, at most `MAX_SEEN`. Leaves out `hidden`.
    fn near<'a>(people: &'a HashMap<String, Presence>, me: &str, hidden: &HashSet<String>, x: f32, z: f32, inside: Option<&str>) -> Vec<&'a Presence> {
        let mut near: Vec<(f32, &Presence)> = people
            .iter()
            .filter(|(id, p)| *id != me && !hidden.contains(*id) && p.inside.as_deref() == inside)
            .map(|(_, p)| ((p.x - x).hypot(p.z - z), p))
            .filter(|(d, _)| *d <= VIEW)
            .collect();
        near.sort_by(|a, b| a.0.total_cmp(&b.0));
        near.into_iter().take(MAX_SEEN).map(|(_, p)| p).collect()
    }
}

fn check_where(w: &HubWhere) -> Result<(), ApiError> {
    if !somewhere(w) {
        return Err(ApiError::bad_request("That isn't somewhere in Nexus."));
    }
    Ok(())
}

/// Whether `room` already holds `ROOM_CAPACITY` people (not counting `me`).
fn room_full(people: &HashMap<String, Presence>, me: &str, room: Option<&str>) -> bool {
    let Some(room) = room else { return false };
    people.iter().filter(|(id, p)| *id != me && p.inside.as_deref() == Some(room)).count() >= ROOM_CAPACITY
}

fn room_is_full() -> ApiError {
    ApiError::new(StatusCode::CONFLICT, "That building is full right now. Try again in a little while.")
}

/// Where someone can have got to from `(x, z)` in `secs`: `to`, or as far
/// towards it as `MAX_SPEED` allows (with a few metres for rounding and lag).
fn reachable(x: f32, z: f32, to: (f32, f32), secs: f32) -> (f32, f32) {
    let (dx, dz) = (to.0 - x, to.1 - z);
    let far = dx.hypot(dz);
    let most = MAX_SPEED * secs + 5.0;
    if far <= most { to } else { (x + dx / far * most, z + dz / far * most) }
}

fn gone() -> ApiError {
    ApiError::new(StatusCode::CONFLICT, "You've left Nexus. Enter again to come back.")
}

/// Enters Nexus.
pub async fn enter(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubWhere>) -> Result<Json<HubState>, ApiError> {
    check_where(&body)?;
    if !s.limits.hub_enters.hit(&auth.user_id) {
        return Err(ApiError::too_many("You've come and gone a lot just now. Try again in a minute."));
    }
    // The only database work: who you are, and who you've blocked, once.
    let player = crate::playground::player_for(&s, &auth.user_id).await?;
    let hidden = crate::playground::blocked_either_way(&s.db, &auth.user_id).await?;
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    if !people.contains_key(&auth.user_id) && people.len() >= CAPACITY {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "Nexus is full right now. Try again in a little while."));
    }
    if room_full(&people, &auth.user_id, body.inside.as_deref()) {
        return Err(room_is_full());
    }
    let events = people.remove(&auth.user_id).map(|p| p.events).unwrap_or_default();
    let now = Instant::now();
    people.insert(
        auth.user_id.clone(),
        Presence { player, x: body.x, z: body.z, inside: body.inside, shown: None, seen: now, moved: now, events, hidden },
    );
    Ok(Json(Hub::state(&mut people, &auth.user_id)))
}

/// Checks in: where you are now, and who's around you.
pub async fn sync(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubWhere>) -> Result<Json<HubState>, ApiError> {
    check_where(&body)?;
    if !s.limits.hub_syncs.hit(&auth.user_id) {
        return Err(ApiError::too_many("Slow down a little."));
    }
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let full = room_full(&people, &auth.user_id, body.inside.as_deref());
    let me = people.get_mut(&auth.user_id).ok_or_else(gone)?;
    let now = Instant::now();
    me.seen = now;
    if me.inside != body.inside {
        // A full building: you stay where you were (and still here).
        if full {
            return Err(room_is_full());
        }
        // Through a door: what you were showing stays where you were.
        me.shown = None;
        (me.x, me.z) = (body.x, body.z);
    } else {
        (me.x, me.z) = reachable(me.x, me.z, (body.x, body.z), (now - me.moved).as_secs_f32());
    }
    me.inside = body.inside;
    me.moved = now;
    Ok(Json(Hub::state(&mut people, &auth.user_id)))
}

/// Shows an emote or says a phrase to everyone near; aimed at someone near, they're told.
pub async fn act(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubAct>) -> Result<StatusCode, ApiError> {
    let known = match body.kind {
        ActKind::Emote => EMOTES.contains(&body.id.as_str()),
        ActKind::Phrase => PHRASES.iter().any(|(id, _)| *id == body.id),
    };
    if !known {
        return Err(ApiError::bad_request("That isn't something you can do in Nexus."));
    }
    if !s.limits.hub_acts.hit(&auth.user_id) {
        return Err(ApiError::too_many("Give everyone a moment to catch up."));
    }
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let me = people.get_mut(&auth.user_id).ok_or_else(gone)?;
    me.seen = Instant::now();
    let to = body.to.filter(|to| *to != auth.user_id);
    me.shown = Some((body.kind, body.id.clone(), Instant::now(), to.clone()));
    let (x, z, inside, from) = (me.x, me.z, me.inside.clone(), me.player.clone());
    let blocked = me.hidden.clone();
    let in_reach = |t: &&mut Presence| t.inside == inside && (t.x - x).hypot(t.z - z) <= VIEW && !blocked.contains(&t.player.user_id);
    if let Some(target) = to.and_then(|to| people.get_mut(&to)).filter(in_reach) {
        let mut next = s.hub.next_event.lock().unwrap();
        *next += 1;
        target.events.push(HubEvent { id: *next, from: Player { you: false, friend: false, ..from }, kind: body.kind, item: body.id });
        if target.events.len() > MAX_EVENTS {
            target.events.remove(0);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Leaves the Hub straight away.
pub async fn leave(State(s): State<AppState>, auth: AuthUser) -> StatusCode {
    s.hub.people.lock().unwrap().remove(&auth.user_id);
    StatusCode::NO_CONTENT
}

/// A look in without entering: how many are where, and some of who's in the Nexus.
pub async fn peek(State(s): State<AppState>, _auth: AuthUser) -> Json<HubPeek> {
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let mut nexus: Vec<&Presence> = people.values().filter(|p| p.inside.is_none() && district_at(p.x, p.z) == Some(DISTRICTS[0].0)).collect();
    nexus.sort_by_key(|p| std::cmp::Reverse(p.seen));
    Json(HubPeek {
        online: people.len() as u32,
        districts: Hub::counts(&people),
        nexus: nexus.into_iter().take(PEEK).map(Hub::person).collect(),
    })
}

/// Forgets someone (their account was deleted).
pub fn forget_user(s: &AppState, user_id: &str) {
    s.hub.people.lock().unwrap().remove(user_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn someone(id: &str, inside: Option<&str>) -> (String, Presence) {
        let player = Player {
            user_id: id.into(),
            handle: id.into(),
            name: None,
            lemma: Default::default(),
            perks: Default::default(),
            avatar: None,
            you: false,
            friend: false,
        };
        let now = Instant::now();
        let p = Presence { player, x: 0.0, z: 0.0, inside: inside.map(Into::into), shown: None, seen: now, moved: now, events: Vec::new(), hidden: HashSet::new() };
        (id.to_owned(), p)
    }

    #[test]
    fn a_building_holds_so_many() {
        let mut people: HashMap<String, Presence> = (0..ROOM_CAPACITY).map(|n| someone(&format!("p{n}"), Some("library"))).collect();
        people.extend([someone("outside", None)]);
        assert!(room_full(&people, "newcomer", Some("library")));
        assert!(!room_full(&people, "p0", Some("library")), "someone already in it stays");
        assert!(!room_full(&people, "newcomer", Some("cafe")));
        assert!(!room_full(&people, "newcomer", None), "the city's big enough");
    }

    #[test]
    fn jumps_are_slowed_to_the_fastest_pace() {
        assert_eq!(reachable(0.0, 0.0, (10.0, 0.0), 1.0), (10.0, 0.0), "walking");
        let (x, z) = reachable(0.0, 0.0, (300.0, 0.0), 1.0);
        assert_eq!((x, z), (MAX_SPEED + 5.0, 0.0));
    }
}
