import type { Holding } from "./look";

export type IdleRoutine = "coffee" | "book" | "plant" | "glitch" | "first-light";
export const IDLE_DURATION: Record<IdleRoutine, number> = { coffee: 7, book: 8, plant: 8.5, glitch: 7.5, "first-light": 7 };
export const routineFor = (holding: Holding, admin: boolean, firstLight = false): IdleRoutine | null => holding === "coffee" || holding === "book" || holding === "plant" ? holding : holding === "glitch" && admin ? "glitch" : holding === "first-light" && firstLight ? "first-light" : null;
export interface IdleInput { now: number; eligible: boolean; holding: Holding; admin: boolean; firstLight?: boolean }
export interface IdleFrame { kind: IdleRoutine; progress: number }

/** The countdown runs independently of pointer activity; busy moments defer it. */
export function createIdleDirector(random = Math.random) {
  let current: IdleRoutine | null = null, nextAt = Infinity, started: number | null = null, lastNow = 0;
  const delay = () => 60 + random() * 120;
  const reset = () => { current = null; nextAt = Infinity; started = null; };
  const interrupt = () => { if (started !== null) { started = null; nextAt = lastNow + delay(); } };
  return {
    interrupt, reset,
    preview(input: IdleInput) {
      const kind = input.eligible ? routineFor(input.holding, input.admin, input.firstLight) : null;
      if (!kind) return false;
      current = kind; started = input.now; return true;
    },
    tick(input: IdleInput): IdleFrame | null {
      lastNow = input.now;
      const kind = routineFor(input.holding, input.admin, input.firstLight);
      if (!kind) { reset(); return null; }
      if (kind !== current) { current = kind; started = null; nextAt = input.now + delay(); }
      if (!input.eligible) { interrupt(); return null; }
      if (started === null && input.now >= nextAt) started = input.now;
      if (started === null) return null;
      const progress = (input.now - started) / IDLE_DURATION[kind];
      if (progress >= 1) { started = null; nextAt = input.now + delay(); return null; }
      return { kind, progress: Math.max(0, progress) };
    },
  };
}

export function ease(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
export const pulse = (inAt: number, fullAt: number, outAt: number, endAt: number, t: number) => ease(inAt, fullAt, t) * (1 - ease(outAt, endAt, t));
