// How Lemma is on the desktop, from Lemma's settings: when he's there
// (always, until hidden; only while a timer runs; or never), which corner
// he sits in, how big he is, whether Ctrl+Alt+Space has him listen and the
// timer keys work, whether he talks about the day and cheers, keeps quiet
// in full-screen apps and calls, notices time away, chimes, nudges you to
// take breaks and asks how the day went. Part of the profile, so it
// syncs; the desktop window hears changes straight away.
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";

export type DeskMode = "always" | "timers" | "off";
/** Floating anywhere, or tucked into the side of the screen as a notch that he pops out of. */
export type DeskStyle = "float" | "notch";
export type DeskCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
/** Focus in rounds: minutes of focus, then of break; or not. */
export type DeskRounds = "off" | "25/5" | "50/10";
/** Where the weather in his halo is for. */
export type WeatherFrom = "auto" | "place" | "off";

export interface DeskPrefs {
  mode: DeskMode;
  style: DeskStyle;
  corner: DeskCorner;
  /** Ctrl+Alt+Space brings Lemma out, listening. */
  hotkey: boolean;
  /** With nothing being timed, Lemma says what's worth knowing about the day. */
  nudges: boolean;
  /** Lemma cheers when things get done. */
  cheers: boolean;
  /** How big Lemma is, in pixels: scroll over him to change it. */
  size: number;
  /** A timed task pauses for a break after so long, and Lemma says when to carry on. */
  rounds: DeskRounds;
  /** Ctrl+Alt+P pauses, carries on or starts what's next; Ctrl+Alt+D finishes it. */
  timerKeys: boolean;
  /** He keeps out of the way while a full-screen app or a call is on. */
  quiet: boolean;
  /** Away from the computer with a timer running: he asks whether to count it. */
  away: boolean;
  /** A soft chime when time's up, a reminder rings or a meeting's about to start. */
  sound: boolean;
  /** After a long stretch at the computer, a nudge to stand up, look away or drink some water. */
  breaks: boolean;
  /** In the evening, how was today? One tap saves it to the journal. */
  checkin: boolean;
  /**
   * The weather in his halo: wherever the computer is (found on it), a
   * place you name, or none (and nothing's looked up).
   */
  weatherFrom: WeatherFrom;
  /** The place, for `weatherFrom: "place"` (a town or city). */
  weather: string;
}

export const SIZE = { smallest: 72, largest: 240, step: 12 };

export const DESK_MODES: { id: DeskMode; label: string }[] = [
  { id: "always", label: "Always" },
  { id: "timers", label: "While a timer runs" },
  { id: "off", label: "Never" },
];

export const DESK_STYLES: { id: DeskStyle; label: string }[] = [
  { id: "float", label: "Floating" },
  { id: "notch", label: "Tucked into the edge" },
];

export const DESK_CORNERS: { id: DeskCorner; label: string }[] = [
  { id: "bottom-right", label: "Bottom right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "top-right", label: "Top right" },
  { id: "top-left", label: "Top left" },
];

export const WEATHER_FROM: { id: WeatherFrom; label: string }[] = [
  { id: "auto", label: "Where I am" },
  { id: "place", label: "A place" },
  { id: "off", label: "Off" },
];

export const DESK_ROUNDS: { id: DeskRounds; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "25/5", label: "25 min, 5 min break" },
  { id: "50/10", label: "50 min, 10 min break" },
];

/** A round's minutes of focus and of break. */
export const roundsOf = (r: DeskRounds) => (r === "off" ? null : { focus: Number(r.split("/")[0]), rest: Number(r.split("/")[1]) });

export const DEFAULT_PREFS: DeskPrefs = { mode: "always", style: "notch", corner: "bottom-right", hotkey: true, nudges: true, cheers: true, size: 130, rounds: "off", timerKeys: true, quiet: true, away: true, sound: false, breaks: false, checkin: false, weatherFrom: "off", weather: "" };

const KEY = "axiom.desk";

export function parsePrefs(saved: unknown): DeskPrefs {
  const v = saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  return {
    mode: DESK_MODES.find((m) => m.id === v.mode)?.id ?? DEFAULT_PREFS.mode,
    style: DESK_STYLES.find((s) => s.id === v.style)?.id ?? DEFAULT_PREFS.style,
    corner: DESK_CORNERS.find((c) => c.id === v.corner)?.id ?? DEFAULT_PREFS.corner,
    hotkey: v.hotkey !== false,
    nudges: v.nudges !== false,
    cheers: v.cheers !== false,
    timerKeys: v.timerKeys !== false,
    quiet: v.quiet !== false,
    away: v.away !== false,
    // Asked for, so off unless turned on.
    sound: v.sound === true,
    breaks: v.breaks === true,
    checkin: v.checkin === true,
    weather: typeof v.weather === "string" ? v.weather.replace(/\s+/g, " ").trim().slice(0, 60) : "",
    // Set before there was a choice: a place typed in meant that place.
    weatherFrom: WEATHER_FROM.find((w) => w.id === v.weatherFrom)?.id ?? (typeof v.weather === "string" && v.weather.trim() ? "place" : "off"),
    rounds: DESK_ROUNDS.find((r) => r.id === v.rounds)?.id ?? DEFAULT_PREFS.rounds,
    size: typeof v.size === "number" && Number.isFinite(v.size) ? Math.round(Math.min(SIZE.largest, Math.max(SIZE.smallest, v.size))) : DEFAULT_PREFS.size,
  };
}

let prefs = parsePrefs(readSetting(KEY));
const listeners = new Set<() => void>();

onSettingSynced(KEY, (saved) => {
  prefs = parsePrefs(saved);
  listeners.forEach((listener) => listener());
});

export function setDeskPrefs(change: Partial<DeskPrefs>) {
  prefs = parsePrefs({ ...prefs, ...change });
  saveSetting(KEY, prefs);
  listeners.forEach((listener) => listener());
}

export function useDeskPrefs(): DeskPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}
