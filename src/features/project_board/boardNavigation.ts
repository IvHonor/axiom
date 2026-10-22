import { useSyncExternalStore } from "react";

export type BoardViewKind = "board" | "table" | "timeline" | "activity" | "insights" | "archive";
interface BoardTarget { sequence: number; projectId: string; taskId?: string; view: BoardViewKind }
let sequence = 0;
let target: BoardTarget | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** A one-shot destination survives mounting the board tab, then is consumed. */
export function openBoardTarget(projectId: string, taskId?: string, view: BoardViewKind = "board") {
  target = { sequence: ++sequence, projectId, taskId, view };
  listeners.forEach((listener) => listener());
}
export function consumeBoardTarget(sequence: number) {
  if (target?.sequence !== sequence) return;
  target = null;
  listeners.forEach((listener) => listener());
}
export const useBoardTarget = () => useSyncExternalStore(subscribe, () => target);
