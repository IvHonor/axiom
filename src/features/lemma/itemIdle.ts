import type { Holding } from "./look";

export type IdleRoutine = "coffee" | "book" | "plant" | "glitch" | "first-light" | "long-hour" | "last-word" | "gyges-ring" | "true-compass";
export const IDLE_DURATION: Record<IdleRoutine, number> = { coffee: 7, book: 8, plant: 8.5, glitch: 7.5, "first-light": 7, "long-hour": 10.5, "last-word": 11, "gyges-ring": 12, "true-compass": 14 };
export const routineFor = (holding: Holding, admin: boolean, firstLight = false): IdleRoutine | null => holding === "coffee" || holding === "book" || holding === "plant" || holding === "long-hour" || holding === "last-word" || holding === "gyges-ring" || holding === "true-compass" ? holding : holding === "glitch" && admin ? "glitch" : holding === "first-light" && firstLight ? "first-light" : null;
export interface IdleInput {
  now: number;
  /** A routine may start. */
  eligible: boolean;
  /** One someone asked to see may keep playing, whatever else is going on. Defaults to `eligible`. */
  allowed?: boolean;
  holding: Holding;
  admin: boolean;
  firstLight?: boolean;
}
export interface IdleFrame { kind: IdleRoutine; progress: number }

/** The countdown runs independently of pointer activity; busy moments defer it. */
export function createIdleDirector(random = Math.random, completed?: (kind: IdleRoutine) => void) {
  let current: IdleRoutine | null = null, nextAt = Infinity, started: number | null = null, lastNow = 0;
  /** Asked for by pressing something, so a stray click or sync doesn't end it. */
  let requested = false;
  const delay = () => 60 + random() * 120;
  const reset = () => { current = null; nextAt = Infinity; started = null; requested = false; };
  const stop = () => { if (started !== null) { started = null; requested = false; nextAt = lastNow + delay(); } };
  return {
    interrupt() { if (!requested) stop(); },
    reset,
    /** Plays the routine. With `restart` off, one already playing simply carries on. */
    preview(input: IdleInput, restart = true) {
      const kind = input.eligible ? routineFor(input.holding, input.admin, input.firstLight) : null;
      if (!kind) return false;
      if (!restart && current === kind && started !== null) { requested = true; return true; }
      current = kind; started = input.now; requested = true; return true;
    },
    tick(input: IdleInput): IdleFrame | null {
      lastNow = input.now;
      const kind = routineFor(input.holding, input.admin, input.firstLight);
      if (!kind) { reset(); return null; }
      if (kind !== current) { current = kind; started = null; requested = false; nextAt = input.now + delay(); }
      if (!input.eligible && !(requested && started !== null && (input.allowed ?? false))) { stop(); return null; }
      if (started === null && input.now >= nextAt) started = input.now;
      if (started === null) return null;
      const progress = (input.now - started) / IDLE_DURATION[kind];
      if (progress >= 1) { started = null; requested = false; nextAt = input.now + delay(); completed?.(kind); return null; }
      return { kind, progress: Math.max(0, progress) };
    },
  };
}

export function ease(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
export const pulse = (inAt: number, fullAt: number, outAt: number, endAt: number, t: number) => ease(inAt, fullAt, t) * (1 - ease(outAt, endAt, t));
