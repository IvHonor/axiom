use super::*;
use crate::vault::store::Memory;

fn locked(store: &Memory) -> AppLock {
    AppLock::new(Box::new(store.clone()))
}

#[test]
fn a_pin_locks_on_opening_and_after_idle_until_entered() {
    let store = Memory::default();
    let lock = locked(&store);
    assert!(!lock.status().enabled);
    assert!(lock.set(None, Some("12a4"), 5).is_err(), "digits only");
    assert!(lock.set(None, Some("123"), 5).is_err(), "at least 4");
    lock.set(None, Some("1234"), 5).unwrap();
    assert_eq!(lock.status(), LockStatus { enabled: true, locked: false, idle_minutes: 5, needs_code: false });

    // Next launch: locked.
    let lock = locked(&store);
    assert!(lock.status().locked);
    assert_eq!(lock.unlock("0000").unwrap_err().to_string(), "That PIN isn't right.");
    assert!(!lock.unlock("1234").unwrap().locked);
    assert!(lock.lock().locked, "idle");
}

#[test]
fn changing_or_removing_it_needs_the_current_pin() {
    let store = Memory::default();
    let lock = locked(&store);
    lock.set(None, Some("1234"), 5).unwrap();
    assert!(lock.set(None, Some("5678"), 5).is_err());
    assert!(lock.set(Some("0000"), None, 15).is_err());
    assert_eq!(lock.set(Some("1234"), None, 15).unwrap().idle_minutes, 15);
    lock.set(Some("1234"), Some("5678"), 15).unwrap();
    assert!(lock.turn_off("1234").is_err());
    assert!(!lock.turn_off("5678").unwrap().enabled);
    assert!(store.load().is_none());
}

#[test]
fn too_many_wrong_pins_need_an_emailed_code() {
    let store = Memory::default();
    locked(&store).set(None, Some("1234"), 0).unwrap();
    let lock = locked(&store);
    for _ in 0..MAX_TRIES {
        assert!(lock.unlock("0000").is_err());
    }
    assert!(lock.status().needs_code);
    assert!(lock.unlock("1234").is_err(), "even the right one");
    // The code checks out: the lock goes, ready for a new PIN.
    lock.forget();
    assert_eq!(lock.status(), LockStatus { enabled: false, locked: false, idle_minutes: 0, needs_code: false });
}
