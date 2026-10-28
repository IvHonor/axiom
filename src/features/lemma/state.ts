// What Lemma is doing right now, shared by every place it shows (the chat,
// the overview tile), so its face always tells the same story.
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";

/** Busy with: nothing, hearing you, waiting on the AI, reading an area, or preparing a change. */
export type Activity = "idle" | "listening" | "thinking" | "looking" | "preparing";
/** A feeling that passes after a moment: pleased with an answer, or troubled by a problem. */
export type Feeling = "happy" | "concerned" | null;

export interface LemmaState {
  activity: Activity;
  /** The area it's busy in (an extension id), for the tool it holds. */
  area: string | null;
  /** How loud you are while it listens, 0 to 1. */
  level: number;
  /** Changes waiting for you to confirm. */
  waiting: number;
  feeling: Feeling;
}

let state: LemmaState = { activity: "idle", area: null, level: 0, waiting: 0, feeling: null };
const listeners = new Set<() => void>();
let feelingTimer = 0;

export function setLemma(change: Partial<LemmaState>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

/** Shows a feeling for a few seconds. */
export function feel(feeling: Exclude<Feeling, null>) {
  window.clearTimeout(feelingTimer);
  setLemma({ feeling });
  feelingTimer = window.setTimeout(() => setLemma({ feeling: null }), 3500);
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
  listen<{ state: Activity | "done"; area: string | null }>("assistant-progress", ({ payload }) =>
    setLemma(payload.state === "done" ? { activity: "idle", area: null } : { activity: payload.state, area: payload.area }),
  ).catch(() => {
    // Not inside Tauri (a plain browser tab): nothing to follow.
  });
}
