// The areas (extension ids) Lemma may see and change. None until the person
// switches some on: whatever it sees is sent to the AI. Shared by the chat
// and its settings, and part of the profile, so it syncs.
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../lib/settings";

const KEY = "axiom.assistant.areas";

let areas: string[] = parse(readSetting(KEY));
const listeners = new Set<() => void>();

function parse(saved: unknown): string[] {
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
}

onSettingSynced(KEY, (saved) => {
  areas = parse(saved);
  listeners.forEach((listener) => listener());
});

function setAllowed(id: string, on: boolean) {
  areas = on ? [...new Set([...areas, id])] : areas.filter((other) => other !== id);
  saveSetting(KEY, areas);
  listeners.forEach((listener) => listener());
}

export function useAssistantAreas() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => areas,
  );
  return { areas: current, setAllowed };
}
