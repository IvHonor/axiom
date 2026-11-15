// A streak's flame. It grows with the streak: a spark, a flame, a blaze, a
// blue plasma flame at 30 days and a white-violet nova at 100. A streak
// that hasn't been fed today yet burns low as an ember ("at risk").
import type { CSSProperties } from "react";
import { addDays } from "./stats";

export type FlameTier = "spark" | "flame" | "blaze" | "plasma" | "nova";

export function tierOf(streak: number): FlameTier | null {
  if (streak <= 0) return null;
  if (streak >= 100) return "nova";
  if (streak >= 30) return "plasma";
  if (streak >= 7) return "blaze";
  if (streak >= 3) return "flame";
  return "spark";
}

const TIER_NAME: Record<FlameTier, string> = { spark: "Spark", flame: "Flame", blaze: "Blaze", plasma: "Plasma", nova: "Nova" };

/** Fed today (as of their last update), or still waiting for today. */
export function atRisk(streakThrough: string | null, asOf: string | null): boolean {
  return !!streakThrough && !!asOf && streakThrough < asOf;
}

/** The next tier's threshold, for "4 more days to Blaze". */
export function nextTier(streak: number): { at: number; name: string } | null {
  for (const [at, tier] of [[3, "flame"], [7, "blaze"], [30, "plasma"], [100, "nova"]] as const) if (streak < at) return { at, name: TIER_NAME[tier] };
  return null;
}

interface FlameProps {
  streak: number;
  risk?: boolean;
  size?: number;
  /** Show the number beside it. */
  count?: boolean;
  best?: number;
}

export function Flame({ streak, risk = false, size = 18, count = true, best }: FlameProps) {
  const tier = tierOf(streak);
  if (!tier) return null;
  const title = `${TIER_NAME[tier]}: ${streak} ${streak === 1 ? "day" : "days"} in a row${risk ? ". Not fed today yet" : ""}${best && best > streak ? ` · best ${best}` : ""}`;
  return (
    <span className="pg-flame" data-tier={tier} data-risk={risk || undefined} title={title} aria-label={title} role="img" style={{ "--flame-size": `${size}px` } as CSSProperties}>
      <svg viewBox="0 0 24 32" aria-hidden="true">
        <path className="pg-flame-outer" d="M12 1C13 7 19 10 20.5 17.5 22 25 17.5 31 12 31S2 26 3.2 18.8C4 14 7.5 12.5 7.8 8.2 10 10.5 10.4 13 10.2 15 12.6 12.4 12.8 6.4 12 1Z" />
        <path className="pg-flame-inner" d="M12 13.5C13.4 17 16.5 18.4 16.5 22.6 16.5 26 14.5 28.6 12 28.6S7.4 26.4 7.6 23.4C7.8 20.8 9.6 20 10.2 18 11.2 19.2 11.8 20 11.7 21.2 12.9 19.6 13 16.4 12 13.5Z" />
        {tier === "nova" && <g className="pg-flame-sparks"><circle cx="4" cy="8" r="1" /><circle cx="20" cy="5" r="0.9" /><circle cx="21.5" cy="12" r="0.7" /></g>}
      </svg>
      {count && <span className="pg-flame-count">{streak}</span>}
    </span>
  );
}

/** Whether a streak shown today is still burning, from someone's last update. */
export const stillBurning = (streakThrough: string | null, today: string) => !!streakThrough && streakThrough >= addDays(today, -2);
