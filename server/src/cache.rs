//! What the server remembers between requests, so an app that's only
//! checking in doesn't touch the database.
//!
//! Every open copy of Axiom asks every minute whether anything changed. With
//! each of those requests reading the session, the account and the records,
//! the database never sat idle long enough to sleep (Neon's free plan suspends
//! it after 5 quiet minutes and counts every minute it's awake). Now a check-in
//! with nothing new is answered from here.
//!
//! Correctness rests on two rules:
//! - Whatever writes a session, an account or a shared board says so
//!   (`forget_user`, `forget_spaces`) after its change is committed.
//! - A value read from the database is only kept if nothing was forgotten
//!   while it was being read (`generation`), so a read that raced a write
//!   can't put the old value back.
//!
//! Entries also expire, as a backstop for a write path that forgot to say so.
//!
//! shortcut: memory is per process, which is right for the single server
//! process Axiom runs (Render's free plan). Several processes behind a load
//! balancer would need a shared store or a much shorter expiry.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use axiom_protocol::Space;
use axiom_protocol::notify::Unsubscribed;

use crate::entities::user;

/// The backstop: nothing is trusted for longer than this without a fresh read.
const KEEP_FOR: Duration = Duration::from_secs(30 * 60);
/// A map that reaches this many entries starts again, so it can't grow forever.
const MAX_ENTRIES: usize = 20_000;

#[derive(Default)]
pub struct Cache {
    generation: AtomicU64,
    /// Sessions known to be signed in (and confirmed): session id → user id.
    sessions: Mutex<HashMap<String, (String, Instant)>>,
    /// Account rows by user id.
    accounts: Mutex<HashMap<String, (user::Model, Instant)>>,
    /// The shared boards each user is on, as `GET /v1/spaces` answers.
    spaces: Mutex<HashMap<String, (Vec<Space>, Instant)>>,
    /// Each shared board's newest sequence number.
    space_seqs: Mutex<HashMap<String, (i64, Instant)>>,
    /// The last email plan stored for each user (as a hash), and what storing it answered.
    plans: Mutex<HashMap<String, (u64, Vec<Unsubscribed>)>>,
}

fn get<V: Clone>(map: &Mutex<HashMap<String, (V, Instant)>>, key: &str) -> Option<V> {
    let map = map.lock().unwrap();
    map.get(key).filter(|(_, at)| at.elapsed() < KEEP_FOR).map(|(value, _)| value.clone())
}

fn put<V>(map: &Mutex<HashMap<String, (V, Instant)>>, key: String, value: V) {
    let mut map = map.lock().unwrap();
    if map.len() >= MAX_ENTRIES {
        map.clear();
    }
    map.insert(key, (value, Instant::now()));
}

impl Cache {
    /// Read before going to the database; pass it to `keep_*` afterwards.
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    fn unchanged_since(&self, generation: u64) -> bool {
        self.generation() == generation
    }

    pub fn session(&self, session_id: &str) -> Option<String> {
        get(&self.sessions, session_id)
    }

    pub fn keep_session(&self, generation: u64, session_id: &str, user_id: &str) {
        if self.unchanged_since(generation) {
            put(&self.sessions, session_id.into(), user_id.into());
        }
    }

    pub fn account(&self, user_id: &str) -> Option<user::Model> {
        get(&self.accounts, user_id)
    }

    pub fn keep_account(&self, generation: u64, account: &user::Model) {
        if self.unchanged_since(generation) {
            put(&self.accounts, account.id.clone(), account.clone());
        }
    }

    /// After any change to a user's account row or sessions (signing out a
    /// device, a new password, a refresh, admin changes, a push, deletion).
    pub fn forget_user(&self, user_id: &str) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.accounts.lock().unwrap().remove(user_id);
        self.sessions.lock().unwrap().retain(|_, (owner, _)| owner != user_id);
        self.spaces.lock().unwrap().remove(user_id);
    }

    pub fn spaces(&self, user_id: &str) -> Option<Vec<Space>> {
        get(&self.spaces, user_id)
    }

    pub fn keep_spaces(&self, generation: u64, user_id: &str, spaces: &[Space]) {
        if self.unchanged_since(generation) {
            put(&self.spaces, user_id.into(), spaces.to_vec());
        }
    }

    pub fn space_seq(&self, space_id: &str) -> Option<i64> {
        get(&self.space_seqs, space_id)
    }

    pub fn keep_space_seq(&self, generation: u64, space_id: &str, seq: i64) {
        if self.unchanged_since(generation) {
            put(&self.space_seqs, space_id.into(), seq);
        }
    }

    /// After any change to a shared board, its members or its records.
    pub fn forget_spaces(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.spaces.lock().unwrap().clear();
        self.space_seqs.lock().unwrap().clear();
    }

    /// When `plan` is the one last stored for this user (storing it again
    /// would change nothing), what storing it answered.
    pub fn known_plan(&self, user_id: &str, plan: &impl Hash) -> Option<Vec<Unsubscribed>> {
        let plans = self.plans.lock().unwrap();
        plans.get(user_id).filter(|(known, _)| *known == hash(plan)).map(|(_, answer)| answer.clone())
    }

    pub fn keep_plan(&self, user_id: &str, plan: &impl Hash, answer: &[Unsubscribed]) {
        let mut plans = self.plans.lock().unwrap();
        if plans.len() >= MAX_ENTRIES {
            plans.clear();
        }
        plans.insert(user_id.into(), (hash(plan), answer.to_vec()));
    }

    pub fn forget_plan(&self, user_id: &str) {
        self.plans.lock().unwrap().remove(user_id);
    }
}

fn hash(value: &impl Hash) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_read_that_raced_a_write_is_not_kept() {
        let cache = Cache::default();
        let before = cache.generation();
        cache.forget_user("someone");
        cache.keep_session(before, "sid", "u1");
        assert_eq!(cache.session("sid"), None, "a value read before a change must not be kept");
        cache.keep_session(cache.generation(), "sid", "u1");
        assert_eq!(cache.session("sid").as_deref(), Some("u1"));
    }

    #[test]
    fn forgetting_a_user_drops_their_sessions_only() {
        let cache = Cache::default();
        let g = cache.generation();
        cache.keep_session(g, "a", "u1");
        cache.keep_session(g, "b", "u2");
        cache.forget_user("u1");
        assert_eq!(cache.session("a"), None);
        assert_eq!(cache.session("b").as_deref(), Some("u2"));
    }

    #[test]
    fn same_plan_is_recognised() {
        let cache = Cache::default();
        assert!(cache.known_plan("u1", &"plan").is_none());
        cache.keep_plan("u1", &"plan", &[]);
        assert!(cache.known_plan("u1", &"plan").is_some());
        assert!(cache.known_plan("u1", &"other").is_none());
        cache.forget_plan("u1");
        assert!(cache.known_plan("u1", &"plan").is_none());
    }
}
