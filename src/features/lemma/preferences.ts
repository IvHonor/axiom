import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";
import { normaliseLook, type Look } from "./look";

export interface Outfit { id: string; name: string; look: Look }
/**
 * Where the companion was dragged to, as shares of the room it can move in
 * (0 left/top … 1 right/bottom), so the same spot works on a wide desktop
 * window and on a phone. Null: in `corner`.
 */
export interface Spot { x: number; y: number }
export interface CompanionPrefs {
  size: number;
  brightness: number;
  movement: number;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  spot: Spot | null;
  follow: boolean;
  voice: string;
  rate: number;
  outfits: Outfit[];
}
export const DEFAULT_PREFS: CompanionPrefs = { size: 160, brightness: 1, movement: 1, corner: "bottom-right", spot: null, follow: true, voice: "", rate: 1, outfits: [] };
const share = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
function normaliseSpot(v: unknown): Spot | null {
  if (!v || typeof v !== "object") return null;
  const x = share((v as Spot).x), y = share((v as Spot).y);
  return x === null || y === null ? null : { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}
export const MAX_OUTFITS = 12;
const KEY = "axiom.lemma.preferences";
const listeners = new Set<() => void>();
export function normalisePrefs(saved: unknown): CompanionPrefs {
  const p = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
  const number = (key: string, min: number, max: number, fallback: number) => typeof p[key] === "number" && Number.isFinite(p[key]) ? Math.max(min, Math.min(max, p[key] as number)) : fallback;
  const ids = new Set<string>();
  const outfits: Outfit[] = [];
  if (Array.isArray(p.outfits)) for (const item of p.outfits.slice(0, MAX_OUTFITS)) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || ids.has(item.id.slice(0, 80)) || typeof item.name !== "string") continue;
    const name = item.name.trim().slice(0, 32);
    if (!name) continue;
    ids.add(item.id.slice(0, 80));
    outfits.push({ id: item.id.slice(0, 80), name, look: normaliseLook(item.look) });
  }
  return {
    size: number("size", 120, 240, 160), brightness: number("brightness", 0.25, 1.5, 1), movement: number("movement", 0, 1.5, 1),
    corner: (["bottom-right", "bottom-left", "top-right", "top-left"] as const).find(c => c === p.corner) ?? "bottom-right",
    spot: normaliseSpot(p.spot),
    follow: p.follow !== false, voice: typeof p.voice === "string" ? p.voice.slice(0, 256) : "", rate: number("rate", 0.6, 1.4, 1), outfits,
  };
}
let prefs = normalisePrefs(readSetting(KEY));
onSettingSynced(KEY, saved => { prefs = normalisePrefs(saved); listeners.forEach(fn => fn()); });
export const getCompanionPrefs = () => prefs;
export function setCompanionPrefs(change: Partial<CompanionPrefs>) {
  prefs = normalisePrefs({ ...prefs, ...change });
  saveSetting(KEY, prefs);
  listeners.forEach(fn => fn());
}
export function useCompanionPrefs() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => prefs);
}
