// Secrets found (finding Nexus, say), for the secret achievements. Part of
// the profile, so a secret found on one computer counts on the others.
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { AREA_MARK, AREAS, THEME_MARK } from "./catalog";

const KEY = "axiom.achievements.secrets";
const parse = (raw: unknown) => (Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
let found = parse(readSetting(KEY));
const listeners = new Set<() => void>();
onSettingSynced(KEY, (raw) => {
  // Keeps what both sides know: an older copy from another device mustn't undo anything found here.
  const incoming = parse(raw), merged = [...new Set([...found, ...incoming])];
  if (merged.length !== found.length) { found = merged; listeners.forEach((l) => l()); }
  if (merged.length > incoming.length) saveSetting(KEY, merged);
});

export function markFound(id: string) {
  if (found.includes(id)) return;
  found = [...found, id];
  saveSetting(KEY, found);
  listeners.forEach((l) => l());
}

export const noteThemeTried = (id: string) => markFound(THEME_MARK + id);
export const noteAreaOpened = (id: string) => { if (AREAS.includes(id)) markFound(AREA_MARK + id); };

/** What's been found so far, for code outside React. */
export const currentSecrets = () => found;

export function useSecrets(): string[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => found);
}
