//! The Hub's live presence (see `axiom_protocol::hub`). Everything's in
//! memory: who's in which room, where, what they're showing, and what's been
//! done to them since they last checked in. Nothing touches the database
//! after entering, so a room full of people checking in every second costs
//! nothing but memory. Someone quiet for `timeout` is gone.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axiom_protocol::hub::{
    ActKind, EMOTES, HubAct, HubEvent, HubPeek, HubPerson, HubState, HubWhere, PHRASES, ROOM_CAPACITY, ROOMS, RoomCount, Shown, is_room,
    on_floor,
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
/// Most people the plaza peek shows.
const PEEK: usize = 12;

struct Presence {
    player: Player,
    room: String,
    x: f32,
    y: f32,
    shown: Option<(ActKind, String, Instant, Option<String>)>,
    seen: Instant,
    events: Vec<HubEvent>,
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

    fn prune(&self, people: &mut HashMap<String, Presence>) {
        let timeout = self.timeout;
        people.retain(|_, p| p.seen.elapsed() < timeout);
    }

    fn counts(people: &HashMap<String, Presence>) -> Vec<RoomCount> {
        ROOMS.iter().map(|room| RoomCount { id: (*room).into(), count: people.values().filter(|p| p.room == *room).count() as u32 }).collect()
    }

    fn person(p: &Presence) -> HubPerson {
        HubPerson {
            player: p.player.clone(),
            x: p.x,
            y: p.y,
            shown: p.shown.as_ref().filter(|(_, _, at, _)| at.elapsed() < SHOW).map(|(kind, id, at, to)| Shown {
                kind: *kind,
                id: id.clone(),
                age: at.elapsed().as_millis() as u32,
                to: to.clone(),
            }),
        }
    }

    fn state(people: &mut HashMap<String, Presence>, me: &str) -> HubState {
        let (room, events) = match people.get_mut(me) {
            Some(p) => (p.room.clone(), std::mem::take(&mut p.events)),
            None => (ROOMS[0].into(), Vec::new()),
        };
        HubState {
            people: people.iter().filter(|(id, p)| *id != me && p.room == room).map(|(_, p)| Self::person(p)).collect(),
            rooms: Self::counts(people),
            online: people.len() as u32,
            room,
            events,
        }
    }
}

fn check_where(w: &HubWhere) -> Result<(), ApiError> {
    if !is_room(&w.room) || !on_floor(w.x, w.y) {
        return Err(ApiError::bad_request("That isn't somewhere in the Hub."));
    }
    Ok(())
}

fn gone() -> ApiError {
    ApiError::new(StatusCode::CONFLICT, "You've left the Hub. Enter again to come back.")
}

/// Enters the Hub. A full room puts you in the quietest one instead.
pub async fn enter(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubWhere>) -> Result<Json<HubState>, ApiError> {
    check_where(&body)?;
    if !s.limits.hub_enters.hit(&auth.user_id) {
        return Err(ApiError::too_many("You've come and gone a lot just now. Try again in a minute."));
    }
    // The only database work: who you are, once.
    let player = crate::playground::player_for(&s, &auth.user_id).await?;
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let full = |room: &str, people: &HashMap<String, Presence>| people.iter().filter(|(id, p)| p.room == room && **id != auth.user_id).count() >= ROOM_CAPACITY;
    let room = if full(&body.room, &people) {
        let counts = Hub::counts(&people);
        let quietest = counts.iter().min_by_key(|c| c.count).map(|c| c.id.clone()).unwrap_or_else(|| ROOMS[0].into());
        if full(&quietest, &people) {
            return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The Hub's full right now. Try again in a little while."));
        }
        quietest
    } else {
        body.room
    };
    let events = people.remove(&auth.user_id).map(|p| p.events).unwrap_or_default();
    people.insert(auth.user_id.clone(), Presence { player, room, x: body.x, y: body.y, shown: None, seen: Instant::now(), events });
    Ok(Json(Hub::state(&mut people, &auth.user_id)))
}

/// Checks in: where you are now, and your room as it is.
pub async fn sync(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubWhere>) -> Result<Json<HubState>, ApiError> {
    check_where(&body)?;
    if !s.limits.hub_syncs.hit(&auth.user_id) {
        return Err(ApiError::too_many("Slow down a little."));
    }
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let changing = people.get(&auth.user_id).ok_or_else(gone)?.room != body.room;
    if changing {
        let crowd = people.iter().filter(|(id, p)| p.room == body.room && **id != auth.user_id).count();
        if crowd >= ROOM_CAPACITY {
            return Err(ApiError::new(StatusCode::CONFLICT, "That room's full. Try another."));
        }
    }
    let me = people.get_mut(&auth.user_id).ok_or_else(gone)?;
    me.room = body.room;
    me.x = body.x;
    me.y = body.y;
    me.seen = Instant::now();
    if changing {
        me.shown = None;
    }
    Ok(Json(Hub::state(&mut people, &auth.user_id)))
}

/// Shows an emote or says a phrase to the room; aimed at someone, they're told.
pub async fn act(State(s): State<AppState>, auth: AuthUser, Json(body): Json<HubAct>) -> Result<StatusCode, ApiError> {
    let known = match body.kind {
        ActKind::Emote => EMOTES.contains(&body.id.as_str()),
        ActKind::Phrase => PHRASES.iter().any(|(id, _)| *id == body.id),
    };
    if !known {
        return Err(ApiError::bad_request("That isn't something you can do in the Hub."));
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
    let (room, from) = (me.room.clone(), me.player.clone());
    if let Some(target) = to.and_then(|to| people.get_mut(&to)).filter(|t| t.room == room) {
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

/// A look in without entering: how many are where, and some of the plaza.
pub async fn peek(State(s): State<AppState>, _auth: AuthUser) -> Json<HubPeek> {
    let mut people = s.hub.people.lock().unwrap();
    s.hub.prune(&mut people);
    let mut plaza: Vec<&Presence> = people.values().filter(|p| p.room == ROOMS[0]).collect();
    plaza.sort_by_key(|p| std::cmp::Reverse(p.seen));
    Json(HubPeek {
        online: people.len() as u32,
        rooms: Hub::counts(&people),
        plaza: plaza.into_iter().take(PEEK).map(Hub::person).collect(),
    })
}

/// Forgets someone (their account was deleted).
pub fn forget_user(s: &AppState, user_id: &str) {
    s.hub.people.lock().unwrap().remove(user_id);
}
