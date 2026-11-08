// When the sidebar tucks itself away (each, as his settings allow): the
// window's narrow; an area needs the room (the board, the planner's week,
// month or year, an open journal entry); you've been writing for a little
// while in the journal or notes; or a focus timer's running. Says why, or
// null when there's no reason to.
import { useEffect, useRef, useState } from "react";
import { usePlanUi } from "../../features/daily_plan/planUi";
import { useJournalUi } from "../../features/journal/journalUi";
import type { View } from "../view";
import { useSidebarPrefs } from "./sidebarPrefs";

/** Narrower than this, the window keeps all its room for what's open. */
export const NARROW_PX = 1100;
/** Typing this long (without a pause longer than `PAUSE_MS`) is writing. */
const WRITING_MS = 8000;
const PAUSE_MS = 3000;
const WRITING_AREAS = ["journal", "notes"];

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text"));

export function useCollapseReason(active: View, timerRunning: boolean): string | null {
  const prefs = useSidebarPrefs();
  const plan = usePlanUi();
  const journal = useJournalUi();
  const area = active.kind === "extension" ? active.id : null;

  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_PX);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < NARROW_PX);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Writing: a few seconds of typing in the journal or notes. It lasts until
  // you leave the area.
  const [writing, setWriting] = useState(false);
  const typing = useRef<{ since: number; last: number } | null>(null);
  useEffect(() => {
    setWriting(false);
    typing.current = null;
    if (!area || !WRITING_AREAS.includes(area)) return;
    const onKey = (e: KeyboardEvent) => {
      if (!editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      const t = typing.current;
      typing.current = t && now - t.last < PAUSE_MS ? { since: t.since, last: now } : { since: now, last: now };
      if (now - typing.current.since >= WRITING_MS) setWriting(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [area]);

  const roomy = area === "project_board" || (area === "daily_plan" && ["week", "month", "year"].includes(plan.view)) || (area === "journal" && !!journal.entry);

  if (prefs.narrow && narrow) return "narrow";
  if (prefs.roomy && roomy) return `roomy:${area}`;
  if (prefs.writing && writing) return `writing:${area}`;
  if (prefs.focus && timerRunning) return "focus";
  return null;
}
