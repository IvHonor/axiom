import type { Personality } from "./persona";
export type Mood = "idle" | "listening" | "thinking" | "looking" | "preparing" | "waiting" | "happy" | "concerned" | "sleepy" | "speaking" | "acknowledged" | "puzzled" | "patient" | "encouraging";
export type Expression = {
  eyes: [number, number];
  gaze: [number, number];
  brows: [number, number];
  browY: [number, number];
  mouth: "smile" | "flat" | "round" | "frown";
};

// Activity expressions stay consistent; personality only changes the resting face.
export const EXPRESSIONS: Record<Mood, Expression> = {
  idle:      { eyes: [1, 1], gaze: [0, 0], brows: [0.08, -0.08], browY: [0.20, 0.20], mouth: "smile" },
  listening: { eyes: [1.2, 1.2], gaze: [0, 0.015], brows: [0.12, -0.12], browY: [0.25, 0.25], mouth: "round" },
  thinking:  { eyes: [0.65, 0.85], gaze: [0.045, 0.045], brows: [-0.2, 0.25], browY: [0.19, 0.25], mouth: "flat" },
  looking:   { eyes: [0.8, 0.8], gaze: [0, -0.015], brows: [-0.12, 0.12], browY: [0.18, 0.18], mouth: "flat" },
  preparing: { eyes: [0.5, 0.5], gaze: [0, -0.025], brows: [-0.22, 0.22], browY: [0.17, 0.17], mouth: "flat" },
  waiting:   { eyes: [0.65, 1.1], gaze: [0, 0], brows: [0, 0.3], browY: [0.18, 0.26], mouth: "smile" },
  happy:     { eyes: [1, 1], gaze: [0, 0], brows: [0.15, -0.15], browY: [0.24, 0.24], mouth: "smile" },
  concerned: { eyes: [0.7, 0.7], gaze: [0, -0.01], brows: [0.35, -0.35], browY: [0.20, 0.20], mouth: "frown" },
  sleepy:    { eyes: [0.2, 0.2], gaze: [0, -0.025], brows: [0.08, -0.08], browY: [0.15, 0.15], mouth: "flat" },
  speaking:  { eyes: [1.05, 1.05], gaze: [0, 0], brows: [0.15, -0.15], browY: [0.23, 0.23], mouth: "round" },
  acknowledged: { eyes: [0.8, 0.8], gaze: [0, -0.01], brows: [0.08, -0.08], browY: [0.21, 0.21], mouth: "smile" },
  puzzled: { eyes: [0.65, 1.1], gaze: [0.025, 0.015], brows: [-0.1, 0.35], browY: [0.17, 0.27], mouth: "round" },
  patient: { eyes: [0.85, 0.85], gaze: [0, 0.01], brows: [0.1, -0.1], browY: [0.21, 0.21], mouth: "smile" },
  encouraging: { eyes: [0.95, 0.95], gaze: [0, 0], brows: [0.15, -0.15], browY: [0.23, 0.23], mouth: "smile" },
};

const RESTING: Record<Personality, Expression> = {
  standard: EXPRESSIONS.idle,
  cheerful: { ...EXPRESSIONS.idle, eyes: [1.2, 1.2], brows: [0.16, -0.16], browY: [0.24, 0.24] },
  calm: { ...EXPRESSIONS.idle, eyes: [0.78, 0.78], brows: [0.04, -0.04], browY: [0.18, 0.18] },
  direct: { ...EXPRESSIONS.idle, eyes: [0.95, 0.95], brows: [0, 0], mouth: "flat" },
  witty: { ...EXPRESSIONS.idle, eyes: [0.85, 1.05], brows: [0, 0.23], browY: [0.19, 0.25], mouth: "smile" },
  coach: { ...EXPRESSIONS.idle, eyes: [1.04, 1.04], brows: [-0.13, 0.13], browY: [0.21, 0.21] },
};

export function expressionOf(mood: Mood, personality: Personality, compact = false): Expression {
  const expression = mood === "idle" ? RESTING[personality] : EXPRESSIONS[mood];
  if (!compact) return expression;
  return { ...expression, eyes: expression.eyes.map(h => Math.max(mood === "sleepy" ? 0.3 : 0.55, h)) as [number, number], gaze: [0, 0] };
}
