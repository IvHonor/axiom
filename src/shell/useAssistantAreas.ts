// The areas (extension ids) Lemma may see and change. None until the person
// switches some on: whatever it sees is sent to the AI. Shared by the chat
// and its settings, and kept on this computer.
import { useSyncExternalStore } from "react";

const KEY = "axiom.assistant.areas";

let areas: string[] = load();
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function setAllowed(id: string, on: boolean) {
  areas = on ? [...new Set([...areas, id])] : areas.filter((other) => other !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(areas));
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
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
