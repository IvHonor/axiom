//! Keeping the screen awake, when someone asks Lemma to: the display doesn't
//! dim or sleep (and the computer doesn't sleep) until a deadline, at most
//! `MAX_MINUTES` away, or until they say stop. Nothing about it is saved:
//! quitting Axiom lets the screen sleep again.
//!
//! - Windows: `SetThreadExecutionState`, held by a thread of our own for as long as it lasts.
//! - macOS: the system's own `caffeinate`, for exactly as long.

use std::sync::Mutex;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};

/// The longest one request keeps the screen awake.
pub const MAX_MINUTES: u32 = 4 * 60;

/// Heard by both windows (Lemma on the desktop, and Axiom's status bar):
/// when it lasts until (milliseconds since 1970), or null once it's over.
pub const EVENT: &str = "keep-awake-changed";

struct Hold {
    /// Which hold this is, so an old one ending can't end a newer one.
    id: u64,
    until: i64,
    stop: Sender<()>,
}

#[derive(Default)]
pub struct KeepAwake {
    hold: Mutex<Option<Hold>>,
    next_id: Mutex<u64>,
}

impl KeepAwake {
    fn end(&self) -> bool {
        match self.hold.lock().unwrap().take() {
            Some(hold) => {
                let _ = hold.stop.send(());
                true
            }
            None => false,
        }
    }
}

/// Keeps the screen awake for `minutes` (1 to `MAX_MINUTES`), replacing any
/// earlier request. Answers when it lasts until.
#[tauri::command]
pub fn keep_awake_start(app: AppHandle, state: State<'_, KeepAwake>, minutes: u32) -> Result<i64> {
    if minutes == 0 {
        return Err(Error::Invalid("Say how long to keep the screen awake.".into()));
    }
    let minutes = minutes.min(MAX_MINUTES);
    state.end();
    let id = {
        let mut next = state.next_id.lock().unwrap();
        *next += 1;
        *next
    };
    let length = Duration::from_secs(u64::from(minutes) * 60);
    let until = chrono::Utc::now().timestamp_millis() + length.as_millis() as i64;
    let (stop, stopped) = mpsc::channel::<()>();
    let guard = platform::Guard::start(length)?;
    *state.hold.lock().unwrap() = Some(Hold { id, until, stop });

    let handle = app.clone();
    std::thread::spawn(move || {
        // The guard is taken onto this thread: on Windows the request belongs to the thread holding it.
        let guard = guard.hold();
        let timed_out = matches!(stopped.recv_timeout(length), Err(RecvTimeoutError::Timeout));
        drop(guard);
        if timed_out {
            let state = handle.state::<KeepAwake>();
            let mut hold = state.hold.lock().unwrap();
            if hold.as_ref().is_some_and(|h| h.id == id) {
                *hold = None;
                drop(hold);
                let _ = handle.emit(EVENT, Option::<i64>::None);
            }
        }
    });
    let _ = app.emit(EVENT, Some(until));
    Ok(until)
}

/// Lets the screen sleep again.
#[tauri::command]
pub fn keep_awake_stop(app: AppHandle, state: State<'_, KeepAwake>) {
    if state.end() {
        let _ = app.emit(EVENT, Option::<i64>::None);
    }
}

/// When the screen is being kept awake until, if it is.
#[tauri::command]
pub fn keep_awake_status(state: State<'_, KeepAwake>) -> Option<i64> {
    state.hold.lock().unwrap().as_ref().map(|h| h.until)
}

#[cfg(windows)]
mod platform {
    use std::time::Duration;

    use windows::Win32::System::Power::{ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED, SetThreadExecutionState};

    use crate::error::Result;

    /// Nothing to set up ahead: the thread that holds it asks Windows.
    pub struct Guard;
    pub struct Held;

    impl Guard {
        pub fn start(_length: Duration) -> Result<Self> {
            Ok(Guard)
        }

        pub fn hold(self) -> Held {
            unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) };
            Held
        }
    }

    impl Drop for Held {
        fn drop(&mut self) {
            unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::process::{Child, Command};
    use std::time::Duration;

    use crate::error::{Error, Result};

    /// `caffeinate` keeping the display (-d) and the system (-i) awake, ending by itself (-t) too.
    pub struct Guard(Child);
    pub struct Held(Child);

    impl Guard {
        pub fn start(length: Duration) -> Result<Self> {
            Command::new("/usr/bin/caffeinate")
                .args(["-d", "-i", "-t", &length.as_secs().to_string()])
                .spawn()
                .map(Guard)
                .map_err(|_| Error::Invalid("macOS wouldn't keep the screen awake just now.".into()))
        }

        pub fn hold(self) -> Held {
            Held(self.0)
        }
    }

    impl Drop for Held {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod platform {
    use std::time::Duration;

    use crate::error::{Error, Result};

    pub struct Guard;
    pub struct Held;

    impl Guard {
        pub fn start(_length: Duration) -> Result<Self> {
            Err(Error::Invalid("Keeping the screen awake works on Windows and macOS.".into()))
        }

        pub fn hold(self) -> Held {
            Held
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ending_lets_go_once() {
        let state = KeepAwake::default();
        assert!(!state.end(), "nothing to end");
        let (stop, stopped) = mpsc::channel();
        *state.hold.lock().unwrap() = Some(Hold { id: 1, until: 0, stop });
        assert!(state.end());
        assert!(stopped.try_recv().is_ok(), "the holding thread hears it");
        assert!(!state.end(), "and it's gone");
    }
}
