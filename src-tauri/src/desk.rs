//! Lemma on the desktop: just Lemma, floating over everything else in a
//! see-through window. He becomes a timer while a Daily Plan task or study
//! time runs, says things in a speech bubble, and does small things he's
//! asked out loud or in writing (see `ai::quick`). The main window decides
//! when he shows (not during a full-screen app or a call: `desk_state`), in
//! which corner, and whether Ctrl+Alt+Space brings him out to listen and the
//! timer keys work (see `src/shell/desk/useDesk.ts`, from Lemma's settings).
//! He closes with the main window. What he shows is `src/shell/desk/Desk.tsx`.
//!
//! The window is made in async commands (and off the main thread for the
//! hotkey): made in a synchronous one, it can hang on Windows.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::error::{Error, Result};

/// The window's label: the page it loads reads it (`?desk`) to show the
/// desktop view instead of the app.
pub const LABEL: &str = "desk";

/// Sent to every window when a timer starts, stops or its task is done, so
/// the desktop view and the main window keep up with each other.
pub const TIMER_EVENT: &str = "timer-changed";

/// Sent to the desktop view when Ctrl+Alt+Space asks Lemma to listen.
pub const SUMMON_EVENT: &str = "desk-summon";

/// Sent to every window when a timer key is pressed: "toggle" (Ctrl+Alt+P:
/// pause, carry on, or start what's next) or "done" (Ctrl+Alt+D). The main
/// window does it (see `src/shell/desk/useDesk.ts`).
pub const KEY_EVENT: &str = "desk-key";

/// Lemma at the size it starts: the page then fits the window to him
/// (`desk_resize`), as big as he's set to be, with room for what he says.
const WIDTH: f64 = 200.0;
const HEIGHT: f64 = 200.0;
/// The window's smallest and largest sides.
const SMALLEST: f64 = 40.0;
const LARGEST: f64 = 720.0;
/// Space between the window and the screen's edges (and the taskbar).
const MARGIN: f64 = 18.0;

/// Which corner of the screen the window goes in.
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Corner {
    #[default]
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
}

/// The corner last asked for, for the hotkey to use too.
static CORNER: Mutex<Corner> = Mutex::new(Corner::BottomRight);

/// Where he was last dragged to: his middle, on which screen (by name). He
/// goes back there, rather than to his corner, while that screen's there.
/// The page keeps it between runs (see `Desk.tsx`).
#[derive(Clone, Debug, PartialEq, serde::Serialize, Deserialize)]
pub struct Spot {
    pub x: i32,
    pub y: i32,
    pub monitor: String,
}
static SPOT: Mutex<Option<Spot>> = Mutex::new(None);

/// Counts showings, so a hide still fading out doesn't close him after he's
/// been asked back.
static SHOWN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Sent to the desktop view just before it closes, to fade out first.
pub const LEAVE_EVENT: &str = "desk-leave";
/// Sent when he was asked back while fading out: he fades in again.
pub const STAY_EVENT: &str = "desk-stay";
/// Sent when Axiom closes: he waves goodbye before he goes.
pub const BYE_EVENT: &str = "desk-bye";
const BYE_MS: u64 = 1500;
/// How long it has to fade out, in milliseconds.
const LEAVE_MS: u64 = 280;
/// Dragged this close to a screen's edge (in logical pixels), he snaps to it.
const SNAP: f64 = 48.0;

/// Tells every window a timer changed.
pub fn timer_changed(app: &AppHandle) {
    let _ = app.emit(TIMER_EVENT, ());
}

/// The screen Axiom is on (or the main one).
fn screen(app: &AppHandle, window: &WebviewWindow) -> Option<Monitor> {
    app.get_webview_window("main").and_then(|main| main.current_monitor().ok().flatten()).or_else(|| window.primary_monitor().ok().flatten())
}

/// Puts the window in `corner` of the screen Axiom is on, clear of the taskbar.
fn place(app: &AppHandle, window: &WebviewWindow, corner: Corner) {
    let Some(screen) = screen(app, window) else { return };
    let (area, scale) = (screen.work_area(), screen.scale_factor());
    let size = window.outer_size().unwrap_or(PhysicalSize::new((WIDTH * scale) as u32, (HEIGHT * scale) as u32));
    let margin = (MARGIN * scale) as i32;
    let left = area.position.x + margin;
    let right = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let top = area.position.y + margin;
    let bottom = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    let (x, y) = match corner {
        Corner::BottomRight => (right, bottom),
        Corner::BottomLeft => (left, bottom),
        Corner::TopRight => (right, top),
        Corner::TopLeft => (left, top),
    };
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Puts the window back where he was last dragged, if that screen's still
/// there (kept on it). False when there's nowhere to go back to.
fn place_at_spot(window: &WebviewWindow) -> bool {
    let Some(spot) = SPOT.lock().unwrap().clone() else { return false };
    let Some(screen) = window.available_monitors().ok().and_then(|all| all.into_iter().find(|m| m.name().is_some_and(|n| *n == spot.monitor))) else {
        return false;
    };
    let area = screen.work_area();
    let size = window.outer_size().unwrap_or(PhysicalSize::new((WIDTH * screen.scale_factor()) as u32, (HEIGHT * screen.scale_factor()) as u32));
    let (w, h) = (size.width as i32, size.height as i32);
    let x = (spot.x - w / 2).clamp(area.position.x, (area.position.x + area.size.width as i32 - w).max(area.position.x));
    let y = (spot.y - h / 2).clamp(area.position.y, (area.position.y + area.size.height as i32 - h).max(area.position.y));
    window.set_position(PhysicalPosition::new(x, y)).is_ok()
}

/// After he's been dragged: near a screen's edge or corner, he snaps
/// against it (clear of it by the usual margin). Says where he is now, for
/// the page to keep.
#[tauri::command]
pub async fn desk_settle(app: AppHandle) -> Option<Spot> {
    let window = app.get_webview_window(LABEL)?;
    let screen = window.current_monitor().ok().flatten()?;
    let (area, scale) = (screen.work_area(), screen.scale_factor());
    let (at, size) = (window.outer_position().ok()?, window.outer_size().ok()?);
    let (snap, margin) = ((SNAP * scale) as i32, (MARGIN * scale) as i32);
    let (w, h) = (size.width as i32, size.height as i32);
    let (left, top) = (area.position.x, area.position.y);
    let (right, bottom) = (left + area.size.width as i32, top + area.size.height as i32);
    let edge = |value: i32, low: i32, high: i32, length: i32| {
        if (value - low).abs() < snap + margin {
            low + margin
        } else if (high - (value + length)).abs() < snap + margin {
            high - length - margin
        } else {
            value
        }
    };
    let (x, y) = (edge(at.x, left, right, w), edge(at.y, top, bottom, h));
    if (x, y) != (at.x, at.y) {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let spot = Spot { x: x + w / 2, y: y + h / 2, monitor: screen.name().cloned().unwrap_or_default() };
    *SPOT.lock().unwrap() = Some(spot.clone());
    Some(spot)
}

/// Makes the desktop view. `listen`: it opens listening (Ctrl+Alt+Space).
fn create(app: &AppHandle, listen: bool) -> Result<WebviewWindow> {
    let page = if listen { "index.html?desk&listen" } else { "index.html?desk" };
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(page.into()))
        .title("Lemma")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Just Lemma: no window around him.
        .shadow(false)
        // Text, links and files dropped on him reach the page (see `Desk.tsx`).
        .disable_drag_drop_handler();
    // See-through on every system (macOS needs `macOSPrivateApi`, in tauri.conf.json),
    // and on every desktop or Space, not just the one he opened on.
    let builder = builder.transparent(true).visible_on_all_workspaces(true);
    let window = builder
        // It mustn't take the focus from whatever's in use, unless asked for.
        .focused(listen)
        // Shown once the page has drawn, in its theme (see `ThemeProvider`).
        .visible(false)
        .build()
        .map_err(|err| Error::Invalid(format!("Lemma couldn't open on the desktop: {err}")))?;
    if !place_at_spot(&window) {
        place(app, &window, *CORNER.lock().unwrap());
    }
    Ok(window)
}

/// Shows the desktop view, making it the first time: where he was last
/// dragged (`spot`, kept by the page), or else in `corner`.
#[tauri::command]
pub async fn desk_show(app: AppHandle, corner: Option<Corner>, spot: Option<Spot>) -> Result<()> {
    if let Some(corner) = corner {
        *CORNER.lock().unwrap() = corner;
    }
    if spot.is_some() {
        *SPOT.lock().unwrap() = spot;
    }
    SHOWN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    match app.get_webview_window(LABEL) {
        Some(window) => {
            let _ = window.show();
        }
        None => {
            create(&app, false)?;
        }
    }
    Ok(())
}

/// Moves the desktop view to `corner`, if it's open, and makes it go there
/// from now on (instead of where he was last dragged).
#[tauri::command]
pub async fn desk_place(app: AppHandle, corner: Corner) {
    *CORNER.lock().unwrap() = corner;
    *SPOT.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window(LABEL) {
        place(&app, &window, corner);
    }
}

/// Brings Lemma out, listening: Ctrl+Alt+Space from anywhere.
pub fn summon(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match app.get_webview_window(LABEL) {
            Some(window) => {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit_to(LABEL, SUMMON_EVENT, ());
            }
            None => {
                if let Err(err) = create(&app, true) {
                    eprintln!("{err}");
                }
            }
        }
    });
}

/// Closes the desktop view, if it's open, once he's faded out.
#[tauri::command]
pub async fn desk_hide(app: AppHandle) {
    if app.get_webview_window(LABEL).is_none() {
        return;
    }
    let showing = SHOWN.load(std::sync::atomic::Ordering::SeqCst);
    let _ = app.emit_to(LABEL, LEAVE_EVENT, ());
    tokio::time::sleep(std::time::Duration::from_millis(LEAVE_MS)).await;
    if SHOWN.load(std::sync::atomic::Ordering::SeqCst) == showing {
        close(&app);
    } else {
        // Asked back meanwhile: he stays.
        let _ = app.emit_to(LABEL, STAY_EVENT, ());
    }
}

/// Closes the desktop view, if it's open (with the main window, too).
pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

/// Which screen edge Lemma is tucked into.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    Right,
}

/// Makes the desktop view `width` by `height` (in logical pixels), keeping
/// Lemma where he is: around his middle, and in the bottom half of the
/// screen growing up from his bottom edge (so he stays above the taskbar),
/// in the top half down from his top.
///
/// `dock`: he's tucked into the side of the screen instead. The window goes
/// flush against the nearer edge (so dragging him across the screen moves
/// him to the other side), around his middle, kept on the screen. Returns
/// that side.
#[tauri::command]
pub async fn desk_resize(app: AppHandle, width: f64, height: f64, dock: Option<bool>) -> Option<Side> {
    let window = app.get_webview_window(LABEL)?;
    let (Ok(scale), Ok(size), Ok(at)) = (window.scale_factor(), window.outer_size(), window.outer_position()) else { return None };
    let wide = (width.clamp(SMALLEST, LARGEST) * scale) as u32;
    let tall = (height.clamp(SMALLEST, LARGEST) * scale) as u32;
    if dock == Some(true) {
        let area = *window.current_monitor().ok().flatten().or_else(|| screen(&app, &window))?.work_area();
        let (left, top) = (area.position.x, area.position.y);
        let (right, bottom) = (left + area.size.width as i32, top + area.size.height as i32);
        let side = if at.x + size.width as i32 / 2 > (left + right) / 2 { Side::Right } else { Side::Left };
        let x = if side == Side::Right { right - wide as i32 } else { left };
        let y = (at.y + size.height as i32 / 2 - tall as i32 / 2).clamp(top, (bottom - tall as i32).max(top));
        if (wide, tall) != (size.width, size.height) {
            let _ = window.set_size(PhysicalSize::new(wide, tall));
        }
        if (x, y) != (at.x, at.y) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
        return Some(side);
    }
    if (wide, tall) == (size.width, size.height) {
        return None;
    }
    let middle = screen(&app, &window).map(|s| s.work_area().position.y + s.work_area().size.height as i32 / 2);
    let x = at.x + (size.width as i32 - wide as i32) / 2;
    let y = if middle.is_none_or(|middle| at.y > middle) { at.y + size.height as i32 - tall as i32 } else { at.y };
    let _ = window.set_size(PhysicalSize::new(wide, tall));
    let _ = window.set_position(PhysicalPosition::new(x, y));
    None
}

/// A notification on the desktop (the system's own): time's up, a reminder.
#[tauri::command]
pub async fn desk_notify(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(err) = app.notification().builder().title(title).body(body).show() {
        eprintln!("desk: couldn't notify: {err}");
    }
}

/// Brings Axiom's main window to the front, from the desktop view.
#[tauri::command]
pub async fn desk_open_main(app: AppHandle) {
    bring_back(&app);
}

/// Brings Axiom's window back to the front (it may be hidden, carrying on in
/// the background with Lemma on the desktop): from his menu, from starting
/// Axiom again, or (macOS) from its Dock icon.
pub fn bring_back(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Whether closing Axiom's window only hides it, Axiom carrying on in the
/// background with Lemma on the desktop. Set by the main window from his
/// settings (only while he's always on the desktop: otherwise there'd be
/// nothing to bring it back with).
static KEEP_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn keeps_running() -> bool {
    KEEP_RUNNING.load(std::sync::atomic::Ordering::SeqCst)
}

#[tauri::command]
pub async fn desk_background(on: bool) {
    KEEP_RUNNING.store(on, std::sync::atomic::Ordering::SeqCst);
}

/// Quits Axiom altogether, from Lemma's menu: he waves goodbye first.
#[tauri::command]
pub async fn desk_quit(app: AppHandle) {
    KEEP_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    if app.get_webview_window(LABEL).is_some() {
        let _ = app.emit_to(LABEL, BYE_EVENT, ());
        tokio::time::sleep(std::time::Duration::from_millis(BYE_MS)).await;
    }
    app.exit(0);
}

/// What's going on at the computer, for Lemma to fit in with it.
#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskState {
    /// Since the keyboard or mouse was last used.
    pub idle_seconds: u64,
    /// A full-screen app (a game, a video, a presentation) is in front.
    pub full_screen: bool,
    /// Another app has the microphone or camera on: a call, most likely.
    pub call: bool,
    /// The window in front (not Axiom's), for him to glance at when one opens.
    pub active: Option<Active>,
}

/// A window, and where it is on the screen (physical pixels).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Active {
    pub id: u64,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[cfg(windows)]
fn active_window() -> Option<Active> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId};
    // SAFETY: asks Windows about a window handle it just gave, writing only into locals.
    unsafe {
        let window = GetForegroundWindow();
        if window.is_invalid() {
            return None;
        }
        let mut process = 0u32;
        GetWindowThreadProcessId(window, Some(&mut process));
        if process == std::process::id() {
            return None;
        }
        let mut rect = RECT::default();
        GetWindowRect(window, &mut rect).ok()?;
        Some(Active { id: window.0 as usize as u64, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top })
    }
}

/// The weather now, for the particles in his halo and his morning hello.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Weather {
    /// "clear", "clouds", "fog", "rain", "snow" or "storm".
    pub kind: &'static str,
    /// Degrees Celsius.
    pub temperature: f64,
    /// Where: the place asked for, the time zone's city, or "your area"
    /// (from the computer's location, which has no name).
    pub place: String,
    /// Daytime there (the sun), or night (the stars).
    pub day: bool,
    /// How the place was found: "place" (typed in), "location" (Windows'
    /// location services) or "timezone" (the computer's time zone).
    pub source: &'static str,
}

/// The last weather looked up: for what (a place, or "auto"), and when.
static WEATHER: Mutex<Option<(String, std::time::Instant, Weather)>> = Mutex::new(None);
const WEATHER_FOR: std::time::Duration = std::time::Duration::from_secs(30 * 60);
/// How long Windows has to say where the computer is.
const LOCATING_FOR: std::time::Duration = std::time::Duration::from_secs(8);

/// The weather now, from Open-Meteo (no account needed), kept for half an
/// hour. `auto`: wherever the computer is, found on it: from Windows'
/// location services when they're allowed (rounded to about 10 km, which is
/// all the weather needs, before it's sent), or else the city of its time
/// zone (Europe/London: London). Otherwise `city`, looked up by name.
#[tauri::command]
pub async fn desk_weather(city: String, auto: Option<bool>) -> Result<Option<Weather>> {
    let auto = auto.unwrap_or(false);
    let city = city.trim().to_owned();
    let key = if auto { "auto".to_owned() } else { city.clone() };
    if key.is_empty() {
        return Ok(None);
    }
    if let Some((was, at, weather)) = WEATHER.lock().unwrap().clone() {
        if was == key && at.elapsed() < WEATHER_FOR {
            return Ok(Some(weather));
        }
    }
    let client = reqwest::Client::new();
    let found = if auto {
        match locate().await {
            Some((latitude, longitude)) => Some((latitude, longitude, "your area".to_owned(), "location")),
            None => match zone_city() {
                Some(zone) => find(&client, &zone).await?.map(|(lat, lon, name)| (lat, lon, name, "timezone")),
                None => None,
            },
        }
    } else {
        find(&client, &city).await?.map(|(lat, lon, name)| (lat, lon, name, "place"))
    };
    let Some((latitude, longitude, place, source)) = found else { return Ok(None) };
    let failed = |err: reqwest::Error| Error::Invalid(format!("Couldn't get the weather: {err}"));
    let now: serde_json::Value = client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[("latitude", format!("{latitude:.1}")), ("longitude", format!("{longitude:.1}")), ("current", "temperature_2m,weather_code,is_day".to_owned())])
        .send()
        .await
        .map_err(failed)?
        .json()
        .await
        .map_err(failed)?;
    let current = &now["current"];
    let weather = Weather {
        kind: weather_kind(current["weather_code"].as_i64().unwrap_or_default()),
        temperature: current["temperature_2m"].as_f64().unwrap_or_default(),
        place,
        day: current["is_day"].as_i64() != Some(0),
        source,
    };
    *WEATHER.lock().unwrap() = Some((key, std::time::Instant::now(), weather.clone()));
    Ok(Some(weather))
}

/// A place by name (Open-Meteo's lookup): where it is, and its own name.
async fn find(client: &reqwest::Client, name: &str) -> Result<Option<(f64, f64, String)>> {
    let failed = |err: reqwest::Error| Error::Invalid(format!("Couldn't look up {name}: {err}"));
    let found: serde_json::Value = client
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[("name", name), ("count", "1")])
        .send()
        .await
        .map_err(failed)?
        .json()
        .await
        .map_err(failed)?;
    let Some(place) = found["results"].get(0) else { return Ok(None) };
    match (place["latitude"].as_f64(), place["longitude"].as_f64()) {
        (Some(latitude), Some(longitude)) => Ok(Some((latitude, longitude, place["name"].as_str().unwrap_or(name).to_owned()))),
        _ => Ok(None),
    }
}

/// The city in the computer's time zone's name ("Europe/London" is London,
/// "America/New_York" New York); none for zones that aren't a place (UTC).
fn zone_city() -> Option<String> {
    zone_city_of(&iana_time_zone::get_timezone().ok()?)
}

fn zone_city_of(zone: &str) -> Option<String> {
    let (area, city) = zone.rsplit_once('/')?;
    if area.starts_with("Etc") || city.is_empty() {
        return None;
    }
    Some(city.replace('_', " "))
}

/// Where the computer is, from Windows' location services: only when
/// they're on and apps may use them (Settings > Privacy > Location), and
/// only for a moment. None otherwise, or if Windows takes too long.
#[cfg(windows)]
async fn locate() -> Option<(f64, f64)> {
    let asking = tauri::async_runtime::spawn_blocking(|| -> windows::core::Result<(f64, f64)> {
        use windows::Devices::Geolocation::{Geolocator, PositionAccuracy};
        use windows::Foundation::TimeSpan;
        use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
        // SAFETY: readies this (pool) thread for Windows' location API; asking twice is harmless.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let locator = Geolocator::new()?;
        locator.SetDesiredAccuracy(PositionAccuracy::Default)?;
        // A position up to an hour old will do; give up after a few seconds.
        let ticks = |seconds: i64| TimeSpan { Duration: seconds * 10_000_000 };
        let at = locator.GetGeopositionAsyncWithAgeAndTimeout(ticks(3600), ticks(LOCATING_FOR.as_secs() as i64))?.join()?;
        let point = at.Coordinate()?.Point()?.Position()?;
        Ok((point.Latitude, point.Longitude))
    });
    match tokio::time::timeout(LOCATING_FOR + std::time::Duration::from_secs(2), asking).await {
        Ok(Ok(Ok(found))) => Some(found),
        _ => None,
    }
}

#[cfg(not(windows))]
async fn locate() -> Option<(f64, f64)> {
    None
}

/// The WMO weather code, as what's falling (or not) in his halo.
fn weather_kind(code: i64) -> &'static str {
    match code {
        0 | 1 => "clear",
        2 | 3 => "clouds",
        45 | 48 => "fog",
        51..=67 | 80..=82 => "rain",
        71..=77 | 85 | 86 => "snow",
        95..=99 => "storm",
        _ => "clouds",
    }
}

#[cfg(test)]
mod weather_tests {
    use super::{weather_kind, zone_city_of};

    #[test]
    fn a_time_zone_names_its_city() {
        assert_eq!(zone_city_of("Europe/London").as_deref(), Some("London"));
        assert_eq!(zone_city_of("America/New_York").as_deref(), Some("New York"));
        assert_eq!(zone_city_of("America/Argentina/Buenos_Aires").as_deref(), Some("Buenos Aires"));
        assert_eq!(zone_city_of("Etc/UTC"), None);
        assert_eq!(zone_city_of("UTC"), None);
    }

    #[test]
    fn weather_codes_are_what_falls() {
        assert_eq!([0, 3, 45, 61, 73, 95].map(weather_kind), ["clear", "clouds", "fog", "rain", "snow", "storm"]);
    }
}

/// Axiom's closing: he waves goodbye and fades, then goes.
pub fn bye(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_none() {
        return;
    }
    let _ = app.emit_to(LABEL, BYE_EVENT, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(BYE_MS));
        close(&app);
    });
}

/// Checked on this computer only: nothing about it goes anywhere.
#[tauri::command]
pub async fn desk_state() -> DeskState {
    system_state()
}

#[cfg(windows)]
fn system_state() -> DeskState {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::Shell::{QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN, SHQueryUserNotificationState};
    // SAFETY: plain calls into Windows with nothing borrowed but `info`, which outlives them.
    let full_screen = unsafe { SHQueryUserNotificationState() }.is_ok_and(|s| s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE);
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    let idle_seconds = if unsafe { GetLastInputInfo(&mut info) }.as_bool() { u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime) / 1000) } else { 0 };
    DeskState { idle_seconds, full_screen, call: in_use("microphone") || in_use("webcam"), active: active_window() }
}

/// Whether another app is using the microphone or camera right now, as
/// Windows' privacy settings record it: started and not stopped yet. Axiom
/// itself (Lemma listening) doesn't count, nor does the WebView2 runtime it
/// listens through. Calls in the Store apps (Teams) or a browser (Meet in
/// Chrome or Edge) are listed under their own names, so they still do.
#[cfg(windows)]
fn in_use(device: &str) -> bool {
    use windows_registry::{CURRENT_USER, Key};
    let Ok(store) = CURRENT_USER.open(format!(r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{device}")) else {
        return false;
    };
    let live = |key: &Key| key.get_u64("LastUsedTimeStart").unwrap_or(0) > 0 && key.get_u64("LastUsedTimeStop").is_ok_and(|stop| stop == 0);
    let any_live = |parent: &Key, skip: &dyn Fn(&str) -> bool| parent.keys().into_iter().flatten().filter(|name| !skip(name)).any(|name| parent.open(&name).is_ok_and(|k| live(&k)));
    // Apps not from the Store are listed by their path, with # for \.
    let me = std::env::current_exe().ok().map(|p| p.to_string_lossy().replace('\\', "#").to_lowercase());
    let ours = |name: &str| {
        let name = name.to_lowercase();
        me.as_deref() == Some(name.as_str()) || name.ends_with("#msedgewebview2.exe")
    };
    any_live(&store, &|name| name == "NonPackaged") || store.open("NonPackaged").is_ok_and(|other| any_live(&other, &ours))
}

/// macOS: time away from the keyboard and mouse, from the system's own
/// record of input (ioreg's HIDIdleTime, in nanoseconds). Read at most every
/// couple of seconds, however often it's asked. Full screen, calls and the
/// window in front aren't known here: he just doesn't hide for them.
#[cfg(target_os = "macos")]
fn system_state() -> DeskState {
    static READ: Mutex<Option<(std::time::Instant, u64)>> = Mutex::new(None);
    let mut read = READ.lock().unwrap();
    if let Some((at, idle)) = *read {
        if at.elapsed() < std::time::Duration::from_secs(2) {
            return DeskState { idle_seconds: idle + at.elapsed().as_secs(), ..DeskState::default() };
        }
    }
    let idle_seconds = std::process::Command::new("ioreg")
        .args(["-c", "IOHIDSystem"])
        .output()
        .ok()
        .and_then(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .find(|line| line.contains("\"HIDIdleTime\""))
                .and_then(|line| line.rsplit('=').next())
                .and_then(|value| value.trim().parse::<u64>().ok())
        })
        .map_or(0, |nanoseconds| nanoseconds / 1_000_000_000);
    *read = Some((std::time::Instant::now(), idle_seconds));
    DeskState { idle_seconds, ..DeskState::default() }
}

#[cfg(not(any(windows, target_os = "macos")))]
fn system_state() -> DeskState {
    DeskState::default()
}

/// A soft chime, from the computer's own sounds (so it follows the sound
/// scheme and volume): "up" when time's up or a reminder rings, otherwise
/// a lighter one (a meeting about to start).
#[tauri::command]
pub async fn desk_chime(kind: String) {
    #[cfg(windows)]
    {
        use windows::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_NODEFAULT};
        use windows::core::w;
        let sound = if kind == "up" { w!("Notification.Reminder") } else { w!("Notification.Default") };
        // SAFETY: a static string, and played without waiting.
        unsafe {
            let _ = PlaySoundW(sound, None, SND_ALIAS | SND_ASYNC | SND_NODEFAULT);
        }
    }
    // macOS: its own alert sounds, played without waiting.
    #[cfg(target_os = "macos")]
    {
        let sound = if kind == "up" { "/System/Library/Sounds/Glass.aiff" } else { "/System/Library/Sounds/Tink.aiff" };
        let _ = std::process::Command::new("afplay").arg(sound).spawn();
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = kind;
}

#[cfg(desktop)]
fn hotkey() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space)
}

/// Ctrl+Alt+P (pause, carry on, or start what's next) and Ctrl+Alt+D (done).
#[cfg(desktop)]
fn timer_keys() -> [(tauri_plugin_global_shortcut::Shortcut, &'static str); 2] {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let key = |code| Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code);
    [(key(Code::KeyP), "toggle"), (key(Code::KeyD), "done")]
}

/// Turns the timer keys on or off. Another app may have one already: then it says so.
#[tauri::command]
pub async fn desk_timer_keys(app: AppHandle, on: bool) -> Result<()> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let shortcuts = app.global_shortcut();
        for (key, _) in timer_keys() {
            let registered = shortcuts.is_registered(key);
            if on && !registered {
                shortcuts.register(key).map_err(|err| Error::Invalid(format!("{key} is taken by another app: {err}")))?;
            } else if !on && registered {
                let _ = shortcuts.unregister(key);
            }
        }
    }
    Ok(())
}

/// Turns Ctrl+Alt+Space (bring Lemma out, from anywhere) on or off.
/// Another app may have it already: then it says so.
#[tauri::command]
pub async fn desk_hotkey(app: AppHandle, on: bool) -> Result<()> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let shortcuts = app.global_shortcut();
        let registered = shortcuts.is_registered(hotkey());
        if on && !registered {
            shortcuts.register(hotkey()).map_err(|err| Error::Invalid(format!("Ctrl+Alt+Space is taken by another app: {err}")))?;
        } else if !on && registered {
            let _ = shortcuts.unregister(hotkey());
        }
    }
    Ok(())
}

/// Listens for Ctrl+Alt+Space and the timer keys, once they're turned on
/// (`desk_hotkey`, `desk_timer_keys`).
#[cfg(desktop)]
pub fn listen_for_hotkey(app: &tauri::App) -> tauri::Result<()> {
    use tauri_plugin_global_shortcut::ShortcutState;
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, pressed, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if pressed == &hotkey() {
                    summon(app);
                } else if let Some((_, what)) = timer_keys().into_iter().find(|(key, _)| key == pressed) {
                    let _ = app.emit(KEY_EVENT, what);
                }
            })
            .build(),
    )
}
