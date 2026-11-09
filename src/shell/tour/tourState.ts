// Whether Lemma's tour is showing. It starts by itself on a first run (see
// ../firstRun), and again whenever it's asked for from the Account panel.
import { useSyncExternalStore } from "react";
import { saveSetting } from "../../lib/settings";
import { TOUR_SEEN } from "../firstRun";

let running = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  running = next;
  listeners.forEach((listener) => listener());
}

export const startTour = () => set(true);

/** Finished or skipped: it doesn't start by itself again. */
export function endTour() {
  saveSetting(TOUR_SEEN, true);
  set(false);
}

export function useTourRunning(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => running,
  );
}
