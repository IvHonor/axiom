// Keeping the screen awake, by asking Lemma on the desktop: "keep my screen
// awake", "…for 90 minutes", "let my screen sleep". Understood here, without
// the AI, so it's instant and works without an account. The desktop app
// holds it (src-tauri/src/keep_awake.rs).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvent } from "./sync";

/** The longest one request keeps the screen awake (as `MAX_MINUTES` in keep_awake.rs). */
export const MAX_AWAKE_MINUTES = 4 * 60;

/** The lengths offered when someone doesn't say. */
export const AWAKE_CHOICES: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
];

const EVENT = "keep-awake-changed";

export const keepAwake = (minutes: number) => invoke<number>("keep_awake_start", { minutes });
export const letSleep = () => invoke<void>("keep_awake_stop");
const awakeUntil = () => invoke<number | null>("keep_awake_status");

/** When the screen's being kept awake until (ms since 1970), or null. Follows changes from either window. */
export function useKeepAwake(): number | null {
  const [until, setUntil] = useState<number | null>(null);
  useEffect(() => {
    awakeUntil().then((at) => setUntil(at ?? null), () => setUntil(null));
  }, []);
  useTauriEvent<number | null>(EVENT, (at) => setUntil(at ?? null));
  return until;
}

export type AwakeRequest = { kind: "start"; minutes: number | null } | { kind: "stop" };

const SCREEN = String.raw`(?:screen|display|monitor|computer|pc|laptop|mac|machine|it)`;
const STOP = [
  new RegExp(String.raw`\b(?:let|allow)\b.*\b${SCREEN}\b.*\b(?:sleep|dim|turn off|go to sleep)\b`, "i"),
  /\bstop keeping\b.*\bawake\b/i,
  /\b(?:you can )?stop keeping (?:it|the screen|my screen) (?:awake|on)\b/i,
  /\bno longer keep\b.*\bawake\b/i,
];
const START = [
  new RegExp(String.raw`\b(?:keep|leave)\b.*\b${SCREEN}\b.*\b(?:awake|on|from sleeping|from going to sleep)\b`, "i"),
  new RegExp(String.raw`\b(?:don'?t|do not|stop)\b.*\blet\b.*\b${SCREEN}\b.*\b(?:sleep|dim|turn off|go to sleep)\b`, "i"),
  new RegExp(String.raw`\b(?:don'?t|do not)\b.*\b${SCREEN}\b.*\b(?:sleep|dim)\b`, "i"),
  /^\s*(?:please\s+)?(?:keep|stay) awake\b/i,
];

/** "keep my screen awake for 1 hour 30 min" → start, 90; "let my screen sleep" → stop; anything else → null. */
export function parseKeepAwake(text: string): AwakeRequest | null {
  const said = text.trim();
  if (!said || said.length > 200) return null;
  // "Don't let my screen sleep" asks to keep it awake, though it has "let … sleep" in it.
  const negated = /\b(?:don'?t|do not|never)\b/i.test(said);
  if (!negated && STOP.some((pattern) => pattern.test(said))) return { kind: "stop" };
  if (!START.some((pattern) => pattern.test(said))) return null;
  return { kind: "start", minutes: minutesIn(said) };
}

/** How long a request asks for, in minutes, or null if it doesn't say. */
export function minutesIn(text: string): number | null {
  const said = text.toLowerCase();
  let minutes = 0;
  let found = false;
  if (/\bhalf an? hour\b/.test(said)) {
    minutes += 30;
    found = true;
  }
  if (/\b(?:an|one|a) hour\b/.test(said) && !/\bhalf an hour\b/.test(said)) {
    minutes += 60;
    found = true;
  }
  if (/\ba couple of hours\b/.test(said)) {
    minutes += 120;
    found = true;
  }
  for (const match of said.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/g)) {
    const n = Number(match[1]);
    minutes += match[2].startsWith("h") ? n * 60 : n;
    found = true;
  }
  return found ? Math.round(minutes) : null;
}

/** "1:05" for an hour and five minutes left; "0:42" for forty-two minutes. */
export function awakeClock(msLeft: number): string {
  const minutes = Math.max(0, Math.ceil(msLeft / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "1 h 5 min", "42 min". */
export function awakeLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}
