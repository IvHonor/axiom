// Secrets found (finding Nexus, say), for the secret achievements. Part of
// the profile, so a secret found on one computer counts on the others.
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";

const KEY = "axiom.achievements.secrets";
const parse = (raw: unknown) => (Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
let found = parse(readSetting(KEY));
const listeners = new Set<() => void>();
onSettingSynced(KEY, (raw) => { found = parse(raw); listeners.forEach((l) => l()); });

export function markFound(id: string) {
  if (found.includes(id)) return;
  found = [...found, id];
  saveSetting(KEY, found);
  listeners.forEach((l) => l());
}

export function useSecrets(): string[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => found);
}
