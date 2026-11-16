export interface GlassOutline { start: [number, number]; curves: [number, number, number, number, number, number][] }

/** One silhouette for WebKit and AppKit: a tab flowing into the screen edge. */
export function dockOutline(width: number, height: number, side: "left" | "right"): GlassOutline {
  const k = 0.5522847498;
  const flare = Math.min(14, width / 4, height * 0.15);
  const radius = Math.min(24, width * 0.38, (height - 2 * flare) / 2);
  const curves: GlassOutline["curves"] = [
    [width, k * flare, width - flare + k * flare, flare, width - flare, flare],
    [radius, flare, radius, flare, radius, flare],
    [radius - k * radius, flare, 0, flare + radius - k * radius, 0, flare + radius],
    [0, height - flare - radius, 0, height - flare - radius, 0, height - flare - radius],
    [0, height - flare - radius + k * radius, radius - k * radius, height - flare, radius, height - flare],
    [width - flare, height - flare, width - flare, height - flare, width - flare, height - flare],
    [width - flare + k * flare, height - flare, width, height - k * flare, width, height],
    [width, 0, width, 0, width, 0],
  ];
  const mirror = (x: number) => side === "left" ? width - x : x;
  return { start: [mirror(width), 0], curves: curves.map(curve => curve.map((n, i) => i % 2 === 0 ? mirror(n) : n) as GlassOutline["curves"][number]) };
}

export const outlinePath = (outline: GlassOutline) => `M ${outline.start.join(" ")} ${outline.curves.map(curve => "C " + curve.join(" ")).join(" ")} Z`;
