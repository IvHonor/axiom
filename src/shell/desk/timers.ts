// What's being timed, for Lemma on the desktop (Desk.tsx) and the main
// window that decides when he shows (useDesk.ts): the Daily Plan task whose
// timer runs, one paused from the desktop (so it can carry on there),
// Learning's study timer, Reading's reading timer, and what's next in the
// plan. Also the commands the desktop view runs on.
import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { api, type PlanTask, type TodaySummary } from "../../features/daily_plan/api";
import { nowMinute, today } from "../../features/daily_plan/time";
import type { Timer as StudyTimer } from "../../features/learning/learningUi";
import type { ReadingTimer } from "../../features/reading/readingUi";
import type { DeskCorner } from "./deskSetting";

/** Sent by Rust when a timer starts, stops or its task is done (see `desk.rs`). */
export const TIMER_EVENT = "timer-changed";
/** Sent by the desktop view to the main window: something to do there. */
export const DESK_ACTION = "desk-action";
/** `area`: an extension id ("daily_plan", "lemma"). */
export type DeskAction =
  | { kind: "open"; area: string }
  /** `quiet`: just stop it, as Lemma logs it himself; otherwise Axiom opens to log it. */
  | { kind: "study-stop"; quiet?: boolean }
  | { kind: "reading-stop"; quiet?: boolean }
  /** Time away from the computer, off Learning's or Reading's timer. */
  | { kind: "take-off"; minutes: number }
  /** Something said to Lemma that needs a chat: asked in a new one in Axiom. */
  | { kind: "open-chat"; text: string };
/** Sent by Rust when Ctrl+Alt+Space asks Lemma to listen. */
export const SUMMON_EVENT = "desk-summon";
/** Sent by Rust when a timer key is pressed (see `desk::KEY_EVENT`). */
export const KEY_EVENT = "desk-key";
/** Sent by the main window for Lemma to say (what a timer key did). */
export const SAY_EVENT = "desk-say";
/** Has Lemma say something, if he's out. */
export const sayOnDesk = (text: string) => void emit(SAY_EVENT, text).catch(() => {});

/** Asks the main window to do something (see useDesk.ts). */
export const askMain = (action: DeskAction) => void emit(DESK_ACTION, action).catch(() => {});

/** Learning and Reading keep their running timers here (learningUi.ts, readingUi.ts). */
const STUDY_KEY = "axiom.learning.timer";
const READING_KEY = "axiom.reading.timer";
/** A task paused from the desktop view, so it can carry on from there. */
const PAUSED_KEY = "axiom.desk.paused";

/** Where he was last dragged (his middle, on which screen): he goes back there. Kept on this computer. */
export interface Spot {
  x: number;
  y: number;
  monitor: string;
}
const SPOT_KEY = "axiom.desk.spot";
export const keepSpot = (spot: Spot | null) => {
  try {
    if (spot) localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
    else localStorage.removeItem(SPOT_KEY);
  } catch {
    // Without storage he goes back to his corner.
  }
};
const savedSpot = (): Spot | null => read<Spot>(SPOT_KEY);

/** Shows the desktop view where he was last dragged, or else in `corner`. */
export const showDesk = (corner: DeskCorner) => invoke<void>("desk_show", { corner, spot: savedSpot() });
/** Moves the desktop view to a corner, if it's open, and makes it go there from now on. */
export const placeDesk = (corner: DeskCorner) => {
  keepSpot(null);
  return invoke<void>("desk_place", { corner });
};
/** After a drag: snapped to a nearby edge, and where he is kept. */
export const settleDesk = () => invoke<Spot | null>("desk_settle").then((spot) => spot && keepSpot(spot));
/** Sent just before he's put away (to fade out), and if he's asked back meanwhile. */
export const LEAVE_EVENT = "desk-leave";
export const STAY_EVENT = "desk-stay";
/** Sent when Axiom closes: he waves goodbye first. */
export const BYE_EVENT = "desk-bye";
/** Turns Ctrl+Alt+Space on or off; refused when another app has it. */
export const setHotkey = (on: boolean) => invoke<void>("desk_hotkey", { on });
export const hideDesk = () => invoke<void>("desk_hide");
export const openMain = () => invoke<void>("desk_open_main");
/** Fits the window to Lemma (and whatever he's saying), keeping him where he is; `dock`: against the nearer screen edge, which it says. */
export const resizeDesk = (width: number, height: number, dock = false) => invoke<"left" | "right" | null>("desk_resize", { width, height, dock });
/** A notification from the system itself: time's up, a reminder. */
export const notify = (title: string, body: string) => invoke<void>("desk_notify", { title, body });
/** Turns Ctrl+Alt+P and Ctrl+Alt+D on or off; refused when another app has one. */
export const setTimerKeys = (on: boolean) => invoke<void>("desk_timer_keys", { on });

/** What's going on at the computer (checked on it, and kept there). Mirrors `desk::DeskState`. */
export interface DeskState {
  /** Since the keyboard or mouse was last used. */
  idleSeconds: number;
  /** A full-screen app is in front. */
  fullScreen: boolean;
  /** Another app has the microphone or camera on. */
  call: boolean;
  /** The window in front (not Axiom's), where it is on the screen. */
  active: { id: number; x: number; y: number; width: number; height: number } | null;
}
export const deskState = () => invoke<DeskState>("desk_state");
/** A soft chime: "up" for time's up and reminders, "soft" for a meeting about to start. */
export const chime = (kind: "up" | "soft") => void invoke<void>("desk_chime", { kind }).catch(() => {});
/** Takes time away from the computer off a task's tracked time. */
export const takeOff = (id: string, minutes: number) => invoke<PlanTask>("plan_take_off", { id, minutes });

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Remembers (or forgets, with null) the task paused from the desktop view. */
export function setPaused(task: PlanTask | null) {
  try {
    if (task) localStorage.setItem(PAUSED_KEY, JSON.stringify(task));
    else localStorage.removeItem(PAUSED_KEY);
  } catch {
    // Without storage, a paused task just leaves the desktop.
  }
  window.dispatchEvent(new Event("desk-paused"));
}

export interface Timers {
  /** The task whose timer runs. */
  running: PlanTask | null;
  /** A task paused from the desktop view. */
  paused: PlanTask | null;
  /** Learning's study timer, as the other window last saved it. */
  study: StudyTimer | null;
  /** Reading's timer, likewise. */
  reading: ReadingTimer | null;
  next: TodaySummary["nextBlock"];
  /** Today's tasks, and how many are done; null until known. */
  today: { total: number; done: number } | null;
  reload: () => void;
}

/**
 * Everything being timed, kept up to date: on every timer change, on
 * changes synced from other computers, when the other window saves, and
 * every half minute in case something was missed.
 */
export function useTimers(): Timers {
  const [plan, setPlan] = useState<{ running: PlanTask | null; next: TodaySummary["nextBlock"]; today: Timers["today"] }>({ running: null, next: null, today: null });
  const [paused, setPausedState] = useState<PlanTask | null>(() => read(PAUSED_KEY));
  const [study, setStudy] = useState<StudyTimer | null>(() => read(STUDY_KEY));
  const [reading, setReading] = useState<ReadingTimer | null>(() => read(READING_KEY));

  const reload = useCallback(() => {
    api.summary(today(), nowMinute()).then((s) => setPlan({ running: s.running, next: s.nextBlock, today: { total: s.total, done: s.done } }), () => {});
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    reload();
    const stops = [listen(TIMER_EVENT, reload), listen("data-changed", reload)];
    const every = setInterval(reload, 30_000);
    // The other window's saves (Learning's and Reading's timers, a task paused there).
    const onStorage = (e: StorageEvent) => {
      if (e.key === STUDY_KEY) setStudy(read(STUDY_KEY));
      if (e.key === READING_KEY) setReading(read(READING_KEY));
      if (e.key === PAUSED_KEY) setPausedState(read(PAUSED_KEY));
    };
    const onPaused = () => setPausedState(read(PAUSED_KEY));
    window.addEventListener("storage", onStorage);
    window.addEventListener("desk-paused", onPaused);
    return () => {
      stops.forEach((stop) => void stop.then((off) => off(), () => {}));
      clearInterval(every);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("desk-paused", onPaused);
    };
  }, [reload]);

  return { running: plan.running, paused, study, reading, next: plan.next, today: plan.today, reload };
}

/** The weather now where he's set to show it. Mirrors `desk::Weather`. */
export interface Weather {
  kind: "clear" | "clouds" | "fog" | "rain" | "snow" | "storm";
  temperature: number;
  place: string;
  day: boolean;
  /** How the place was found: typed in, Windows' location services, or the time zone. */
  source: "place" | "location" | "timezone";
}
/** `auto`: wherever the computer is (found on it); otherwise `city`. Looked up (from Open-Meteo) only when he's set to show the weather. */
export const weatherIn = (city: string, auto = false) => invoke<Weather | null>("desk_weather", { city, auto });

/** Closing Axiom's window only hides it (Axiom carrying on with Lemma on the desktop), or quits as usual. */
export const setBackground = (on: boolean) => invoke<void>("desk_background", { on });
/** Quits Axiom altogether (he waves goodbye first). */
export const quitAxiom = () => invoke<void>("desk_quit");
