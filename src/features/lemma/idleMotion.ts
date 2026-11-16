import { ease, pulse } from "./itemIdle.ts";

export type IdleContext = "desktop" | "overview" | "chat";
export const IDLE_MOTIONS = {
  desktop: ["stretch", "nod", "wiggle"],
  overview: ["spin", "hover", "follow-light"],
  chat: ["tilt", "stretch", "doodle"],
} as const;
export type IdleMotion = (typeof IDLE_MOTIONS)[IdleContext][number];
export const MOTION_SECONDS: Record<IdleMotion, number> = {
  stretch: 3.8, nod: 3.2, wiggle: 2.4, spin: 4.8, hover: 4.8,
  "follow-light": 5, tilt: 3.2, doodle: 5,
};
export interface IdleMotionFrame { kind: IdleMotion; progress: number }
interface IdleInput { now: number; context?: IdleContext; eligible: boolean; paused?: boolean }

/** One short routine after 45–120 quiet seconds; activity starts a fresh rest. */
export function createIdleMotion(random = Math.random, completed?: (kind: IdleMotion) => void) {
  let context: IdleContext | undefined;
  let current: IdleMotion | null = null, previous: IdleMotion | null = null;
  let started = 0, nextAt = Infinity;
  const delay = () => 45 + random() * 75;
  const reset = () => { current = null; context = undefined; nextAt = Infinity; };
  return {
    reset,
    tick(input: IdleInput): IdleMotionFrame | null {
      if (!input.context || !input.eligible) { reset(); return null; }
      if (context !== input.context) {
        context = input.context; current = null; nextAt = input.now + delay();
      }
      // The overview's typewritten pages defer a routine without restarting its countdown.
      if (input.paused) {
        if (current) { current = null; nextAt = input.now + delay(); }
        return null;
      }
      if (current) {
        const progress = (input.now - started) / MOTION_SECONDS[current];
        if (progress < 1) return { kind: current, progress: Math.max(0, progress) };
        const finished = current;
        current = null; nextAt = input.now + delay();
        completed?.(finished);
        return null;
      }
      if (input.now < nextAt) return null;
      const choices = IDLE_MOTIONS[context].filter(kind => kind !== previous);
      current = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
      previous = current; started = input.now;
      return { kind: current, progress: 0 };
    },
  };
}

/** Offsets belong to a separate group, so stopping never leaves a spun body behind. */
export function idleMotionPose(frame: IdleMotionFrame | null) {
  const pose = { x: 0, y: 0, yaw: 0, pitch: 0, tilt: 0, stretch: 0, eyes: 1,
    gazeX: 0, gazeY: 0, lightX: 0, lightY: 0, light: 0, trail: 0 };
  if (!frame) return pose;
  const p = Math.max(0, Math.min(1, frame.progress));
  const envelope = pulse(0, 0.18, 0.78, 1, p);
  switch (frame.kind) {
    case "stretch": {
      const lift = pulse(0, 0.35, 0.6, 1, p);
      pose.stretch = lift * 0.10; pose.y = lift * 0.045;
      pose.pitch = -lift * 0.08; pose.eyes = 1 - lift * 0.7;
      break;
    }
    case "nod":
      pose.pitch = envelope * 0.20; pose.y = -envelope * 0.045;
      pose.eyes = 1 - envelope * 0.8;
      break;
    case "wiggle":
      pose.tilt = Math.sin(p * Math.PI * 6) * envelope * 0.09;
      pose.x = Math.sin(p * Math.PI * 4) * envelope * 0.035;
      break;
    case "spin":
      pose.yaw = ease(0, 1, p) * Math.PI * 2;
      pose.y = Math.sin(p * Math.PI) * 0.08;
      pose.tilt = Math.sin(p * Math.PI * 2) * envelope * 0.04;
      break;
    case "hover":
      pose.x = Math.sin(p * Math.PI * 2) * envelope * 0.14;
      pose.y = Math.sin(p * Math.PI * 4) * envelope * 0.10;
      pose.tilt = -Math.sin(p * Math.PI * 2) * envelope * 0.055;
      break;
    case "follow-light":
      pose.lightX = Math.sin(p * Math.PI * 2) * 0.85;
      pose.lightY = 0.6 + Math.cos(p * Math.PI * 2) * 0.36;
      pose.light = envelope;
      pose.gazeX = pose.lightX * envelope; pose.gazeY = -pose.lightY * envelope;
      pose.tilt = -pose.gazeX * 0.06;
      break;
    case "tilt":
      pose.tilt = Math.sin(p * Math.PI * 3) * envelope * 0.12;
      pose.pitch = envelope * 0.035;
      pose.gazeX = Math.sin(p * Math.PI * 3) * envelope * 0.3;
      break;
    case "doodle": {
      pose.trail = ease(0.08, 0.78, p);
      const angle = pose.trail * Math.PI * 2;
      pose.lightX = 1 + Math.cos(angle) * 0.32;
      pose.lightY = 0.55 + Math.sin(angle) * 0.32;
      pose.light = envelope;
      pose.gazeX = pose.lightX * envelope * 0.5; pose.gazeY = -pose.lightY * envelope * 0.6;
      pose.tilt = -envelope * 0.05;
      break;
    }
  }
  return pose;
}
