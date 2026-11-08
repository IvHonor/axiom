// Something said to Lemma on the desktop that needs a chat: the main
// window's Lemma tab picks it up and asks it in a new chat (AssistantView).
import { useSyncExternalStore } from "react";

let waiting: string | null = null;
const listeners = new Set<() => void>();

export function handOff(text: string) {
  waiting = text;
  listeners.forEach((listener) => listener());
}

/** The request waiting for a chat, taken: it's asked once. */
export function takeHandoff(): string | null {
  const text = waiting;
  waiting = null;
  listeners.forEach((listener) => listener());
  return text;
}

export function useHandoff(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => waiting,
  );
}
