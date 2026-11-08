import { useEffect, useRef, useState } from "react";

/** Width of an element, kept up to date as it resizes. */
export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A "nice" axis maximum and three gridline values for counts. */
export function scale(max: number) {
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  return { top, ticks: [0, top / 2, top] };
}

/** An axis maximum for any amount: two even steps of 1, 2 or 5 times a power
 * of ten, counted in `unit`s (60 for minutes as hours, 100 for pence as pounds). */
export function niceScale(max: number, least = 2, unit = 1): { top: number; ticks: number[] } {
  if (unit !== 1) {
    const scaled = niceScale(max / unit, least / unit);
    return { top: scaled.top * unit, ticks: scaled.ticks.map((t) => t * unit) };
  }
  const half = Math.max(least / 2, max / 2);
  const power = 10 ** Math.floor(Math.log10(half));
  // No 2.5 steps for whole numbers under ten: counts shouldn't tick at 2.5.
  const step = [1, 2, ...(power === 1 ? [] : [2.5]), 5, 10].map((m) => m * power).find((s) => s >= half) ?? 10 * power;
  return { top: step * 2, ticks: [0, step, step * 2] };
}

export const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

/** A bar path with its data end rounded and its baseline square. */
export function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

/** The same, hanging down from the baseline at `y`. */
export function roundedBottom(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y}V${y + h - radius}Q${x},${y + h} ${x + radius},${y + h}H${x + w - radius}Q${x + w},${y + h} ${x + w},${y + h - radius}V${y}Z`;
}
