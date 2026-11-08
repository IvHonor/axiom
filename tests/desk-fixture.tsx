// Lemma on the desktop, with the main window's side (useDesk) beside it,
// against a pretend Axiom.
//   ?over:    the task's estimate (10 min) has run out: time's up.
//   ?study:   Learning's study timer runs instead.  ?reading: Reading's.
//   ?idle:    nothing's being timed.  ?soon: and a block starts in 10 minutes.
//   ?timers:  Lemma is set to come out only while a timer runs.
//   ?quiet:   Lemma is set not to talk about the day.
//   ?handoff: what's said to him needs a chat.  ?remind: it's a reminder (due at once).
//   ?rounds:  he focuses in rounds of 25 minutes, and the task's been timed 26.
//   ?notch:   he's set to tuck into the edge of the screen.
//   ?meeting: a meeting online starts in 5 minutes (25 with ?later).  ?heads: Sam's birthday and the rent are today.
//   ?sound:   he's set to chime.  ?checkin: to ask how today was.
//   ?final:   the task's last minute is ticking.
//   ?flow:    the task's been timed 25 min without a pause.  ?weather: it's raining in London.
//   ?inbox:   one thing waits in the inbox.
//   ?settings: Lemma's settings for the desktop, beside the main window's side.
// `window.deskState` is what's going on at the computer (time away, full
// screen, a call), and `window.acts` what he did by hand (dropped, logged).
// Stored settings are put in place by the page before anything loads (desk-preview.html).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { EXTENSIONS } from "../src/extensions";
import type { PlanTask } from "../src/features/daily_plan/api";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { Desk } from "../src/shell/desk/Desk";
import { useDesk } from "../src/shell/desk/useDesk";
import { DeskSettings } from "../src/shell/desk/DeskSettings";
import { useHandoff } from "../src/shell/desk/handoff";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

const params = new URLSearchParams(location.search);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const nowMinute = () => new Date().getHours() * 60 + new Date().getMinutes();

const task: PlanTask = {
  id: "t1", title: "Write the quarterly report", notes: "", day: null, position: 0,
  estimateMinutes: params.has("over") ? 10 : params.has("final") ? 13 : 45, focusRank: null, doneAt: null, boardTaskId: null,
  createdAt: minutesAgo(60), updatedAt: minutesAgo(1), actualMinutes: 0, timerStartedAt: minutesAgo(params.has("rounds") ? 26 : params.has("flow") ? 25 : 12), dueDate: null,
};
const quiet = ["study", "reading", "idle", "soon"].some((p) => params.has(p));
let running: PlanTask | null = quiet ? null : task;
let done = 1;
// Late in the evening the next block would be tomorrow: keep it ahead of now, but not soon.
const next = params.has("soon")
  ? { startMinute: nowMinute() + 10, durationMinutes: 30, title: "Team meeting", inProgress: false }
  : nowMinute() + 120 < 24 * 60
    ? { startMinute: nowMinute() + 120, durationMinutes: 30, title: "Team meeting", inProgress: false }
    // Too late for it today: nothing next, rather than something about to start.
    : null;

const calls: string[] = [];
const opened: string[] = [];
const sizes: string[] = [];
const said: string[] = [];
const undone: string[][] = [];
const acts: { tool: string; args: Record<string, unknown> }[] = [];
const links: string[] = [];
/** Where the cursor is on the screen, for his eyes; the test moves it. */
const cursor = { x: 1000, y: 600 };
const deskState = { idleSeconds: 0, fullScreen: false, call: false, active: null };
/** The plan his reactions watch: today's open tasks, tomorrow's, and how many are in the inbox. */
const plan = { today: [task] as PlanTask[], tomorrow: [] as PlanTask[], inbox: params.has("inbox") ? 1 : 0 };
// The hooks only talk to Rust inside Tauri: this page stands in for it.
Object.assign(window, { deskCalls: calls, opened, deskSizes: sizes, said, undone, acts, links, cursor, deskState, plan, task, isTauri: true, emitTauri: emit, finishAnother: () => { done += 1; changed(); } });

const day = () => new Date().toISOString().slice(0, 10);
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const meeting = {
  id: "e1", calendarId: "c1", day: day(), startMinute: Math.min(nowMinute() + (params.has("later") ? 25 : 5), 23 * 60 + 59), durationMinutes: 15, allDay: false, busy: true,
  title: "Standup", color: "#4f8cff", startAt: null, endAt: null, location: "Google Meet", description: "Join: https://meet.google.com/abc-defg-hij &amp; dial in",
  link: "https://calendar.google.com/event?eid=1", recurring: true, editable: false,
};

// The test's mouse moves the cursor too (the window is at the screen's top left).
document.addEventListener("mousemove", (e) => Object.assign(cursor, { x: e.clientX, y: e.clientY }));

const changed = () => setTimeout(() => void emit("timer-changed"), 0);

mockWindows("main");
mockIPC(
  (command, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (command) {
      case "plan_summary":
        return { total: 3, done, focus: [], plannedMinutes: 0, availableMinutes: 0, running, nextBlock: next };
      case "plan_stop_timer":
        running = null;
        changed();
        return { ...task, id: a.id, timerStartedAt: null, actualMinutes: 12, updatedAt: new Date().toISOString() };
      case "plan_start_timer":
        running = { ...task, timerStartedAt: new Date().toISOString(), actualMinutes: 12 };
        changed();
        return running;
      case "plan_set_done":
        running = null;
        done += 1;
        changed();
        return { ...task, doneAt: new Date().toISOString() };
      case "app_lock_status":
        return { enabled: false, locked: false, idleMinutes: 0, needsCode: false };
      case "account_status":
        return { state: "signed_out" };
      // Talking: what was heard, and what Lemma made of it. Nothing else is
      // asked (no chat is made), which `said` lets the test check.
      case "ai_transcribe":
        return { text: params.has("handoff") ? "plan my whole week" : "start a timer for my essay", provider: "Groq" };
      case "assistant_quick":
        said.push(String(a.text));
        if (params.has("handoff")) return { said: "Let's plan that in our chat.", did: null, openChat: true, undo: [], reminder: null };
        if (params.has("remind")) return { said: "I'll remind you.", did: null, openChat: false, undo: [], reminder: { text: "Stretch", at: Date.now() - 1000 } };
        running = { ...task, title: "Essay", estimateMinutes: null, timerStartedAt: new Date().toISOString() };
        changed();
        return { said: "On it: timing your **essay** now.", did: "Start a timer on \"Essay\"", openChat: false, undo: ["quick-1"], reminder: null };
      case "assistant_quick_undo":
        undone.push(a.undo as string[]);
        running = null;
        changed();
        return null;
      // Done by hand on the desktop: what, and with what.
      case "assistant_act":
        acts.push({ tool: String(a.tool), args: a.args as Record<string, unknown> });
        return { said: null, did: String(a.tool), openChat: false, undo: [`act-${acts.length}`], reminder: null };
      case "plan_take_off":
        calls.push(`${command}:${a.id}:${a.minutes}`);
        return { ...task, actualMinutes: 2 };
      // Today (with its inbox) and tomorrow, as the test sets them: for what's next,
      // and his reactions to tasks moving and the inbox emptying.
      case "plan_get_day":
        return a.day === localDay()
          ? { events: params.has("meeting") ? [meeting] : [], tasks: plan.today, inbox: Array.from({ length: plan.inbox }, (_, i) => ({ ...task, id: `i${i}` })) }
          : { events: [], tasks: plan.tomorrow, inbox: [] };
      case "desk_weather":
        return params.has("weather") || a.auto ? { kind: "rain", temperature: 11.6, place: "London", day: true, source: a.auto ? "timezone" : "place" } : null;
      case "reading_get":
        return { card: { id: "b1", title: "Dune", unit: "pages", progress: 120 }, sessions: [], notes: [], reads: [] };
      case "learning_summary":
        return { skills: [{ id: "s1", name: "Rust", archived: false, tally: { done: 0, total: 0, percent: null, reviews: 0, weekMinutes: 0, totalMinutes: 0 }, sources: [] }], reviews: [], days: [], streak: 0, todayMinutes: 0, weekMinutes: 0, weekUnits: 0, recent: [] };
      case "birthdays_list":
        return params.has("heads") ? [{ id: "p1", name: "Sam", occasion: "birthday", days: 0, turning: 30 }, { id: "p2", name: "Ana", occasion: "birthday", days: 9, turning: null }] : [];
      case "finance_month":
        return { due: params.has("heads") ? [{ recurringId: "r1", name: "Rent", day: localDay(), amount: -80000, currency: "GBP", accountId: "a1", categoryId: null }, { recurringId: "r2", name: "Salary", day: localDay(), amount: 300000, currency: "GBP", accountId: "a1", categoryId: null }] : [] };
      case "plugin:opener|open_url":
        links.push(String(a.url));
        return null;
      case "desk_state":
        return { ...deskState };
      case "desk_settle":
        return null;
      case "desk_chime":
        calls.push(`${command}:${a.kind}`);
        return null;
      case "desk_background":
        calls.push(`${command}:${a.on}`);
        return null;
      case "desk_quit":
        calls.push(command);
        return null;
      case "desk_timer_keys":
        calls.push(`${command}:${a.on}`);
        return null;
      // Where he is, and where the cursor is, for his eyes.
      case "plugin:window|cursor_position":
        return { ...cursor };
      case "plugin:window|outer_position":
        return { x: 0, y: 0 };
      // The window is fitted to him, so it's as big as he is.
      case "plugin:window|inner_size": {
        const box = document.querySelector(".desk")?.getBoundingClientRect();
        return { width: Math.round(box?.width ?? 340), height: Math.round(box?.height ?? 400) };
      }
      case "desk_notify":
        calls.push(`${command}:${a.title}`);
        return null;
      case "desk_resize":
        sizes.push(`${a.width}x${a.height}${a.dock ? " dock" : ""}`);
        return a.dock ? "right" : null;
      case "desk_show":
      case "desk_hide":
      case "desk_open_main":
        calls.push(command);
        return null;
      // Where it goes, and the hotkey: noted with what they were asked.
      case "desk_place":
        calls.push(`${command}:${a.corner}`);
        return null;
      case "desk_hotkey":
        calls.push(`${command}:${a.on}`);
        return null;
      default:
        // Other areas' summaries, the system menu, dragging: as if they're not there.
        throw new Error(`not in this test: ${command}`);
    }
  },
  { shouldMockEvents: true },
);

function Main() {
  useDesk((view) => opened.push(view.kind === "extension" ? view.id : view.kind));
  // What the Lemma tab would be asked in a new chat.
  const handoff = useHandoff();
  return handoff ? <output className="handoff">{handoff}</output> : null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider installed={EXTENSIONS} transparent={!params.has("settings")}>
      <Main />
      {params.has("settings") ? (
        <div style={{ width: 520, padding: 20 }}>
          <DeskSettings />
        </div>
      ) : (
        <Desk />
      )}
    </ThemeProvider>
  </StrictMode>,
);
