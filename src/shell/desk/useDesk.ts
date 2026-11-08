// The main window's side of Lemma on the desktop, as Lemma's settings say
// (see deskSetting.ts): it brings the desktop view out when Axiom opens
// (or only while a timer runs), and again with each new timer; puts it
// away when it's no longer wanted (after a moment, so finishing can be
// celebrated) and while a full-screen app or a call is on; keeps it in its
// corner; turns Ctrl+Alt+Space and the timer keys on or off, and does what
// the timer keys ask; and does what the desktop view asks for here
// (opening an area, stopping or adjusting study and reading time).
import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { api, type CalendarEvent, type PlanTask } from "../../features/daily_plan/api";
import { nowMinute, today } from "../../features/daily_plan/time";
import { dropTimer as dropStudy, shiftTimer as shiftStudy, stopTimer as stopStudy, useLearningUi } from "../../features/learning/learningUi";
import { dropReading, shiftReading, stopReading, useReadingUi } from "../../features/reading/readingUi";
import { useLockStatus } from "../../lib/appLock";
import { useTauriEvent } from "../../lib/sync";
import type { View } from "../view";
import { useAssistantAreas } from "../useAssistantAreas";
import { meetingLink, useTodaysEvents } from "./dayNotes";
import { useDeskPrefs } from "./deskSetting";
import { feel, setLemma } from "../../features/lemma/state";
import { handOff } from "./handoff";
import { ringDue, ringing as ringingNow, useRinging } from "./reminders";
import { DESK_ACTION, deskState, hideDesk, KEY_EVENT, notify, openMain, placeDesk, sayOnDesk, setBackground, setHotkey, setPaused, setTimerKeys, showDesk, useTimers, type DeskAction } from "./timers";

/** How long the desktop view stays once there's nothing to time. */
const LINGER_MS = 2500;
/** How often it's checked whether a full-screen app or a call is on. */
const BUSY_MS = 4000;

/**
 * Whether a full-screen app, a call or an online meeting from the calendar
 * is on (when he's set to keep out of the way then): a meeting being
 * shared on screen shouldn't have him in it, even before the call starts.
 */
function useBusy(on: boolean, events: CalendarEvent[]): boolean {
  const [busy, setBusy] = useState(false);
  const meetings = useRef(events);
  meetings.current = events;
  useEffect(() => {
    if (!on || !isTauri()) return setBusy(false);
    let gone = false;
    const check = () => {
      const minute = nowMinute();
      const meeting = meetings.current.some((e) => meetingLink(e) && e.startMinute <= minute && minute < e.startMinute + e.durationMinutes);
      deskState().then(
        (s) => !gone && setBusy(s.fullScreen || s.call || meeting),
        () => !gone && setBusy(meeting),
      );
    };
    check();
    const every = setInterval(check, BUSY_MS);
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [on]);
  return busy;
}

/** Today's first top priority not done yet, or else the first task: what Ctrl+Alt+P starts when nothing's timed. */
async function nextTask(): Promise<PlanTask | null> {
  const day = await api.getDay(today(), today());
  const open = day.tasks.filter((t) => !t.doneAt);
  const ranked = open.filter((t) => t.focusRank !== null).sort((a, b) => (a.focusRank ?? 0) - (b.focusRank ?? 0));
  return ranked[0] ?? open[0] ?? null;
}

export function useDesk(open: (view: View) => void) {
  const { mode, corner, hotkey, timerKeys, quiet } = useDeskPrefs();
  const lock = useLockStatus();
  const timers = useTimers();
  const { running, paused } = timers;
  const study = useLearningUi().timer;
  const reading = useReadingUi().timer;
  useEffect(() => {
    setLemma({ focused: !!(running || study || reading) });
    return () => setLemma({ focused: false });
  }, [!!running, !!study, !!reading]);
  const previousProgress = useRef<{ day: string; done: number } | null>(null);
  useEffect(() => {
    if (!timers.today) return;
    const day = today(), done = timers.today.done;
    const previous = previousProgress.current;
    previousProgress.current = { day, done };
    if (previous?.day === day && done > previous.done) feel(done === timers.today.total ? "happy" : "encouraging");
  }, [timers.today?.done, timers.today?.total]);
  // Until the lock has answered, Axiom may be locked: nothing shows.
  const locked = !lock || lock.locked;
  const { areas } = useAssistantAreas();
  const events = useTodaysEvents(quiet && !locked && areas.includes("daily_plan"));
  const busy = useBusy(quiet && !locked, events);

  // A timer started since the pause (here, or on another computer) means
  // the paused task isn't waiting any more. One started before it is only
  // this window not having caught up with the pause yet.
  useEffect(() => {
    if (running?.timerStartedAt && paused && Date.parse(running.timerStartedAt) > Date.parse(paused.updatedAt)) setPaused(null);
  }, [running, paused]);

  // What's being timed: a new one brings the desktop view back, even after
  // it was closed for the one before.
  const timing = running?.id ?? paused?.id ?? (study ? `study:${study.startedAt}` : null) ?? (reading ? `reading:${reading.startedAt}` : null);
  // A reminder that's due brings him out, whatever he's set to: it was asked for.
  const ringing = useRinging();
  useEffect(() => {
    if (locked) return;
    // Said by him, and by the system too, in case he's not looked at.
    const check = () => {
      if (!ringDue()) return;
      const due = ringingNow();
      if (due && isTauri()) void notify("Reminder", due.text).catch(() => {});
    };
    check();
    const watch = setInterval(check, 10_000);
    return () => clearInterval(watch);
  }, [locked, ringing]);
  // During a full-screen app or a call he keeps out of the way. What he had
  // to say waits: a reminder keeps ringing, and time's up is said when he's back.
  const wanted = !locked && !busy && ((mode !== "off" && (mode === "always" || timing !== null)) || ringing !== null);
  const shown = useRef(false);
  useEffect(() => {
    if (!isTauri()) return;
    if (wanted) {
      shown.current = true;
      showDesk(corner).catch((e) => console.error("Lemma couldn't come onto the desktop:", e));
      return;
    }
    if (!shown.current) return;
    const wait = setTimeout(() => {
      shown.current = false;
      void hideDesk().catch(() => {});
    }, mode === "timers" && !locked && !busy ? LINGER_MS : 0);
    return () => clearTimeout(wait);
    // A new corner moves it (below) rather than showing it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, timing, mode, locked, busy, ringing?.id]);

  // A corner chosen in his settings: he goes there (instead of where he was
  // last dragged). Not on opening, when the dragged spot still counts.
  const placed = useRef(corner);
  useEffect(() => {
    if (placed.current === corner) return;
    placed.current = corner;
    if (isTauri()) void placeDesk(corner).catch(() => {});
  }, [corner]);

  // Locked, the keys mustn't bring out (or change) what's behind the lock.
  useEffect(() => {
    if (isTauri()) setHotkey(hotkey && !locked).catch((e) => console.warn(String(e)));
  }, [hotkey, locked]);
  useEffect(() => {
    if (isTauri()) setTimerKeys(timerKeys && !locked).catch((e) => console.warn(String(e)));
  }, [timerKeys, locked]);
  // Always on the desktop, closing Axiom's window only hides it: Axiom carries
  // on in the background, and his menu brings it back (or quits).
  useEffect(() => {
    if (isTauri()) void setBackground(mode === "always").catch(() => {});
  }, [mode]);

  // Ctrl+Alt+P: pause what's timed, carry on with what's paused, or start
  // today's next task. Ctrl+Alt+D: what's timed is done. He says which.
  const now = useRef({ running, paused, locked });
  now.current = { running, paused, locked };
  useTauriEvent<string>(KEY_EVENT, (what) => {
    const { running, paused, locked } = now.current;
    if (locked) return;
    const work = async () => {
      const task = running ?? paused;
      if (what === "done") {
        if (!task) return sayOnDesk("Nothing's being timed.");
        await api.setDone(task.id, true);
        setPaused(null);
        return sayOnDesk(`Done: **${task.title}**.`);
      }
      if (running) {
        setPaused(await api.stopTimer(running.id));
        return sayOnDesk(`Paused **${running.title}**.`);
      }
      if (paused) {
        await api.startTimer(paused.id);
        setPaused(null);
        return sayOnDesk(`Back to **${paused.title}**.`);
      }
      const next = await nextTask();
      if (!next) return sayOnDesk("There's nothing left on today's list to time.");
      await api.startTimer(next.id);
      sayOnDesk(`Timing **${next.title}**.`);
    };
    work().catch((e) => sayOnDesk(String(e).replace(/^Error: /, "")));
  });

  useTauriEvent<DeskAction>(DESK_ACTION, (action) => {
    if (action.kind === "take-off") {
      // Time away, off whichever of these runs.
      shiftStudy(action.minutes);
      shiftReading(action.minutes);
      return;
    }
    // Lemma logs these himself: they just stop.
    if (action.kind === "study-stop" && action.quiet) return dropStudy();
    if (action.kind === "reading-stop" && action.quiet) return dropReading();
    if (action.kind === "open") {
      open({ kind: "extension", id: action.area });
    } else if (action.kind === "open-chat") {
      // Asked in a new chat, on the Lemma tab.
      handOff(action.text);
      open({ kind: "extension", id: "lemma" });
    } else if (action.kind === "reading-stop") {
      // The book opens with the minutes ready to log beside the page reached.
      stopReading();
      open({ kind: "extension", id: "reading" });
    } else {
      // Stopping study time asks how it went, in Learning.
      stopStudy();
      open({ kind: "extension", id: "learning" });
    }
    void openMain().catch(() => {});
  });
}
