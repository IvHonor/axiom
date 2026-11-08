import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";
import { normaliseLook, type Look } from "./look";

export interface Outfit { id: string; name: string; look: Look }
export interface CompanionPrefs {
  size: number;
  brightness: number;
  movement: number;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  follow: boolean;
  voice: string;
  rate: number;
  outfits: Outfit[];
}
export const DEFAULT_PREFS: CompanionPrefs = { size: 160, brightness: 1, movement: 1, corner: "bottom-right", follow: true, voice: "", rate: 1, outfits: [] };
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
