// What Lemma is doing right now, shared by every place it shows (the chat,
// the overview tile), so its face always tells the same story.
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";

/** Busy with: nothing, hearing you, waiting on the AI, reading an area, or preparing a change. */
export type Activity = "idle" | "listening" | "thinking" | "looking" | "preparing" | "speaking";
/** A feeling that passes after a moment: pleased with an answer, or troubled by a problem. */
export type Feeling = "happy" | "concerned" | "acknowledged" | "puzzled" | "encouraging" | null;

export interface LemmaState {
  activity: Activity;
  /** The area it's busy in (an extension id), for the tool it holds. */
  area: string | null;
  /** How loud you are while it listens, 0 to 1. */
  level: number;
  /** Changes waiting for you to confirm. */
  waiting: number;
  feeling: Feeling;
  focused: boolean;
  slow: boolean;
}

let state: LemmaState = { activity: "idle", area: null, level: 0, waiting: 0, feeling: null, focused: false, slow: false };
const listeners = new Set<() => void>();
let feelingTimer = 0;
let slowTimer = 0;
let lastCelebration = -Infinity;
const working = (activity: Activity) => ["thinking", "looking", "preparing"].includes(activity);

export function setLemma(change: Partial<LemmaState>) {
  if (change.activity && working(change.activity) !== working(state.activity)) {
    window.clearTimeout(slowTimer);
    change = { ...change, slow: false };
    if (working(change.activity!)) slowTimer = window.setTimeout(() => setLemma({ slow: true }), 12_000);
  }
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

/** Shows a feeling for a few seconds. */
export function feel(feeling: Exclude<Feeling, null>) {
  const celebration = feeling === "happy" || feeling === "encouraging";
  if (celebration && (state.focused || Date.now() - lastCelebration < 8000)) return;
  if (celebration) lastCelebration = Date.now();
  window.clearTimeout(feelingTimer);
  setLemma({ feeling });
  feelingTimer = window.setTimeout(() => setLemma({ feeling: null }), feeling === "happy" ? 1800 : feeling === "acknowledged" ? 1400 : 2400);
}

export function useLemma(): LemmaState {
  followProgress();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

// Lemma's progress comes from Rust (the chat may be closed while it works),
// so it's heard here, once, for every face.
let heard = false;

/** Starts following Lemma's progress events (once; `useLemma` calls it). */
function followProgress() {
  if (heard) return;
  heard = true;
  listen<{ state: Activity | "waiting" | "done"; area: string | null; text?: string | null }>("assistant-progress", ({ payload }) =>
    setLemma(
      payload.state === "done"
        ? { activity: "idle", area: null }
        : // Waiting on a busy AI looks like thinking.
          { activity: payload.state === "waiting" ? "thinking" : payload.state === "thinking" && payload.text?.trim() ? "speaking" : payload.state, area: payload.area },
    ),
  ).catch(() => {
    // Not inside Tauri (a plain browser tab): nothing to follow.
  });
}
