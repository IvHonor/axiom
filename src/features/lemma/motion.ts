import type { Mood } from "./expressions";
import type { Personality } from "./persona";

const STYLE: Record<Personality, { speed: number; energy: number }> = {
  standard: { speed: 1, energy: 1 }, cheerful: { speed: 1.15, energy: 1.25 },
  calm: { speed: 0.7, energy: 0.65 }, direct: { speed: 1.2, energy: 0.6 },
  witty: { speed: 0.85, energy: 1.05 }, coach: { speed: 1.1, energy: 1.1 },
};
type Spring = { value: number; velocity: number };
function follow(s: Spring, target: number, dt: number, stiffness: number, damping: number) {
  // Small integration steps keep settling stable after a slow or resumed frame.
  const steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.velocity += ((target - s.value) * stiffness - s.velocity * damping) * step;
    s.value += s.velocity * step;
  }
  return s.value;
}
export interface MotionInput {
  dt: number; now: number; mood: Mood; personality: Personality;
  x: number; y: number; hovered: boolean; focused: boolean; enabled: boolean;
  movement: number; notice: { x: number; y: number } | null;
}

export function createCompanionMotion() {
  const eyeX = { value: 0, velocity: 0 }, eyeY = { value: 0, velocity: 0 };
  const bodyX = { value: 0, velocity: 0 }, bodyY = { value: 0, velocity: 0 };
  const secondary = { value: 0, velocity: 0 }, hover = { value: 0, velocity: 0 };
  const lift = { value: 0, velocity: 0 };
  const space = { value: 0, velocity: 0 };
  let mood: Mood | null = null, changedAt = 0, greetingAt = -Infinity, clickedAt = -Infinity;
  let focusEndedAt = -Infinity, focused = false, lastGreeting = -Infinity;
  let lastNotice: MotionInput["notice"] = null, noticeAt = -Infinity;
  return {
    greet(now: number) { if (now - lastGreeting > 30) { greetingAt = now; lastGreeting = now; } },
    tap(now: number) { clickedAt = now; },
    tick(input: MotionInput) {
      const { now, personality, enabled } = input;
      const { speed, energy } = STYLE[personality];
      const dt = Math.min(0.08, Math.max(0, input.dt));
      if (mood !== input.mood) { mood = input.mood; changedAt = now; }
      if (focused && !input.focused) focusEndedAt = now;
      focused = input.focused;
      const amount = enabled ? input.movement * (focused ? 0.12 : 1) : 0;
      const expressive = enabled && !focused && input.movement > 0;
      const age = now - changedAt;
      const think = ["thinking", "preparing", "patient"].includes(input.mood);
      const answering = input.mood === "speaking";
      const attentive = answering || input.mood === "listening";
      if (lastNotice !== input.notice) { lastNotice = input.notice; noticeAt = now; }
      const panel = expressive && !attentive && !think ? input.notice : null;
      const notice = now - noticeAt < 2.2 ? panel : null;
      const targetX = (think ? 0.35 : attentive ? input.x * 0.25 : notice?.x ?? input.x) * amount;
      const targetY = (think ? -0.4 : notice?.y ?? input.y) * amount;
      const ex = follow(eyeX, targetX, dt, 220 * speed, 26 * Math.sqrt(speed));
      const ey = follow(eyeY, targetY, dt, 220 * speed, 26 * Math.sqrt(speed));
      const bx = follow(bodyX, targetX, dt, 48 * speed, 11 * Math.sqrt(speed));
      const by = follow(bodyY, targetY, dt, 48 * speed, 11 * Math.sqrt(speed));
      const sway = follow(secondary, Math.max(-0.15, Math.min(0.15, -bodyX.velocity * 0.06)), dt, 65, 9);
      const approach = follow(hover, expressive && input.hovered ? 1 : 0, dt, 55 * speed, 13);
      const shift = follow(space, panel ? -panel.x * 0.10 : 0, dt, 45, 13);
      const gesture = (start: number, duration: number) => {
        const p = (now - start) / duration;
        return expressive && p >= 0 && p < 1 ? Math.sin(p * Math.PI) * energy * input.movement : 0;
      };
      const welcome = gesture(greetingAt, 1.5), tap = gesture(clickedAt, 0.65), complete = gesture(focusEndedAt, 1.2);
      const bounce = tap * 0.07 + welcome * 0.045 + complete * 0.035;
      const accessoryLift = follow(lift, bounce, dt, 70, 9) - bounce;
      // A speaking phrase moves, then rests; it never bobs continuously.
      const phrase = age % 4.8;
      const speech = expressive && answering && phrase < 1.5 ? Math.sin(phrase / 1.5 * Math.PI * 2) * 0.035 * energy * amount : 0;
      const nod = expressive && age < 0.7 && ["listening", "acknowledged", "encouraging", "speaking"].includes(input.mood) ? Math.sin(age / 0.7 * Math.PI) * 0.09 * energy * amount : 0;
      return {
        eyeX: enabled ? ex : 0, eyeY: enabled ? ey : 0,
        bodyX: enabled ? bx : 0, bodyY: enabled ? by : 0,
        sway: enabled ? sway * amount : 0,
        lean: enabled ? approach * 0.07 * amount : 0,
        shift: enabled ? shift * amount : 0,
        nod: nod + speech + welcome * 0.10 + complete * 0.09,
        bounce, accessoryLift: enabled ? accessoryLift : 0,
        tilt: expressive && think ? Math.sin(Math.min(age, 1) * Math.PI / 2) * (personality === "witty" ? -0.085 : 0.045) * amount : speech * 0.5,
        energy, speed, greeting: welcome > 0,
      };
    },
  };
}
