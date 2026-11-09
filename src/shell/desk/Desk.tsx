// Lemma on the desktop: just Lemma, floating over everything else (or
// tucked into the side of the screen). While a task, study or reading timer
// runs he becomes the timer: the time counts in his face socket, with a thin
// ring around him (and, set to, he breaks the focus into rounds with breaks,
// and sums them up after). He talks in a speech bubble: what's coming up
// (with Join for a meeting online), birthdays and bills, a morning hello and
// an evening wrap-up, a nudge about goals, a cheer when things get done,
// the reminders he was asked for, a nudge to take a break, and how was today.
// Talk to him out loud (double-click him, or press Ctrl+Alt+Space) or type
// to him (middle-click) and he does small things straight away, each with
// an Undo; anything bigger goes on to a chat in Axiom. Drop text, a link or
// a file on him to keep it. When a study or reading timer stops he asks how
// it went and logs it; back from time away, he asks whether to count it.
// Nothing said here is kept. Drag him anywhere, scroll over him to resize
// him, right-click him for more. His eyes follow the mouse; he looks
// straight at you while you're dealing with him, faces the middle of the
// screen otherwise, and left alone, he plays about a little.
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CalendarClock, Check, Coffee, Keyboard, ListPlus, Pause, Play, Square, StickyNote, Timer, type LucideIcon } from "lucide-react";
import { AWAKE_CHOICES, awakeClock, awakeLength, keepAwake, letSleep, MAX_AWAKE_MINUTES, parseKeepAwake, useKeepAwake } from "../../lib/keepAwake";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, trackedMinutes, type PlanTask } from "../../features/daily_plan/api";
import { addDays, clock, mondayOf, nowMinute, today } from "../../features/daily_plan/time";
import { api as learning } from "../../features/learning/api";
import { Face, type Mood } from "../../features/lemma/Face";
import { useLook } from "../../features/lemma/look";
import { useName } from "../../features/lemma/parts";
import { nameOf, usePersona } from "../../features/lemma/persona";
import { feel, setLemma, useLemma } from "../../features/lemma/state";
import { useBriefing } from "../../features/lemma/useBriefing";
import { api as reading } from "../../features/reading/api";
import { act, quick, quickUndo, transcribe, type QuickReply } from "../../lib/ai";
import { readSetting } from "../../lib/settings";
import { useDataChanged, useTauriEvent } from "../../lib/sync";
import { record, type Recording } from "../../lib/voice";
import { useAssistantAreas } from "../useAssistantAreas";
import { headsUp, meetingLink, useTodaysEvents } from "./dayNotes";
import { roundsOf, setDeskPrefs, SIZE, useDeskPrefs } from "./deskSetting";
import { bookLink, readDrop, sourceKind, taskOf, type Dropped } from "./drops";
import { hasTalked, HINT_TAPS, markTalked, TAP_WINDOW_MS, tapHint } from "../../features/lemma/talk";
import { line, ordinal } from "./lines";
import { cancel, remind, ringDue, ringing as ringingNow, settle, useReminders, useRinging, welcomeBack } from "./reminders";
import { askMain, BYE_EVENT, chime, deskState, hideDesk, LEAVE_EVENT, notify, openMain, resizeDesk, SAY_EVENT, setPaused, settleDesk, STAY_EVENT, SUMMON_EVENT, quitAxiom, takeOff, useTimers, weatherIn, type Timers, type Weather } from "./timers";
import "./desk.css";

/** Opened by Ctrl+Alt+Space before the window existed: listen straight away. */
const summoned = new URLSearchParams(location.search).has("listen");

/** How long a bubble stays, unless it says otherwise. */
const BUBBLE_MS = 7000;
/** How long Undo stays offered after he's done something. */
const UNDO_MS = 10_000;
/** How long a question waits for an answer. */
const ASK_MS = 3 * 60_000;
/** How long a reminder waits to be dealt with. */
const RINGING_MS = 5 * 60_000;
/** How often, at most, Lemma says something about the day by himself. */
const NUDGE_MS = 6 * 60_000;
/** Between his little antics, when he's left alone. */
const ANTIC_MS: [number, number] = [18_000, 45_000];
const ANTICS = ["hop", "wiggle", "spin", "peek", "look", "smile", "yawn"] as const;
type Antic = (typeof ANTICS)[number];
/** Antics that move him about; the rest only change his face. */
const MOVES: Antic[] = ["hop", "wiggle", "spin", "peek"];
/** Moves he makes in reaction to things (and his rituals), and how long each lasts. */
type Move = "duck" | "dizzy" | "wince" | "clap" | "stretch" | "wave" | "land" | "wobble";
/** Little stories he plays out when left alone, now and then, instead of a single antic. */
type Story = "firefly" | "juggle" | "hum" | "read";
const STORY_MS: Record<Story, number> = { firefly: 6000, juggle: 4500, hum: 4200, read: 7000 };
/** Timed this long without a pause, he goes quiet and the halo shimmers: you're in flow. */
const FLOW_MS = 20 * 60_000;
/** Each this long of focus today adds a ring to his halo. */
const FOCUS_BLOCK_MS = 25 * 60_000;
const FOCUS_KEY = "axiom.desk.focus";
/** No keyboard or mouse this long with a timer running: still on it? */
const DRIFT_S = 10 * 60;
/** The last minutes of an estimate, when he says what's next. */
const UP_NEXT_MS = 2 * 60_000;
/** Held this long without moving: the quick menu around him. */
const HOLD_MS = 550;
/** How many times a task can move to tomorrow before he mentions it. */
const PUSHES = 3;
const PUSHED_KEY = "axiom.desk.pushed";
/** Timer sessions per task this week, so he can say "your third essay session". */
const SESSIONS_KEY = "axiom.desk.sessions";
/** The colours in his face socket: running over, on a break, paused. */
const OVER = "#ff6b6b";
const BREAK = "#6ee7a8";
const DIM = "#9aa9b5";
/** How big he is, tucked into the notch. */
const TUCKED = 44;
/** Between one bubble going and the next one waiting. */
const NEXT_BUBBLE_MS = 450;
/** How many of the things he's said he can recall ("What did you say?"). */
const RECALLED = 10;
/** Left alone this long, he fades to a ghost of himself until pointed at. */
const GHOST_MS = 3 * 60_000;
/** Fading in and out, as a hologram. */
const ARRIVE_MS = 650;
const FOLD_MS = 260;
/** Bubbles said so far, to tell them apart. */
let bubbles = 0;
/** How often what's going on at the computer is checked (time away, a long stretch). */
const STATE_MS = 5000;
/** This long without the keyboard or mouse is time away. */
const AWAY_S = 5 * 60;
/** At the computer this long without a break: a nudge to take one. */
const STRETCH_MS = 50 * 60_000;
const BREAK_NUDGES = ["Time to stand up and stretch for a minute.", "Look at something far away for 20 seconds: your eyes will thank you.", "A good moment for some water."];
/** The evening check-in's answers, saved with the journal's mood (1 to 5). */
const MOODS = [
  { face: "😞", word: "awful" },
  { face: "😕", word: "not great" },
  { face: "😐", word: "okay" },
  { face: "🙂", word: "good" },
  { face: "😄", word: "great" },
];

interface Action {
  label: string;
  run: () => void;
  /** Read out instead of the label (an emoji's meaning). */
  title?: string;
}

/** A question in the bubble, answered in a box. */
interface Question {
  kind: "number" | "text";
  placeholder: string;
  submit: (value: string) => void;
  skip: Action;
}

interface Bubble {
  id: number;
  text: string;
  /** Buttons in the bubble. */
  actions?: Action[];
  form?: Question;
  /** How long it stays (paused while he's pointed at), and until when. */
  ms: number;
  until: number;
  /** Done if it goes unanswered (timed out, or something else is said). */
  onGone?: () => void;
}

/** What's being timed, in one shape. */
interface Timed {
  kind: "task" | "study" | "reading";
  title: string;
  minutes: number;
  /** For a task with an estimate. */
  estimate: number | null;
  paused: boolean;
  task: PlanTask | null;
}

function timedOf(t: Timers, now: number): Timed | null {
  const task = t.running ?? t.paused;
  if (task) return { kind: "task", title: task.title, minutes: trackedMinutes(task, now), estimate: task.estimateMinutes, paused: !t.running, task };
  if (t.study) return { kind: "study", title: t.study.title, minutes: (now - t.study.startedAt) / 60_000, estimate: null, paused: false, task: null };
  if (t.reading) return { kind: "reading", title: t.reading.title, minutes: (now - t.reading.startedAt) / 60_000, estimate: null, paused: false, task: null };
  return null;
}

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function keep(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage, it lasts while he's out.
  }
}

/** A break between rounds of focus on `task`, until when. Kept, so a restart doesn't lose it. */
interface Rest {
  until: number;
  /** How long it lasts, in minutes. */
  minutes: number;
  task: PlanTask;
}
const REST_KEY = "axiom.desk.break";

/** Rounds of focus done on a task, for the summing up after. */
interface RoundsDone {
  taskId: string;
  count: number;
}
const ROUNDS_KEY = "axiom.desk.rounds";
const roundsDone = (taskId: string) => {
  const r = load<RoundsDone>(ROUNDS_KEY);
  return r?.taskId === taskId ? r.count : 0;
};

/** "1h 40m", or "25 min". */
function duration(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
}

/** The timer's readout: "12:34", or "1:19:05" over an hour. */
function faceTime(minutes: number): string {
  const s = Math.max(0, Math.floor(minutes * 60));
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** "It's 12° and raining in London." for the morning hello. */
function weatherSaid(w: Weather): string {
  const how = { clear: w.day ? "sunny" : "clear", clouds: "cloudy", fog: "foggy", rain: "raining", snow: "snowing", storm: "stormy" }[w.kind];
  const tip = w.kind === "rain" || w.kind === "storm" ? " Maybe take an umbrella." : w.kind === "snow" ? " Wrap up warm." : "";
  return `It's ${Math.round(w.temperature)}° and ${how} in ${w.place}.${tip}`;
}

/** "3:42 pm", as the computer says times. */
const at = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The timer's details, for pointing at him: how long's left and when it ends, or how long so far. */
function detailsOf(timed: Timed | null, rest: Rest | null, now: number): string | null {
  if (rest) return `Back at ${at(rest.until)}`;
  if (!timed) return null;
  if (timed.paused) return `${duration(timed.minutes)} so far`;
  if (!timed.estimate) return `${duration(timed.minutes)} so far`;
  const left = timed.estimate - timed.minutes;
  return left > 0 ? `${duration(Math.ceil(left))} left · ends ${at(now + left * 60_000)}` : `${duration(timed.minutes)} so far · time's up`;
}

/** The timer's readout under him: time left of the estimate (stopping at 0:00), or time so far. */
function faceOf(timed: Timed | null, rest: Rest | null, now: number): { text: string; color?: string } | null {
  if (rest) return { text: faceTime(Math.max(0, rest.until - now) / 60_000), color: BREAK };
  if (!timed) return null;
  if (timed.estimate) {
    const left = timed.estimate - timed.minutes;
    return left > 0 ? { text: faceTime(left), color: timed.paused ? DIM : undefined } : { text: "0:00", color: OVER };
  }
  return { text: faceTime(timed.minutes), color: timed.paused ? DIM : undefined };
}

/** Minutes added to a task's estimate from his bubble ("5 more min"), on this computer. */
interface Extra {
  taskId: string;
  minutes: number;
}
const EXTRA_KEY = "axiom.desk.extra";

/** "**3 tasks** left" with its bold parts. */
function Words({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}

/** Things Lemma said by himself today, so each is said once (on this computer). */
const SAID_KEY = "axiom.desk.said";
function saidToday(what: string): boolean {
  return load<Record<string, string>>(SAID_KEY)?.[what] === today();
}
function markSaid(what: string) {
  keep(SAID_KEY, { ...load<Record<string, string>>(SAID_KEY), [what]: today() });
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const clamp = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 20) / 20;
const STRAIGHT = { x: 0, y: 0 };
const errorText = (e: unknown) => String(e).replace(/^Error: /, "").split(". ")[0].replace(/\.?$/, ".");

/** Which way the middle of his screen is from him: -1 (left, up) to 1 (right, down). */
function towardsMiddle(): { x: number; y: number } {
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const width = screen.availWidth || 1;
  const height = screen.availHeight || 1;
  const across = window.screenX + window.innerWidth / 2 - ((screen.availLeft ?? 0) + width / 2);
  const down = window.screenY + window.innerHeight / 2 - ((screen.availTop ?? 0) + height / 2);
  return { x: clamp(-across / (width / 2)), y: clamp(-down / (height / 2)) };
}

/**
 * Where he looks. Dealing with him (`attentive`): straight at you. Otherwise
 * his eyes follow the cursor wherever it is on the screen, while it moves;
 * when it rests, he faces the middle of the screen.
 */
function useLooking(attentive: boolean, react: (what: "duck" | "dizzy") => void) {
  const [facing, setFacing] = useState(towardsMiddle);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const reacting = useRef(react);
  reacting.current = react;
  useEffect(() => {
    const window_ = getCurrentWindow();
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    let last = { x: NaN, y: NaN };
    let movedAt = 0;
    let gone = false;
    // The cursor racing at him (he ducks), or going round and round him (he gets dizzy).
    let before: { distance: number; angle: number; at: number } | null = null;
    let turned = 0;
    let turningSince = 0;
    let reactedAt = 0;
    let swooping = 0;
    const notice = (cursor: { x: number; y: number }, scale: number) => {
      if (!rect) return;
      const dx = cursor.x - (rect.x + rect.w / 2);
      const dy = cursor.y - (rect.y + rect.h / 2);
      const now = Date.now();
      const here = { distance: Math.hypot(dx, dy) / scale, angle: Math.atan2(dy, dx), at: now };
      const was = before;
      before = here;
      if (!was || now - reactedAt < 4000) return;
      const seconds = (now - was.at) / 1000;
      // Coming at him fast and close, then racing on past: he ducks. (One
      // that stops on him is just you reaching for him.)
      if (here.distance < 170 && (was.distance - here.distance) / seconds > 2400) {
        swooping = now;
        return;
      }
      if (swooping && now - swooping < 450) {
        swooping = 0;
        if ((here.distance - was.distance) / seconds > 1500) {
          reactedAt = now;
          return reacting.current("duck");
        }
      }
      // Going round him: two whole turns within five seconds, not too far off.
      if (here.distance > 400) return void (turned = 0);
      let step = here.angle - was.angle;
      if (step > Math.PI) step -= 2 * Math.PI;
      if (step < -Math.PI) step += 2 * Math.PI;
      if (!turned || now - turningSince > 5000 || Math.sign(step) !== Math.sign(turned)) {
        turned = 0;
        turningSince = now;
      }
      turned += step;
      if (Math.abs(turned) > 4 * Math.PI) {
        turned = 0;
        reactedAt = now + 10_000;
        reacting.current("dizzy");
      }
    };
    const same = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) => a?.x === b?.x && a?.y === b?.y;
    const measure = async () => {
      setFacing((was) => (same(was, towardsMiddle()) ? was : towardsMiddle()));
      const [at, size] = await Promise.all([window_.outerPosition(), window_.innerSize()]);
      rect = { x: at.x, y: at.y, w: size.width, h: size.height };
    };
    const follow = async () => {
      try {
        const cursor = await cursorPosition();
        if (gone) return;
        if (!rect) await measure();
        const scale = window.devicePixelRatio || 1;
        if (cursor.x !== last.x || cursor.y !== last.y) {
          last = { x: cursor.x, y: cursor.y };
          movedAt = Date.now();
          notice(cursor, scale);
        } else if (before) {
          // Still: how fast it next moves is from now, not from when it stopped.
          before.at = Date.now();
        }
        // The cursor's been still a while: back to facing the middle.
        if (!rect || Date.now() - movedAt > 3000) return setGaze((was) => (was === null ? was : null));
        const next = { x: clamp((cursor.x - (rect.x + rect.w / 2)) / (500 * scale)), y: clamp((cursor.y - (rect.y + rect.h / 2)) / (380 * scale)) };
        setGaze((was) => (same(was, next) ? was : next));
      } catch {
        // No cursor to follow (not in Tauri): his eyes follow the mouse over him instead.
      }
    };
    const following = setInterval(() => void follow(), 100);
    const measuring = setInterval(() => void measure().catch(() => {}), 1000);
    let stop: (() => void) | null = null;
    window_
      .onMoved(() => void measure().catch(() => {}))
      .then((off) => (gone ? off() : (stop = off)), () => {});
    return () => {
      gone = true;
      clearInterval(following);
      clearInterval(measuring);
      stop?.();
    };
  }, []);
  return attentive ? { facing: STRAIGHT, gaze: STRAIGHT } : { facing, gaze };
}

/** Something on, as the notch shows it. */
interface NotchView {
  key: string;
  /** Its colour: the timer, a break, time's up, a meeting, one about to start, a reminder. */
  tone: "timer" | "break" | "over" | "meeting" | "soon" | "reminder";
  icon?: LucideIcon;
  /** In the notch: the time, or how long until. */
  big: string;
  color?: string;
  /** When pointed at: what it is, and when. */
  line: string;
  /** How far through (0 to 1), for the bar along the notch's foot. */
  progress: number | null;
  actions: { label: string; run: () => void }[];
}

const HOUR = 60 * 60_000;

interface MenuEntry {
  label: string;
  run: () => void;
  disabled?: boolean;
}

export function Desk() {
  const prefs = useDeskPrefs();
  const look = useLook();
  const timers = useTimers();
  const persona = usePersona();
  const lemma = useLemma();
  const me = nameOf(persona);
  const name = useName();
  const { areas } = useAssistantAreas();
  const ringing = useRinging();
  const reminderList = useReminders();
  const events = useTodaysEvents(areas.includes("daily_plan"));
  const [now, setNow] = useState(Date.now());
  /** Keeping the screen awake until (ms), if asked to. */
  const awakeUntil = useKeepAwake();
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [voice, setVoice] = useState<"idle" | "listening" | "thinking">("idle");
  const [level, setLevel] = useState(0);
  const [glad, setGlad] = useState(0);
  const [antic, setAntic] = useState<Antic | null>(null);
  const [menu, setMenu] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [opened, setOpened] = useState(false);
  const [holding, setHolding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rest, setRest] = useState<Rest | null>(() => load(REST_KEY));
  const [extra, setExtra] = useState<Extra | null>(() => load(EXTRA_KEY));
  /** The time's-up that's been dealt with (by a button, or its bubble going). */
  const [settledUp, setSettledUp] = useState<string | null>(null);
  const [outUntil, setOutUntil] = useState(0);
  const [side, setSide] = useState<"left" | "right">("right");
  const recording = useRef<Recording | null>(null);
  const box = useRef<HTMLElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const shownBubble = useRef<Bubble | null>(null);
  /** What's waiting to be said, once what's in the bubble goes. */
  const queue = useRef<Bubble[]>([]);
  /** What he's said lately (in memory only), for "What did you say?". */
  const [said, setSaid] = useState<{ text: string; at: number }[]>([]);
  const [recall, setRecall] = useState(false);
  /** Sparks from his halo when something's done: more when it's everything. */
  const [burst, setBurst] = useState<{ id: number; big: boolean } | null>(null);
  /** Fading in (opened, or asked back) or out (about to be put away). */
  const [arriving, setArriving] = useState(true);
  const [leaving, setLeaving] = useState(false);
  /** Folding back into the notch. */
  const [folding, setFolding] = useState(false);
  const lastTouched = useRef(Date.now());
  const lastTick = useRef(Date.now());
  const dragged = useRef(false);
  const [pet, setPet] = useState(0);
  /** A move he's making (a duck, a wince, a wave…), until when. */
  const [move, setMove] = useState<{ kind: Move; until: number } | null>(null);
  /** Leaning into a drag, in degrees. */
  const [lean, setLean] = useState(0);
  /** A little story he's playing out, and the firefly's place in it (-1 to 1 each way). */
  const [story, setStory] = useState<Story | null>(null);
  const [fly, setFly] = useState({ x: 0, y: 0 });
  /** Looking at a window that's just come to the front, for a moment. */
  const [glance, setGlance] = useState<{ x: number; y: number } | null>(null);
  /** The quick menu around him (held down). */
  const [radial, setRadial] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [weather, setWeather] = useState<Weather | null>(null);
  /** What he's done lately, each with its Undo (in memory only). */
  const [did, setDid] = useState<{ id: number; text: string; undo: string[]; at: number; undone: boolean }[]>([]);
  const flight = useRef<{ x: number; y: number; at: number; fastest: number } | null>(null);
  const justFinished = useRef(0);
  /** Taps on him, to tell when someone's trying to work out how to talk to him. */
  const taps = useRef({ count: 0, last: 0 });
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const found = timedOf(timers, now);
  // "5 more min" from his bubble adds to the task's estimate.
  const timed = found?.task && found.estimate && extra?.taskId === found.task.id ? { ...found, estimate: found.estimate + extra.minutes } : found;
  // The estimate's run out: he says so, and shakes, until it's dealt with.
  const up = !!timed && !timed.paused && !!timed.estimate && timed.minutes >= timed.estimate;
  const upKey = up && timed ? `${timed.task?.id ?? timed.kind}:${timed.estimate}` : null;
  const calling = upKey !== null && settledUp !== upKey;
  const focused = !!timed && !timed.paused && !rest && !calling;
  // Timed a good while without a pause: in flow. He goes quiet (what he has to
  // say waits, bar what can't) and the halo shimmers.
  const runningFor = timed?.kind === "task" ? (timers.running?.timerStartedAt ? now - Date.parse(timers.running.timerStartedAt) : 0) : (timed?.minutes ?? 0) * 60_000;
  const flowing = focused && runningFor >= FLOW_MS;
  const briefing = useBriefing(prefs.nudges);
  // While he's being dealt with, he looks straight at you; timing or not, he otherwise follows the cursor.
  const { facing, gaze: following } = useLooking(hovered || holding || menu || typing || dragging || voice !== "idle", (what) => reactTo(what));
  const p = persona.personality;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  /** Puts a bubble up (or takes it down). What it replaces, unanswered, is done with. */
  const show = useCallback((next: Bubble | null) => {
    const was = shownBubble.current;
    shownBubble.current = next;
    if (was?.onGone) was.onGone();
    if (next) setSaid((all) => [{ text: next.text, at: Date.now() }, ...all.filter((s) => s.text !== next.text)].slice(0, RECALLED));
    setBubble(next);
  }, []);
  /**
   * Says something in the bubble (null clears it). Said by himself
   * (`queue`), it waits its turn behind what's there; otherwise (an answer
   * to something you did) it's said at once.
   */
  const say = useCallback(
    (text: string | null, more: { actions?: Action[]; form?: Question; ms?: number; onGone?: () => void; queue?: boolean } = {}) => {
      if (!text) return show(null);
      const ms = more.ms ?? (more.form ? ASK_MS : BUBBLE_MS);
      const next: Bubble = { id: ++bubbles, text, actions: more.actions, form: more.form, onGone: more.onGone, ms, until: Date.now() + ms };
      const current = shownBubble.current;
      if (more.queue && current) {
        if (current.text !== text && !queue.current.some((b) => b.text === text)) queue.current.push(next);
        return;
      }
      show(next);
    },
    [show],
  );
  /** Answered: what was asked is dealt with, and the bubble goes. */
  const answered = () => {
    if (shownBubble.current) shownBubble.current.onGone = undefined;
    say(null);
  };
  // While you're pointing at him (or typing), what he's saying waits for you.
  useEffect(() => {
    const passed = now - lastTick.current;
    lastTick.current = now;
    if (bubble && (hovered || typing)) bubble.until += passed;
    else if (bubble && now > bubble.until) say(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  // The bubble's gone: the next one waiting, after a breath.
  useEffect(() => {
    if (bubble || !queue.current.length || flowing) return;
    const next = setTimeout(() => {
      const waiting = queue.current.shift();
      if (waiting && !shownBubble.current) show({ ...waiting, until: Date.now() + waiting.ms });
    }, NEXT_BUBBLE_MS);
    return () => clearTimeout(next);
  }, [bubble, now, show, flowing]);
  useTauriEvent<string>(SAY_EVENT, (text) => say(text));
  const sparkle = (big: boolean) => {
    if (!reducedMotion()) setBurst({ id: Date.now(), big });
  };
  const cheer = (text: string, requested = false, big = false) => {
    if (focused && !requested) return;
    setGlad(Date.now() + 3000);
    sparkle(big);
    say(text, { queue: !requested });
  };

  /** Makes a move for `ms` (not with reduced motion, except what's only his face). */
  const moveFor = (kind: Move, ms: number) => {
    if (reducedMotion()) return;
    setMove({ kind, until: Date.now() + ms });
  };
  useEffect(() => {
    if (!move) return;
    const over = setTimeout(() => setMove(null), Math.max(0, move.until - Date.now()));
    return () => clearTimeout(over);
  }, [move]);
  // The cursor came at him, or went round and round him.
  const reactTo = (what: "duck" | "dizzy") => {
    // Tucked in the notch, he's out of the way: nothing to flinch at.
    if (notch && !out) return;
    if (what === "duck") {
      moveFor("duck", 700);
      say(line(p, "duck"), { ms: 1800, queue: true });
    } else {
      moveFor("dizzy", 2600);
      say(line(p, "dizzy"), { ms: 3200, queue: true });
    }
  };

  // ---------- Hands on ----------

  const run = (work: () => Promise<unknown>) => void work().catch((e) => say(errorText(e)));
  /** Says what was done, with an Undo for a while. */
  const offerUndo = (text: string, reply: QuickReply) => {
    setGlad(Date.now() + 2500);
    // Kept (in memory) for "What did you say?", with its Undo while it still works.
    const id = Date.now();
    if (reply.undo.length) setDid((all) => [{ id, text, undo: reply.undo, at: id, undone: false }, ...all].slice(0, RECALLED));
    say(text, {
      ms: UNDO_MS,
      actions: reply.undo.length ? [{ label: "Undo", run: () => undoIt(id, reply.undo) }] : undefined,
    });
  };
  const undoIt = (id: number, undo: string[]) =>
    run(async () => {
      await quickUndo(undo);
      setDid((all) => all.map((d) => (d.id === id ? { ...d, undone: true } : d)));
      say("Undone.");
    });
  /** One of the things he does by hand (`quick::ACTS`), said with an Undo. */
  const doIt = (tool: string, args: Record<string, unknown>, said: string) => run(async () => offerUndo(said, await act(tool, args)));

  const startRest = (next: Rest | null) => {
    keep(REST_KEY, next);
    setRest(next);
  };
  const pause = (task: PlanTask) => run(async () => setPaused(await api.stopTimer(task.id)));
  const resume = (task: PlanTask) =>
    run(async () => {
      startRest(null);
      await api.startTimer(task.id);
      setPaused(null);
    });
  /** Rounds of focus on a task, summed up: "4 rounds, 1h 40m on the report". */
  const roundsSaid = (task: PlanTask) => {
    const count = roundsDone(task.id);
    return count ? `${count} round${count === 1 ? "" : "s"}, ${duration(trackedMinutes(task))} on **${task.title}**.` : null;
  };
  const finish = (task: PlanTask) =>
    run(async () => {
      const summed = roundsSaid(task);
      startRest(null);
      justFinished.current = Date.now();
      await api.setDone(task.id, true);
      setPaused(null);
      keep(ROUNDS_KEY, null);
      if (summed) cheer(`Done! ${summed}`, true);
      else if (prefs.cheers) cheer(line(p, "done"), true);
    });

  // Study or reading stopped from here: he asks how it went, and logs it.
  // Left unanswered, the time is logged anyway.
  const stopTimed = () => {
    if (!timed) return;
    const minutes = Math.max(1, Math.round(timed.minutes));
    if (timed.kind === "reading" && timers.reading) {
      const { bookId, title } = timers.reading;
      askMain({ kind: "reading-stop", quiet: true });
      run(async () => {
        const book = (await reading.get(bookId, today())).card;
        const unit = book.unit === "percent" ? "percent" : book.unit === "minutes" ? "minute" : "page";
        const log = (at: number) => doIt("reading_log", { id: bookId, at, minutes }, `Logged ${duration(minutes)} of **${title}**.`);
        say(`${duration(minutes)} of **${title}**. Which ${unit} did you get to?`, {
          form: { kind: "number", placeholder: String(book.progress), submit: (v) => log(Number(v) || book.progress), skip: { label: "Skip", run: () => log(book.progress) } },
          onGone: () => log(book.progress),
        });
      });
    } else if (timed.kind === "study" && timers.study) {
      const { sourceId, title } = timers.study;
      askMain({ kind: "study-stop", quiet: true });
      const log = (note: string) => doIt("learning_log_session", { source_id: sourceId, minutes, note }, `Logged ${duration(minutes)} on **${title}**.`);
      say(`${duration(minutes)} on **${title}**. What did you cover?`, {
        form: { kind: "text", placeholder: "A few words, or Skip", submit: log, skip: { label: "Skip", run: () => log("") } },
        onGone: () => log(""),
      });
    }
  };

  // ---------- Talking ----------

  // ---------- Keeping the screen awake ----------

  /** Stopped by asking (not run out): no "it can sleep again" afterwards. */
  const stoppedAwake = useRef(false);
  const startAwake = async (asked: number) => {
    const minutes = Math.max(1, Math.min(asked, MAX_AWAKE_MINUTES));
    try {
      await keepAwake(minutes);
      stoppedAwake.current = false;
      setGlad(Date.now() + 2500);
      say(asked > MAX_AWAKE_MINUTES
        ? `I can keep it awake for up to ${awakeLength(MAX_AWAKE_MINUTES)} at a time, so ${awakeLength(MAX_AWAKE_MINUTES)} it is.`
        : `I'll keep your screen awake for ${awakeLength(minutes)}.`);
    } catch (e) {
      say(errorText(e));
    }
  };
  const stopAwake = async () => {
    stoppedAwake.current = true;
    await letSleep().catch(() => {});
    say("Your screen can sleep again.");
  };
  /** "How long?", with the usual lengths to pick from. */
  const askAwake = () =>
    say("How long should I keep your screen awake?", {
      ms: 30_000,
      actions: AWAKE_CHOICES.map((choice) => ({ label: choice.label, run: () => void startAwake(choice.minutes) })),
    });
  // Run out by itself: he says so.
  const wasAwake = useRef<number | null>(null);
  useEffect(() => {
    if (wasAwake.current && !awakeUntil && !stoppedAwake.current) say("Time's up: your screen can sleep again.");
    wasAwake.current = awakeUntil;
    // `say` is stable; only the change matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awakeUntil]);

  /** What was said (or typed) to him: small things done, bigger ones handed on. */
  const answer = async (text: string) => {
    // Keeping the screen awake is understood here, straight away, without the AI.
    const awake = parseKeepAwake(text);
    if (awake?.kind === "stop") return void (awakeUntil ? stopAwake() : say("Your screen's free to sleep already."));
    if (awake?.kind === "start") return void (awake.minutes ? startAwake(awake.minutes) : askAwake());
    setVoice("thinking");
    setLemma({ activity: "thinking" });
    try {
      const reply = await quick(text, areas, name, persona);
      if (reply.reminder) remind(reply.reminder.text, reply.reminder.at, reply.reminder.onReturn);
      if (reply.did || reply.reminder) setGlad(Date.now() + 2500);
      if (reply.openChat) {
        say(reply.said ?? "That needs our chat.", { ms: 15_000, actions: [{ label: "Open our chat", run: () => askMain({ kind: "open-chat", text }) }] });
      } else if (reply.undo.length) {
        // Done straight away, so it can be taken back straight away.
        offerUndo(reply.said ?? reply.did ?? "Done.", reply);
      } else {
        say(reply.said ?? reply.did ?? "Done.");
      }
    } finally {
      setVoice("idle");
      setLemma({ activity: "idle", area: null });
    }
  };

  const listen = async () => {
    if (voice === "listening") return recording.current?.stop();
    if (voice !== "idle") return;
    say(null);
    markTalked();
    taps.current.count = 0;
    setMenu(false);
    setTyping(false);
    try {
      const mic = readSetting("axiom.assistant.mic");
      const rec = await record(setLevel, typeof mic === "string" ? mic : undefined);
      recording.current = rec;
      setVoice("listening");
      const audio = await rec.result;
      recording.current = null;
      setLevel(0);
      if (!audio) { feel("puzzled"); return say("I didn't hear anything."); }
      feel("acknowledged");
      setVoice("thinking");
      setLemma({ activity: "thinking" });
      const heard = await transcribe(audio.audio, audio.mime);
      if (!heard.text.trim()) { feel("puzzled"); return say("I didn't catch that. Try again?"); }
      await answer(heard.text);
    } catch (e) {
      feel("concerned");
      say(errorText(e));
    } finally {
      recording.current = null;
      setVoice("idle");
      setLevel(0);
      setLemma({ activity: "idle", area: null });
    }
  };
  const listenRef = useRef(listen);
  listenRef.current = listen;
  useTauriEvent(SUMMON_EVENT, () => void listenRef.current());

  /** Typing to him: a box, with the window taking the keyboard. */
  const startTyping = () => {
    if (voice !== "idle") return;
    say(null);
    setMenu(false);
    setTyping(true);
    void getCurrentWindow().setFocus().catch(() => {});
  };
  const typed = (text: string) => {
    setTyping(false);
    if (text.trim()) void answer(text.trim()).catch((e) => say(errorText(e)));
  };

  useEffect(() => {
    if (summoned) void listenRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        recording.current?.cancel();
        setMenu(false);
        setTyping(false);
        setRecall(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      recording.current?.cancel();
    };
  }, []);

  // ---------- Dropped on him ----------

  const keepLink = (url: string, title: string) => {
    const toLearning = () =>
      run(async () => {
        const skills = (await learning.summary(today())).skills;
        const add = (skillId: string, skill: string) =>
          doIt("learning_add_source", { skill_id: skillId, kind: sourceKind(url), title, link: url }, `Added **${title}** to ${skill} in Learning.`);
        if (!skills.length) return say("Add a skill in Learning first, then drop it on me again.", { actions: [{ label: "Open Learning", run: () => askMain({ kind: "open", area: "learning" }) }] });
        if (skills.length === 1) return add(skills[0].id, skills[0].name);
        say("Which skill is it for?", { ms: 60_000, actions: skills.slice(0, 4).map((s) => ({ label: s.name, run: () => add(s.id, s.name) })) });
      });
    say(`Keep **${title}**?`, {
      ms: 60_000,
      actions: [
        ...(bookLink(url) ? [{ label: "Want to read", run: () => doIt("reading_add", { title, shelf: "want" }, `**${title}** is on your want-to-read shelf.`) }] : []),
        { label: "Learning", run: toLearning },
        { label: "A task", run: () => doIt("plan_add", { items: [{ title, notes: url }] }, `Added **${title}** to today.`) },
      ],
    });
  };
  const dropped = (d: Dropped) => {
    setGlad(Date.now() + 2000);
    if (d.kind === "text") {
      const task = taskOf(d.text);
      return doIt("plan_add", { items: [{ title: task.title, ...(task.notes ? { notes: task.notes } : {}) }] }, `Added **${task.title}** to today.`);
    }
    if (d.kind === "link") return keepLink(d.url, d.title);
    doIt("journal_write", { title: d.name, text: d.text?.trim() || `Dropped in: ${d.name}` }, `Saved **${d.name}** to your journal.`);
  };

  // ---------- Reminders ----------

  // Axiom's window may be closed (Axiom carrying on in the background), where
  // it checks less often: he watches for reminders falling due too.
  useEffect(() => {
    const check = () => {
      if (!ringDue()) return;
      const due = ringingNow();
      if (due) void notify("Reminder", due.text).catch(() => {});
    };
    const every = setInterval(check, 10_000);
    return () => clearInterval(every);
  }, []);
  // One that's due: said until it's dealt with (or a few minutes go by).
  const rang = useRef<string | null>(null);
  useEffect(() => {
    if (!ringing || rang.current === ringing.id) return;
    rang.current = ringing.id;
    setGlad(Date.now() + 2500);
    if (prefs.sound) chime("up");
    say(`Reminder: **${ringing.text}**`, {
      ms: RINGING_MS,
      actions: [
        { label: "Done", run: () => settle() },
        { label: "In 10 min", run: () => settle(10) },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing, say]);
  // Its bubble came and went (timed out, or something else was said): that's that.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (ringing && bubble?.text.startsWith("Reminder:")) shown.current = ringing.id;
    else if (ringing && shown.current === ringing.id) settle();
  }, [bubble, ringing]);

  // ---------- Time's up ----------

  // The estimate's run out: a notification from the system, and from him,
  // with what to do next. He shakes (see `shake` below) until it's dealt with.
  const calledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!upKey || !timed || calledFor.current === upKey) return;
    calledFor.current = upKey;
    const settle = () => setSettledUp(upKey);
    void notify("Time's up", timed.title).catch(() => {});
    if (prefs.sound) chime("up");
    say(line(p, "timesUp", { title: timed.title }), {
      ms: 10 * 60_000,
      actions: [
        ...(timed.task ? [{ label: "Done", run: () => { settle(); finish(timed.task!); } }] : []),
        {
          label: "5 more min",
          run: () => {
            settle();
            const task = timed.task;
            if (!task) return;
            const more = { taskId: task.id, minutes: (extra?.taskId === task.id ? extra.minutes : 0) + 5 };
            keep(EXTRA_KEY, more);
            setExtra(more);
          },
        },
        ...(timed.task ? [{ label: "Stop", run: () => { settle(); pause(timed.task!); } }] : []),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upKey]);
  // Its bubble went (timed out, or something else was said): no more shaking.
  useEffect(() => {
    if (calling && !bubble?.text.startsWith("Time's up")) setSettledUp(upKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble]);
  // A shake every few seconds at first, then now and then.
  const upFor = useRef<{ key: string; since: number } | null>(null);
  if (calling && upFor.current?.key !== upKey) upFor.current = { key: upKey!, since: now };
  const shake = calling && !reducedMotion() && Math.floor(now / 1000) % (now - (upFor.current?.since ?? now) < 60_000 ? 4 : 20) === 0;

  // ---------- Rounds of focus ----------

  const rounds = roundsOf(prefs.rounds);
  useEffect(() => {
    const running = timers.running;
    // Carried on (from here, Axiom or another computer): the break's over.
    if (rest && running) return startRest(null);
    if (rounds && running?.timerStartedAt && !rest && now - Date.parse(running.timerStartedAt) >= rounds.focus * 60_000) {
      startRest({ until: now + rounds.rest * 60_000, minutes: rounds.rest, task: running });
      keep(ROUNDS_KEY, { taskId: running.id, count: roundsDone(running.id) + 1 });
      pause(running);
      setGlad(now + 2500);
      say(line(p, "breakStart", { n: rounds.rest }), { ms: 10_000 });
      return;
    }
    if (rest && now >= rest.until) {
      const task = rest.task;
      startRest(null);
      setGlad(now + 2500);
      if (prefs.sound) chime("soft");
      say(line(p, "breakOver", { title: task.title }), {
        ms: 2 * 60_000,
        actions: [
          { label: "Back to it", run: () => resume(task) },
          {
            label: "Not now",
            run: () => {
              setPaused(null);
              // Done with it for now: how the rounds went.
              const summed = roundsSaid(task);
              keep(ROUNDS_KEY, null);
              if (summed) say(`${summed} Good focus.`);
            },
          },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, timers.running, rounds?.focus]);

  // ---------- Away, and long stretches ----------

  // Away from the computer while something's timed: back, he asks whether
  // that time counts. At it for a long stretch: a nudge to take a break.
  const latest = useRef({ timed, rest, prefs, p });
  const awaySince = useRef<number | null>(null);
  const stretchFrom = useRef(Date.now());
  // Also: quiet a long while with a timer running, he asks if you're still
  // on it; and back, reminders kept for then are said.
  const drifted = useRef(false);
  const stillOnIt = useRef(false);
  latest.current = { timed, rest, prefs, p };
  useEffect(() => {
    let gone = false;
    const check = async () => {
      const state = await deskState().catch(() => null);
      if (!state || gone) return;
      const idleFrom = Date.now() - state.idleSeconds * 1000;
      const { timed, rest, prefs, p } = latest.current;
      if (state.idleSeconds >= AWAY_S) {
        // A break from the computer: the stretch starts again on return.
        stretchFrom.current = Date.now();
        if (awaySince.current === null && timed && !timed.paused && !rest) awaySince.current = idleFrom;
        // Still quiet after a while: maybe reading, maybe gone. He asks, gently.
        if (prefs.away && timed && !timed.paused && !rest && state.idleSeconds >= DRIFT_S && !drifted.current) {
          drifted.current = true;
          const minutes = Math.round(state.idleSeconds / 60);
          const task = timed.task;
          say(line(p, "drift", { title: timed.title, n: minutes }), {
            ms: 10 * 60_000,
            actions: [
              {
                label: "Still on it",
                run: () => {
                  stillOnIt.current = true;
                  awaySince.current = null;
                },
              },
              {
                label: task ? "Pause it" : "Take it off",
                run: () =>
                  run(async () => {
                    awaySince.current = null;
                    if (task) {
                      await takeOff(task.id, minutes);
                      setPaused(await api.stopTimer(task.id));
                    } else askMain({ kind: "take-off", minutes });
                    say(`Paused, and took ${minutes} min off.`);
                  }),
              },
            ],
          });
        }
        return;
      }
      const since = awaySince.current;
      const trusted = stillOnIt.current;
      awaySince.current = null;
      drifted.current = false;
      stillOnIt.current = false;
      if (since !== null) welcomeBack();
      if (since !== null && !trusted && prefs.away && timed && !timed.paused) {
        const minutes = Math.round((idleFrom - since) / 60_000);
        if (minutes >= AWAY_S / 60) {
          const task = timed.task;
          say(line(p, "away", { n: minutes }), {
            ms: 10 * 60_000,
            actions: [
              { label: "Count it", run: () => {} },
              {
                label: "Take it off",
                run: () =>
                  run(async () => {
                    if (task) await takeOff(task.id, minutes);
                    else askMain({ kind: "take-off", minutes });
                    say(`Took ${minutes} min off.`);
                  }),
              },
            ],
          });
          return;
        }
      }
      if (prefs.breaks && !rest && Date.now() - stretchFrom.current >= STRETCH_MS && !shownBubble.current) {
        stretchFrom.current = Date.now();
        say(BREAK_NUDGES[Math.floor(Date.now() / STRETCH_MS) % BREAK_NUDGES.length], { ms: 15_000, queue: true });
      }
    };
    void check();
    const every = setInterval(() => void check(), STATE_MS);
    return () => {
      gone = true;
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  // ---------- What he says by himself ----------

  // A cheer for anything done today, here or anywhere.
  const done = timers.today?.done ?? null;
  const before = useRef<number | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = done;
    if (!prefs.cheers || was === null || done === null || done <= was || !timers.today) return;
    const everything = done === timers.today.total;
    // Just finished here, he's already said so: the day's last one still gets its fireworks.
    if (Date.now() - justFinished.current < 5000) return everything ? sparkle(true) : undefined;
    cheer(everything ? line(p, "dayDone") : line(p, "doneCount", { n: done }), false, everything);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Something about to start, once: a meeting online (with Join), or what's
  // next on the day's timeline.
  const next = timers.next;
  const soon = next && !next.inProgress ? next.startMinute - nowMinute() : null;
  const minute = nowMinute();
  const meeting = events
    .map((e) => ({ title: e.title, start: e.startMinute, link: meetingLink(e) }))
    .filter((e) => e.link && e.start - minute >= 1 && e.start - minute <= 10)
    .sort((a, b) => a.start - b.start)[0];
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (ringing) return;
    if (meeting && warned.current !== `${meeting.title}@${meeting.start}`) {
      warned.current = `${meeting.title}@${meeting.start}`;
      if (prefs.sound) chime("soft");
      say(`**${meeting.title}** starts in ${meeting.start - minute} min.`, { ms: 60_000, actions: [{ label: "Join", run: () => void openUrl(meeting.link!).catch((e) => say(errorText(e))) }] });
      return;
    }
    if (!next || soon === null || soon < 1 || soon > 10 || warned.current === `${next.title}@${next.startMinute}`) return;
    warned.current = `${next.title}@${next.startMinute}`;
    say(`**${next.title}** starts in ${soon} min.`, { ms: 12_000, queue: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soon, next, ringing, meeting?.title, meeting?.start, say]);

  // A morning hello, birthdays and bills, an evening wrap-up, a nudge about
  // goals, how was today, and now and then something else worth knowing:
  // when he's free to talk.
  const free = !bubble && voice === "idle" && !menu && !typing && !ringing && !focused;
  const lastNudge = useRef(Date.now());
  useEffect(() => {
    if (!free) return;
    const hour = new Date(now).getHours();
    if (prefs.checkin && hour >= 20 && !saidToday("checkin")) {
      markSaid("checkin");
      return say("How was today?", {
        ms: 10 * 60_000,
        queue: true,
        actions: MOODS.map((m, i) => ({
          label: m.face,
          title: m.word,
          run: () => doIt("journal_write", { title: "Evening check-in", text: `Today felt ${m.word}.`, mood: i + 1 }, "Saved to your journal."),
        })),
      });
    }
    if (!prefs.nudges || !briefing) return;
    const lines = briefing.lines.map((l) => l.text);
    if (hour < 12 && !saidToday("morning")) {
      markSaid("morning");
      return say([`${briefing.greeting}!`, ...(weather ? [weatherSaid(weather)] : []), ...lines.slice(0, 2)].join(" "), { ms: 14_000, queue: true });
    }
    if (hour >= 8 && !saidToday("heads")) {
      markSaid("heads");
      void headsUp(areas).then((heads) => heads.length && say(heads.slice(0, 2).join(" "), { ms: 14_000, queue: true }));
      return;
    }
    if (hour >= 18 && !saidToday("evening") && timers.today && timers.today.total > 0) {
      markSaid("evening");
      return say(`You finished **${timers.today.done} of ${timers.today.total}** today. ${briefing.signoff}`, { ms: 14_000, queue: true });
    }
    const goals = briefing.lines.find((l) => l.area === "goals" && l.id.includes("behind"));
    if (hour >= 19 && hour < 22 && goals && !saidToday("goals")) {
      markSaid("goals");
      return say(goals.text, { ms: 15_000, queue: true, actions: [{ label: "Log progress", run: () => askMain({ kind: "open", area: "goals" }) }] });
    }
    if (!timed && lines.length && now - lastNudge.current > NUDGE_MS) {
      lastNudge.current = now;
      say(lines[Math.floor(now / NUDGE_MS) % Math.min(3, lines.length)], { queue: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, free, briefing, prefs.nudges, prefs.checkin]);

  // ---------- Focus, and what's next ----------

  // Every 25 minutes of focus today adds a ring to his halo.
  const [focusRings, setFocusRings] = useState(() => {
    const saved = load<{ day: string; blocks: string[] }>(FOCUS_KEY);
    return saved?.day === today() ? saved.blocks.length : 0;
  });
  useEffect(() => {
    if (!timed || timed.paused || rest) return;
    const start = timed.kind === "task" ? timers.running?.timerStartedAt : String((timers.study ?? timers.reading)?.startedAt ?? "");
    if (!start) return;
    const blocks = Math.floor(runningFor / FOCUS_BLOCK_MS);
    if (!blocks) return;
    const saved = load<{ day: string; blocks: string[] }>(FOCUS_KEY);
    const mine = saved?.day === today() ? saved.blocks : [];
    const key = `${timed.task?.id ?? timed.kind}@${start}#${blocks}`;
    if (mine.includes(key)) return;
    const next = [...mine, key];
    keep(FOCUS_KEY, { day: today(), blocks: next });
    setFocusRings(next.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(runningFor / FOCUS_BLOCK_MS), timed?.kind, timed?.paused, rest]);

  // The last couple of minutes of an estimate: what's next, ready to start.
  const nextFor = useRef<string | null>(null);
  useEffect(() => {
    const task = timed?.task;
    if (!task || !timed?.estimate || timed.paused || !areas.includes("daily_plan")) return;
    const left = (timed.estimate - timed.minutes) * 60_000;
    const key = `${task.id}:${timed.estimate}`;
    if (left <= 0 || left > UP_NEXT_MS || nextFor.current === key) return;
    nextFor.current = key;
    void api.getDay(today(), today()).then((day) => {
      const open = day.tasks.filter((t) => !t.doneAt && t.id !== task.id);
      const next = open.filter((t) => t.focusRank !== null).sort((a, b) => (a.focusRank ?? 0) - (b.focusRank ?? 0))[0] ?? open[0];
      if (!next) return;
      say(line(p, "upNext", { title: next.title }), {
        ms: 45_000,
        queue: true,
        actions: [{ label: "Start it now", run: () => run(async () => { await api.startTimer(next.id); setPaused(null); }) }],
      });
    }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // He remembers how often you've timed something this week: "your third essay session".
  const sessionOf = timed && !timed.paused ? `${timed.task?.id ?? timed.kind}@${timed.kind === "task" ? timers.running?.timerStartedAt : (timers.study ?? timers.reading)?.startedAt}` : null;
  useEffect(() => {
    if (!sessionOf || !timed) return;
    const week = mondayOf(today());
    const saved = load<{ week: string; seen: string[]; counts: Record<string, number> }>(SESSIONS_KEY);
    const mine = saved?.week === week ? saved : { week, seen: [], counts: {} };
    if (mine.seen.includes(sessionOf)) return;
    const title = timed.title.trim().toLowerCase();
    const count = (mine.counts[title] ?? 0) + 1;
    keep(SESSIONS_KEY, { week, seen: [...mine.seen, sessionOf].slice(-200), counts: { ...mine.counts, [title]: count } });
    if (count >= 2) say(line(p, "sessions", { nth: ordinal(count), title: timed.title }), { ms: 6000, queue: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionOf]);

  // ---------- Reacting to what you do ----------

  // A task moved to tomorrow for the third time: a wince, and an offer to
  // break it up. The inbox emptied: applause.
  const plan = useRef<{ open: Set<string>; titles: Map<string, string>; inbox: number } | null>(null);
  const watchPlan = useCallback(() => {
    if (!areas.includes("daily_plan")) return;
    const day = today();
    void Promise.all([api.getDay(day, day), api.getDay(addDays(day, 1), day)]).then(([now, tomorrow]) => {
      const open = now.tasks.filter((t) => !t.doneAt);
      const was = plan.current;
      plan.current = { open: new Set(open.map((t) => t.id)), titles: new Map(open.map((t) => [t.id, t.title])), inbox: now.inbox?.length ?? 0 };
      if (!was) return;
      const pushed = load<Record<string, number>>(PUSHED_KEY) ?? {};
      for (const id of was.open) {
        if (plan.current.open.has(id) || !tomorrow.tasks.some((t) => t.id === id && !t.doneAt)) continue;
        pushed[id] = (pushed[id] ?? 0) + 1;
        if (pushed[id] === PUSHES) {
          const title = was.titles.get(id) ?? "That task";
          moveFor("wince", 900);
          say(line(personaRef.current, "pushed", { title }), {
            ms: 20_000,
            queue: true,
            actions: [{ label: "Break it up", run: () => askMain({ kind: "open-chat", text: `Help me break "${title}" into smaller tasks.` }) }],
          });
        }
      }
      keep(PUSHED_KEY, pushed);
      if (was.inbox > 0 && plan.current.inbox === 0) {
        moveFor("clap", 1400);
        sparkle(true);
        say(line(personaRef.current, "inboxZero"), { queue: true });
      }
    }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas]);
  const personaRef = useRef(p);
  personaRef.current = p;
  useEffect(() => watchPlan(), [watchPlan]);
  const planChanged = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useDataChanged(() => {
    clearTimeout(planChanged.current);
    planChanged.current = setTimeout(watchPlan, 1200);
  });

  // ---------- The world around him ----------

  // The weather where he's set to show it (where the computer is, or a place), in his halo.
  useEffect(() => {
    const from = prefs.weatherFrom;
    if (from === "off" || (from === "place" && !prefs.weather)) return setWeather(null);
    let gone = false;
    const look = () => void weatherIn(from === "place" ? prefs.weather : "", from === "auto").then((w) => !gone && setWeather(w), () => {});
    look();
    const every = setInterval(look, 30 * 60_000);
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [prefs.weatherFrom, prefs.weather]);

  // A window comes to the front: he glances at it.
  useEffect(() => {
    if (prefs.style === "notch") return;
    let gone = false;
    let front: number | null | undefined;
    let back: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const state = await deskState().catch(() => null);
      if (!state || gone) return;
      const id = state.active?.id ?? null;
      const changed = front !== undefined && id !== null && id !== front;
      front = id;
      if (!changed || !state.active) return;
      const scale = window.devicePixelRatio || 1;
      const a = state.active;
      const me = { x: (window.screenX + window.innerWidth / 2) * scale, y: (window.screenY + window.innerHeight / 2) * scale };
      setGlance({ x: clamp((a.x + a.width / 2 - me.x) / (500 * scale)), y: clamp((a.y + a.height / 2 - me.y) / (380 * scale)) });
      clearTimeout(back);
      back = setTimeout(() => setGlance(null), 1600);
    };
    const every = setInterval(() => void check(), 1500);
    return () => {
      gone = true;
      clearInterval(every);
      clearTimeout(back);
    };
  }, [prefs.style]);

  // ---------- Rituals ----------

  // The first time he's out each day: a big stretch, and good morning.
  useEffect(() => {
    if (saidToday("stretch")) return;
    markSaid("stretch");
    moveFor("stretch", 2200);
    say(line(p, "stretch"), { ms: 4000, queue: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Axiom's closing: a wave goodbye, then he dissolves.
  useTauriEvent(BYE_EVENT, () => {
    moveFor("wave", 1300);
    setGlad(Date.now() + 2000);
    say(line(p, "bye"), { ms: 2000 });
    setTimeout(() => setLeaving(true), 1150);
  });

  // ---------- Playing about ----------

  useEffect(() => { if (focused) setAntic(null); }, [focused]);
  useEffect(() => { if (!free) setStory(null); }, [free]);

  // Left alone: a little antic now and then, and sometimes a whole story.
  useEffect(() => {
    if (!free || antic || story || flowing) return;
    const wait = ANTIC_MS[0] + Math.random() * (ANTIC_MS[1] - ANTIC_MS[0]);
    const start = setTimeout(() => {
      if (!reducedMotion() && Math.random() < 0.35) {
        const stories: Story[] = ["firefly", "juggle", "hum", ...(look.holding === "book" ? (["read"] as Story[]) : [])];
        return setStory(stories[Math.floor(Math.random() * stories.length)]);
      }
      const late = new Date().getHours() >= 21;
      const choices = ANTICS.filter((a) => !(reducedMotion() && MOVES.includes(a)) && (a !== "yawn" || late || Math.random() < 0.3));
      setAntic(choices[Math.floor(Math.random() * choices.length)]);
    }, wait);
    return () => clearTimeout(start);
  }, [free, antic, story, flowing, look.holding]);
  // A story plays out, then ends. A firefly flits about him, his eyes on it,
  // until he catches it.
  useEffect(() => {
    if (!story) return;
    const started = Date.now();
    const flits = story === "firefly" ? setInterval(() => {
      const t = (Date.now() - started) / 1000;
      setFly({ x: Math.sin(t * 1.9) * 0.85 * Math.cos(t * 0.6), y: Math.cos(t * 1.3) * 0.55 - 0.25 });
    }, 80) : undefined;
    const end = setTimeout(() => {
      if (story === "firefly") {
        setAntic("hop");
        setGlad(Date.now() + 1800);
        if (Math.random() < 0.5) say(line(p, "caught"), { ms: 2500, queue: true });
      }
      setStory(null);
    }, STORY_MS[story]);
    return () => {
      clearInterval(flits);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);
  useEffect(() => {
    if (!antic) return;
    const end = setTimeout(() => setAntic(null), antic === "look" || antic === "yawn" ? 3200 : 1400);
    return () => clearTimeout(end);
  }, [antic]);

  // ---------- His face ----------

  const hour = new Date(now).getHours();
  let mood: Mood = "idle";
  if (voice === "listening" || dragging) mood = "listening";
  else if (voice === "thinking" && lemma.feeling === "acknowledged") mood = "acknowledged";
  else if (voice === "thinking") mood = lemma.slow ? "patient" : "thinking";
  else if (calling) mood = "concerned";
  else if (move?.kind === "dizzy") mood = "puzzled";
  else if (move?.kind === "duck" || move?.kind === "wince") mood = "concerned";
  else if (move?.kind === "stretch") mood = "sleepy";
  else if (move?.kind === "clap" || move?.kind === "wave") mood = "happy";
  else if (lemma.feeling && (!focused || ["acknowledged", "puzzled", "concerned"].includes(lemma.feeling))) mood = lemma.feeling;
  else if (glad > now) mood = "happy";
  else if (bubble && bubble.until - now > BUBBLE_MS - 1800) mood = "speaking";
  else if (rest) mood = "happy";
  else if (timed?.paused) mood = "sleepy";
  else if (soon !== null && soon >= 0 && soon <= 10) mood = "waiting";
  else if (antic === "look") mood = "looking";
  else if (antic === "smile" || story === "hum" || story === "juggle") mood = "happy";
  else if (story === "firefly" || story === "read") mood = "looking";
  else if (antic === "yawn" || hour >= 23 || hour < 5) mood = "sleepy";
  const display = faceOf(timed, rest, now);

  // ---------- Tucked into the edge ----------

  // Set to, he waits in a notch on the side of the screen. Pointed at, the
  // notch peeks (what's timed or next); a moment later, or clicked, he pops
  // out, as he does when he has something to say or do, staying out a
  // moment after.
  const notch = prefs.style === "notch";
  // The pointer can leave him without a pointerleave (off a menu, say): while
  // it seems to be over him, where it really is is checked, so he tucks back.
  useEffect(() => {
    if (!hovered && !holding) return;
    const window_ = getCurrentWindow();
    const check = setInterval(() => {
      Promise.all([cursorPosition(), window_.outerPosition(), window_.innerSize()])
        .then(([c, at, size]) => {
          if (c.x >= at.x && c.y >= at.y && c.x < at.x + size.width && c.y < at.y + size.height) return;
          setHovered(false);
          setHolding(false);
        })
        .catch(() => {});
    }, 500);
    return () => clearInterval(check);
  }, [hovered, holding]);
  // Opened with a click, he stays out while the pointer's on him.
  useEffect(() => {
    if (!hovered) setOpened(false);
  }, [hovered]);
  const wanted = (notch ? opened : hovered || holding) || menu || recall || typing || dragging || voice !== "idle" || !!bubble || !!ringing || calling;
  useEffect(() => {
    if (wanted) setOutUntil(Date.now() + 2500);
  }, [wanted, now]);
  const wantedOut = !notch || wanted || now < outUntil;
  // Going back into the notch, he fades out first.
  const wasOut = useRef(wantedOut);
  useEffect(() => {
    const was = wasOut.current;
    wasOut.current = wantedOut;
    if (!notch || !was || wantedOut || reducedMotion()) return;
    setFolding(true);
    const done = setTimeout(() => setFolding(false), FOLD_MS);
    return () => clearTimeout(done);
  }, [wantedOut, notch]);
  const out = wantedOut || folding;

  // Left alone a while (and floating), he fades to a ghost of himself.
  const busy = hovered || holding || menu || recall || typing || dragging || voice !== "idle" || !!bubble || !!ringing || calling;
  if (busy) lastTouched.current = now;
  const ghost = !notch && !busy && now - lastTouched.current > GHOST_MS;

  // Late at night with nothing on, he dozes.
  // How long the screen's kept awake for yet, from this moment (his clock ticks once a second).
  const awakeLeft = awakeUntil ? Math.max(0, awakeUntil - Date.now()) : 0;

  const night = (new Date(now).getHours() >= 23 || new Date(now).getHours() < 5) && !timed && !rest && !bubble && voice === "idle" && !awakeUntil;

  // Fading in as a hologram when he comes out (or is asked back), and out before he's put away.
  useEffect(() => {
    if (!arriving) return;
    const done = setTimeout(() => setArriving(false), ARRIVE_MS);
    return () => clearTimeout(done);
  }, [arriving]);
  useTauriEvent(LEAVE_EVENT, () => setLeaving(true));
  useTauriEvent(STAY_EVENT, () => {
    setLeaving(false);
    setArriving(true);
  });
  // Out of the notch: he materialises.
  const wasTucked = useRef(!wantedOut);
  useEffect(() => {
    if (wasTucked.current && wantedOut) setArriving(true);
    wasTucked.current = !wantedOut;
  }, [wantedOut]);
  const peeking = notch && !out && hovered;
  const today_ = timers.today;

  // ---------- What the notch shows ----------

  // What's on, most pressing first: the timer; a meeting from the calendar
  // (from an hour before it starts until it ends); a reminder due within
  // the hour; one kept for when you're back. The first shows in the notch;
  // more than one, and dots say so; pointing at it lists them all.
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  // "12m" while there's a while to go, a ticking "4:59" in the last ten minutes.
  const countdown = (ms: number) => (ms < 10 * 60_000 ? faceTime(ms / 60_000) : `${Math.ceil(ms / 60_000)}m`);
  const views: NotchView[] = [];
  if (timed && display) views.push({ key: "timer", tone: rest ? "break" : up ? "over" : "timer", big: display.text, color: display.color, line: rest ? `Break: back to ${timed.title}` : timed.title, progress: null, actions: [] });
  const meeting_ = events
    .filter((e) => e.busy !== false)
    .map((e) => {
      const start = midnight + e.startMinute * 60_000;
      return { title: e.title, start, end: start + e.durationMinutes * 60_000, link: meetingLink(e) };
    })
    .filter((m) => m.end > now && m.start - now <= HOUR)
    .sort((a, b) => a.start - b.start)[0];
  if (meeting_) {
    const on = meeting_.start <= now;
    const link = meeting_.link;
    views.push({
      key: "meeting",
      tone: on ? "meeting" : meeting_.start - now <= 5 * 60_000 ? "soon" : "meeting",
      icon: CalendarClock,
      big: countdown((on ? meeting_.end : meeting_.start) - now),
      line: on ? `${meeting_.title} · ends ${at(meeting_.end)}` : `${meeting_.title} in ${duration(Math.ceil((meeting_.start - now) / 60_000))} · ${at(meeting_.start)}`,
      progress: on ? (now - meeting_.start) / (meeting_.end - meeting_.start) : 1 - (meeting_.start - now) / HOUR,
      actions: link ? [{ label: "Join", run: () => void openUrl(link).catch((e) => say(errorText(e))) }] : [],
    });
  }
  const dueSoon = reminderList.find((r) => !r.onReturn && r.at > now && r.at - now <= HOUR);
  if (dueSoon) {
    views.push({
      key: `reminder:${dueSoon.id}`,
      tone: "reminder",
      icon: Bell,
      big: countdown(dueSoon.at - now),
      line: `${dueSoon.text} · ${at(dueSoon.at)}`,
      progress: 1 - (dueSoon.at - now) / HOUR,
      actions: [{ label: "Cancel", run: () => cancel(dueSoon.id) }],
    });
  }
  const whenBack = reminderList.find((r) => r.onReturn);
  if (whenBack) {
    views.push({ key: `back:${whenBack.id}`, tone: "reminder", icon: Bell, big: "later", line: `${whenBack.text} · when you're back`, progress: null, actions: [{ label: "Cancel", run: () => cancel(whenBack.id) }] });
  }
  const lead = views[0] ?? null;
  const LeadIcon = lead?.icon;
  // Nothing on: how the day's going, or just hello.
  const idleLine = today_ && today_.total > 0 ? `${today_.done} of ${today_.total} done today` : "Hi!";
  // Out of the notch with nothing timed, the meeting and reminder show under him.
  const chips = timed ? [] : views;

  // ---------- Fitting the window to him ----------

  const docked = useRef(notch);
  docked.current = notch;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () =>
      void resizeDesk(Math.ceil(el.offsetWidth), Math.ceil(el.offsetHeight), docked.current)
        .then((edge) => edge && setSide(edge))
        .catch(() => {});
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    // Dragged in the notch: back against the nearer edge once he's let go.
    let settle: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | null = null;
    let gone = false;
    getCurrentWindow()
      .onMoved(({ payload }) => {
        // Dragged in the notch: back against the nearer edge. Floating:
        // snapped to an edge nearby, and remembered there.
        if (!docked.current && !dragged.current) return;
        // Being dragged, he leans into it; let go fast, he wobbles on landing.
        const now = Date.now();
        const was = flight.current;
        if (was && now > was.at) {
          const speed = (payload.x - was.x) / ((now - was.at) / 1000);
          setLean(Math.max(-16, Math.min(16, speed / 90)));
          flight.current = { x: payload.x, y: payload.y, at: now, fastest: Math.max(was.fastest, Math.hypot(payload.x - was.x, payload.y - was.y) / ((now - was.at) / 1000)) };
        } else {
          flight.current = { x: payload.x, y: payload.y, at: now, fastest: 0 };
        }
        clearTimeout(settle);
        settle = setTimeout(() => {
          const fastest = flight.current?.fastest ?? 0;
          flight.current = null;
          setLean(0);
          if (dragged.current) moveFor(fastest > 2200 ? "wobble" : "land", fastest > 2200 ? 900 : 520);
          if (docked.current) return fit();
          dragged.current = false;
          void settleDesk().catch(() => {});
        }, 350);
      })
      .then((off) => (gone ? off() : (stop = off)), () => {});
    return () => {
      gone = true;
      watch.disconnect();
      clearTimeout(settle);
      stop?.();
    };
  }, []);
  useEffect(() => {
    const el = box.current;
    if (el) void resizeDesk(Math.ceil(el.offsetWidth), Math.ceil(el.offsetHeight), notch).then((edge) => edge && setSide(edge), () => {});
  }, [notch]);

  // ---------- The right-click menu ----------

  const resize = (by: number) => setDeskPrefs({ size: prefs.size + by });
  const hideForNow = () => {
    setPaused(null);
    void hideDesk().catch(() => {});
  };
  const hideFromDesktop = () => {
    setDeskPrefs({ mode: "off" });
    void hideDesk().catch(() => {});
  };
  const entries: (MenuEntry | "-")[] = [
    { label: voice === "listening" ? "Stop listening" : `Talk to ${me}`, run: () => void listen() },
    { label: `Type to ${me}`, run: startTyping },
    {
      label: "What did you say?",
      run: () => {
        say(null);
        setRecall(true);
      },
      disabled: !said.length && !did.length,
    },
    ...(timed?.task
      ? [timed.paused ? { label: "Resume the timer", run: () => resume(timed.task!) } : { label: "Pause the timer", run: () => pause(timed.task!) }, { label: "Done", run: () => finish(timed.task!) }]
      : timed
        ? [{ label: timed.kind === "reading" ? "Stop and log reading" : "Stop and log study time", run: stopTimed }]
        : []),
    "-",
    { label: notch ? "Float freely" : "Tuck into the edge", run: () => setDeskPrefs({ style: notch ? "float" : "notch" }) },
    { label: "Bigger", run: () => resize(SIZE.step), disabled: prefs.size >= SIZE.largest },
    { label: "Smaller", run: () => resize(-SIZE.step), disabled: prefs.size <= SIZE.smallest },
    "-",
    { label: "Open Axiom", run: () => void openMain().catch(() => {}) },
    { label: `${me}'s settings`, run: () => askMain({ kind: "open", area: "lemma" }) },
    "-",
    { label: "Hide until the next timer", run: hideForNow },
    { label: "Hide from desktop", run: hideFromDesktop },
    "-",
    // Axiom may be carrying on in the background, its window closed: this ends it.
    { label: "Quit Axiom", run: () => void quitAxiom().catch(() => {}) },
  ];
  const openMenu = async () => {
    try {
      await popUp(entries);
    } catch {
      // No system menu (a browser, a test): the same one, drawn here.
      setMenu(true);
    }
  };

  // ---------- The quick menu (held down) ----------

  /** Asks for a line of text in his bubble, and does something with it. */
  const askFor = (prompt: string, placeholder: string, then: (text: string) => void) =>
    say(prompt, { form: { kind: "text", placeholder, submit: then, skip: { label: "Cancel", run: () => {} } } });
  const quickItems = [
    { label: "Task", icon: ListPlus, run: () => askFor("A task for today?", "What needs doing", (t) => doIt("plan_add", { items: [{ title: t.slice(0, 120) }] }, `Added **${t.slice(0, 60)}** to today.`)) },
    {
      label: "Remind",
      icon: Bell,
      run: () => askFor("Remind you of what, and when?", "Call Sam in 20 min · at 15:00 · when I'm back", (t) => void answer(`remind me to ${t}`).catch((e) => say(errorText(e)))),
    },
    { label: "Note", icon: StickyNote, run: () => askFor("What shall I note down?", "A thought, an idea…", (t) => doIt("notes_write", { title: t.split("\n")[0].slice(0, 60), text: t }, "Noted.")) },
    { label: "25 min", icon: Timer, run: () => doIt("plan_timer", { action: "start", title: "Focus session", minutes: 25 }, line(p, "focusStart", { n: 25 })) },
    { label: "50 min", icon: Timer, run: () => doIt("plan_timer", { action: "start", title: "Focus session", minutes: 50 }, line(p, "focusStart", { n: 50 })) },
    { label: "Awake", icon: Coffee, run: askAwake },
    { label: "Type", icon: Keyboard, run: startTyping },
  ];
  const holdDown = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      press.current = null;
      setRadial(true);
      setGlad(Date.now() + 1200);
    }, HOLD_MS);
  };
  const letGo = () => clearTimeout(holdTimer.current);
  useEffect(() => {
    if (!radial) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setRadial(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [radial]);

  // Where he looks, all told: at a window that's just come up, at what a
  // story's about (the firefly, the juggling, his book), or as he would.
  const storyGaze = story === "firefly" ? fly : story === "juggle" ? { x: 0, y: -0.75 } : story === "read" ? { x: 0, y: 0.7 } : null;
  const gaze = glance ?? storyGaze ?? following;
  // The quick menu's buttons (sized like his words) ring him clear of his body
  // and of each other, with room kept around him so none is cut off.
  const words = Math.min(1.35, Math.max(0.8, prefs.size / 130));
  const radialReach = prefs.size * 0.62 + 12 * words;
  const radialRoom = Math.ceil(radialReach + 23 * words - prefs.size / 2 + 6);
  // His breathing: slow while focusing or dozing, quick when time's up.
  const breath = calling ? 1.3 : night ? 7 : flowing ? 6 : focused ? 5 : 4;

  // ---------- Drawing him ----------

  // Tucked into the notch, he's small; out, as big as he's set to be.
  const tucked = notch && !out;
  const size = tucked ? TUCKED : prefs.size;
  // The timer is a halo he stands in: an ellipse at his feet, filling from
  // the front as the time goes (in his own colour), its back passing behind him.
  const halo = { w: size, h: Math.round(size * 0.3) };
  const rx = size * 0.35;
  const ry = halo.h * 0.34;
  const [cx, cy] = [halo.w / 2, halo.h / 2];
  const loop = `M ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry}`;
  const progress = rest ? 1 - Math.max(0, rest.until - now) / (rest.minutes * 60_000) : timed?.estimate ? Math.min(1, timed.minutes / timed.estimate) : null;
  // No estimate: a short streak goes round once a minute.
  const turn = ((now / 1000) % 60) / 60;
  const attentive = hovered || holding || menu || typing || dragging || voice !== "idle";
  // The last minute: the halo and the time beat like a heart.
  const leftMs = rest ? rest.until - now : timed?.estimate && !timed.paused ? (timed.estimate - timed.minutes) * 60_000 : null;
  const final = leftMs !== null && leftMs > 0 && leftMs <= 60_000;
  const details = detailsOf(timed, rest, now);
  const states = [
    timed || rest ? "is-timing" : "",
    antic && MOVES.includes(antic) ? `is-${antic}` : "",
    shake ? "is-shaking" : "",
    notch ? `is-notch side-${side}` : "",
    tucked ? "is-tucked" : "",
    dragging ? "is-dropping" : "",
    arriving && !leaving ? "is-arriving" : "",
    leaving || folding ? "is-leaving" : "",
    ghost ? "is-ghost" : "",
    night ? "is-night" : "",
    move ? `is-${move.kind}` : "",
    story ? `is-story-${story}` : "",
    flowing ? "is-flow" : "",
    radial ? "is-radial" : "",
  ];

  return (
    <main
      ref={box}
      className={["desk", ...states].filter(Boolean).join(" ")}
      aria-label={`${me} on the desktop`}
      data-looking={attentive ? "you" : glance ? "window" : gaze ? "cursor" : "middle"}
      style={{ "--lemma-glow": look.glow, "--breath": `${breath}s`, "--u": tucked ? 1 : prefs.size / 130 } as React.CSSProperties}
      onContextMenu={(e) => {
        e.preventDefault();
        void openMenu();
      }}
      onWheel={(e) => resize(e.deltaY < 0 ? SIZE.step : -SIZE.step)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        setHolding(false);
        letGo();
      }}
      onPointerDown={(e) => {
        setHolding(true);
        if (e.button !== 0 || (e.target as Element).closest("button, input, form, .desk-menu, .desk-bubble, .desk-radial")) return;
        press.current = { x: e.clientX, y: e.clientY };
        // Held without moving: the quick menu.
        if (!(notch && !out)) holdDown();
      }}
      onPointerMove={(e) => {
        const at = press.current;
        if (!at || Math.abs(e.clientX - at.x) + Math.abs(e.clientY - at.y) < 5) return;
        press.current = null;
        letGo();
        dragged.current = true;
        void getCurrentWindow().startDragging().catch(() => {});
      }}
      onPointerUp={() => {
        setHolding(false);
        letGo();
        if (!press.current) return;
        press.current = null;
        // The quick menu's open: a tap on him closes it.
        if (radial) return setRadial(false);
        // Tucked: a click brings him out of the notch (pointing only peeks).
        if (notch && !out) return setOpened(true);
        // A tap: he's pleased to see you.
        setPet(n => n + 1);
        setGlad(Date.now() + 1500);
        if (!reducedMotion()) setAntic("hop");
        // Tapped a couple of times (or the first time, never having talked to
        // him): how to talk to him, his way. Otherwise, hello. (A moment's
        // wait first: the two clicks of a double-click aren't taps.)
        clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => {
          const t = taps.current;
          const at_ = Date.now();
          t.count = at_ - t.last < TAP_WINDOW_MS ? t.count + 1 : 1;
          t.last = at_;
          if (t.count >= HINT_TAPS || !hasTalked()) say(tapHint(p), { ms: 4500 });
          else if (!shownBubble.current) say(line(p, "hello"), { ms: 3500 });
        }, 320);
      }}
      onDoubleClick={(e) => {
        clearTimeout(tapTimer.current);
        if (!(e.target as Element).closest("button, input, form, .desk-bubble")) void listen();
      }}
      // A middle-click: type to him.
      onAuxClick={(e) => {
        if (e.button === 1) startTyping();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void readDrop(e.dataTransfer).then((d) => (d ? dropped(d) : say("I can't keep that one.")));
      }}
    >
      {out && bubble && (
        <div className="desk-bubble" role="status">
          <p>
            <Words text={bubble.text} />
          </p>
          {bubble.form && <Ask key={bubble.until} question={bubble.form} onAnswer={answered} />}
          {bubble.actions && (
            <div className={`desk-bubble-actions${bubble.actions.every((a) => a.title) ? " is-faces" : ""}`}>
              {bubble.actions.map((action, i) => (
                <button
                  key={action.label}
                  className={i === 0 && !action.title ? "btn btn-sm" : "btn btn-sm btn-ghost"}
                  title={action.title}
                  aria-label={action.title}
                  onClick={() => {
                    answered();
                    action.run();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {/* How long it stays: running down, and waiting while he's pointed at. */}
          <span className="desk-bubble-life" key={bubble.id} style={{ animationDuration: `${bubble.ms}ms` }} aria-hidden="true" />
        </div>
      )}
      {out && recall && !bubble && (
        <div className="desk-bubble desk-recall" role="dialog" aria-label="What I said">
          {did.length > 0 && (
            <>
              <p>
                <b>What I did</b>
              </p>
              <ol>
                {did.map((d) => (
                  <li key={d.id}>
                    <time>{at(d.at)}</time>
                    <span>
                      <Words text={d.text} />
                    </span>
                    {d.undone ? (
                      <small className="desk-recall-undone">Undone</small>
                    ) : (
                      <button className="btn btn-sm btn-ghost" onClick={() => undoIt(d.id, d.undo)}>
                        Undo
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          <p>
            <b>What I said</b>
          </p>
          <ol>
            {said.map((s) => (
              <li key={s.at + s.text}>
                <time>{at(s.at)}</time>
                <span>
                  <Words text={s.text} />
                </span>
              </li>
            ))}
          </ol>
          <div className="desk-bubble-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => setRecall(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      {out && typing && <TypeBox me={me} onSend={typed} />}
      {out && dragging && <p className="desk-hearing">Drop it on me</p>}
      {out && voice !== "idle" && <p className="desk-hearing">{voice === "listening" ? "Listening… (double-click to stop)" : "Thinking…"}</p>}

      <div
        className="desk-lemma"
        style={{ width: size, height: size, "--lean": `${lean}deg`, ...(radial ? { margin: radialRoom } : {}) } as React.CSSProperties}
      >
        {weather && !tucked && <WeatherFx weather={weather} />}
        {!tucked && (timed || rest) && (
          <svg
            className={`desk-ring${up ? " is-over" : ""}${rest ? " is-break" : ""}${timed?.paused && !rest ? " is-paused" : ""}${final ? " is-final" : ""}${flowing ? " is-flow" : ""}`}
            style={{ width: halo.w, height: halo.h }}
            viewBox={`0 0 ${halo.w} ${halo.h}`}
            aria-hidden="true"
          >
            {/* A ring for each 25 minutes of focus today, like a tree's. */}
            {Array.from({ length: Math.min(5, focusRings) }, (_, i) => (
              <ellipse key={i} className="desk-ring-focus" cx={cx} cy={cy} rx={rx + (i + 1) * size * 0.028} ry={ry + (i + 1) * halo.h * 0.06} style={{ opacity: 0.5 - i * 0.08 }} />
            ))}
            <ellipse className="desk-ring-floor" cx={cx} cy={cy} rx={rx} ry={ry} />
            <path className="desk-ring-track" d={loop} pathLength={100} />
            {progress !== null ? (
              <path className="desk-ring-done" d={loop} pathLength={100} strokeDasharray={`${Math.max(0.001, progress * 100)} 100`} />
            ) : (
              <path className="desk-ring-dot" d={loop} pathLength={100} strokeDasharray="7 93" strokeDashoffset={-turn * 100} />
            )}
          </svg>
        )}
        <Face mood={mood} size={size} level={level} facing={facing} gaze={gaze} display={null} idlePreview={pet} />
        {burst && !tucked && <Burst key={burst.id} big={burst.big} scale={size / 130} onDone={() => setBurst(null)} />}
        {night && !tucked && (
          <span className="desk-zzz" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>z</i>
          </span>
        )}
        {story === "firefly" && <i className="desk-firefly" aria-hidden="true" style={{ left: `${50 + fly.x * 48}%`, top: `${42 + fly.y * 44}%` }} />}
        {story === "juggle" && (
          <span className="desk-juggle" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {story === "hum" && (
          <span className="desk-notes" aria-hidden="true">
            <i>♪</i>
            <i>♫</i>
            <i>♪</i>
          </span>
        )}
        {radial && (
          <div className="desk-radial" role="menu" aria-label={`Quick things for ${me}`}>
            {quickItems.map((item, i) => {
              const angle = (i / quickItems.length) * Math.PI * 2 - Math.PI / 2;
              const reach = radialReach;
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  role="menuitem"
                  className="desk-radial-item"
                  style={{ "--x": `${Math.cos(angle) * reach}px`, "--y": `${Math.sin(angle) * reach}px`, animationDelay: `${i * 35}ms` } as React.CSSProperties}
                  onClick={() => {
                    setRadial(false);
                    item.run();
                  }}
                >
                  <Icon size={Math.round(14 * words)} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The time, glowing under him; pointed at, how long's left and when it ends. */}
      {!tucked && display && (
        <span className={`desk-time${final ? " is-final" : ""}${up ? " is-over" : ""}${rest ? " is-break" : ""}`} style={{ color: display.color }} role="timer" aria-label={details ?? display.text}>
          {display.text}
        </span>
      )}

      {/* Keeping the screen awake: a small countdown under him. Clicked, how long's left, and Stop. */}
      {!tucked && awakeUntil && (
        <button
          type="button"
          className="desk-awake"
          title={`Keeping your screen awake · ${awakeLength(Math.ceil(awakeLeft / 60_000))} left`}
          aria-label={`Keeping your screen awake, ${awakeLength(Math.ceil(awakeLeft / 60_000))} left`}
          onClick={() =>
            say(`I'm keeping your screen awake for another ${awakeLength(Math.ceil(awakeLeft / 60_000))}.`, {
              actions: [{ label: "Stop", run: () => void stopAwake() }],
            })
          }
        >
          <Coffee size={11} strokeWidth={2.2} aria-hidden="true" />
          {awakeClock(awakeLeft)}
        </button>
      )}

      {/* Tucked: the time under him in the notch, what's on when pointed at, and the day so far. */}
      {tucked && lead && (
        <span className={`desk-tab-time is-${lead.tone}`} style={{ color: lead.color }}>
          {LeadIcon && <LeadIcon size={9} strokeWidth={2.6} aria-hidden="true" />}
          {lead.big}
        </span>
      )}
      {/* Tucked and keeping the screen awake: a coffee cup and the time left, under him in the notch. */}
      {tucked && awakeUntil && (
        <span
          className="desk-tab-time desk-tab-awake"
          role="timer"
          title={`Keeping your screen awake · ${awakeLength(Math.ceil(awakeLeft / 60_000))} left`}
          aria-label={`Keeping your screen awake, ${awakeLength(Math.ceil(awakeLeft / 60_000))} left`}
        >
          <Coffee size={9} strokeWidth={2.6} aria-hidden="true" />
          {awakeClock(awakeLeft)}
        </span>
      )}
      {peeking && (
        <span className="desk-peek">
          {views.length === 0 && <span className="desk-peek-text">{idleLine}</span>}
          {views.map((v) => (
            <span key={v.key} className={`desk-peek-item is-${v.tone}`}>
              <span className="desk-peek-text">{v.line}</span>
              {/* What's timed can be paused or finished from the peek, without opening him. */}
              {v.key === "timer" && timed?.task && !rest && (
                <span className="desk-peek-actions">
                  {timed.paused ? (
                    <button className="icon-btn" title="Resume" aria-label="Resume" onClick={() => resume(timed.task!)}>
                      <Play size={11} strokeWidth={2} />
                    </button>
                  ) : (
                    <button className="icon-btn" title="Pause" aria-label="Pause" onClick={() => pause(timed.task!)}>
                      <Pause size={11} strokeWidth={2} />
                    </button>
                  )}
                  <button className="icon-btn" title="Done" aria-label="Done" onClick={() => finish(timed.task!)}>
                    <Check size={11} strokeWidth={2} />
                  </button>
                </span>
              )}
              {v.actions.length > 0 && (
                <span className="desk-peek-actions">
                  {v.actions.map((a) => (
                    <button key={a.label} className="desk-peek-btn" onClick={a.run}>
                      {a.label}
                    </button>
                  ))}
                </span>
              )}
            </span>
          ))}
        </span>
      )}
      {/* The foot of the notch: how far through what it shows (a meeting, a
          reminder's wait). Nothing on, nothing there. */}
      {tucked && lead && lead.key !== "timer" && lead.progress !== null && (
        <span className={`desk-tab-progress is-${lead.tone}`} role="progressbar" aria-label={lead.line} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lead.progress * 100)}>
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, lead.progress)) * 100)}%` }} />
        </span>
      )}
      {tucked && views.length > 1 && (
        <span className="desk-tab-dots" aria-label={`${views.length} things on`}>
          {views.map((v) => (
            <i key={v.key} className={`is-${v.tone}`} />
          ))}
        </span>
      )}
      {out && chips.length > 0 && (
        <div className="desk-chips">
          {chips.map((v) => {
            const Icon = v.icon;
            return (
              <span key={v.key} className={`desk-chip is-${v.tone}`}>
                {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
                <span className="desk-chip-text">{v.line}</span>
                {v.actions.map((a) => (
                  <button key={a.label} className="desk-peek-btn" onClick={a.run}>
                    {a.label}
                  </button>
                ))}
              </span>
            );
          })}
        </div>
      )}

      {/* What's timed, and its buttons: shown with the mouse over him (or while paused). */}
      {out && timed && (
        <div className={`desk-controls${timed.paused ? " is-paused" : ""}`}>
          <span className="desk-controls-text">
            <span className="desk-controls-title" title={timed.title}>
              {rest ? "Break" : timed.paused ? `Paused: ${timed.title}` : timed.title}
            </span>
            {details && <span className="desk-controls-detail">{details}</span>}
          </span>
          {timed.task ? (
            <>
              {timed.paused ? (
                <button className="icon-btn" title="Resume" aria-label="Resume" onClick={() => resume(timed.task!)}>
                  <Play size={12} strokeWidth={2} />
                </button>
              ) : (
                <button className="icon-btn" title="Pause" aria-label="Pause" onClick={() => pause(timed.task!)}>
                  <Pause size={12} strokeWidth={2} />
                </button>
              )}
              <button className="icon-btn" title="Done" aria-label="Done" onClick={() => finish(timed.task!)}>
                <Check size={12} strokeWidth={2} />
              </button>
            </>
          ) : (
            <button className="icon-btn" title="Stop and log" aria-label="Stop and log" onClick={stopTimed}>
              <Square size={11} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
      {out && !timed && next && soon !== null && soon >= 0 && soon <= 10 && (
        <p className="desk-soon">
          {next.title} at {clock(next.startMinute)}
        </p>
      )}

      {out && menu && <FallbackMenu entries={entries} onClose={() => setMenu(false)} />}
    </main>
  );
}

/** A question's answer box, in the bubble. */
function Ask({ question, onAnswer }: { question: Question; onAnswer: () => void }) {
  const [value, setValue] = useState("");
  useEffect(() => void getCurrentWindow().setFocus().catch(() => {}), []);
  return (
    <form
      className="desk-ask"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer();
        if (!value.trim()) return question.skip.run();
        question.submit(value.trim());
      }}
    >
      <input
        autoFocus
        type={question.kind}
        inputMode={question.kind === "number" ? "numeric" : undefined}
        min={question.kind === "number" ? 0 : undefined}
        placeholder={question.placeholder}
        aria-label="Your answer"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <div className="desk-bubble-actions">
        <button className="btn btn-sm" type="submit">
          Save
        </button>
        <button
          className="btn btn-sm btn-ghost"
          type="button"
          onClick={() => {
            onAnswer();
            question.skip.run();
          }}
        >
          {question.skip.label}
        </button>
      </div>
    </form>
  );
}

/**
 * Sparks flying out of his halo, along the floor and up: a handful when
 * something's done, a shower (in more colours) when it's everything.
 */
function Burst({ big, scale, onDone }: { big: boolean; scale: number; onDone: () => void }) {
  const [sparks] = useState(() =>
    Array.from({ length: big ? 30 : 14 }, (_, i) => {
      const angle = (i / (big ? 30 : 14)) * Math.PI * 2 + Math.random() * 0.4;
      // Further, the bigger he is.
      const reach = (big ? 70 : 46) * scale * (0.6 + Math.random() * 0.5);
      return {
        x: Math.cos(angle) * reach,
        // Flatter across the floor, and mostly upwards.
        y: Math.sin(angle) * reach * 0.45 - (big ? 34 : 20) * scale * Math.random(),
        delay: Math.random() * (big ? 260 : 120),
        tone: big ? ["var(--lemma-glow)", "#ffd36e", "#ff8fb1", "#ffffff"][i % 4] : i % 3 ? "var(--lemma-glow)" : "#ffffff",
      };
    }),
  );
  // Once, however often he redraws meanwhile.
  const finished = useRef(onDone);
  finished.current = onDone;
  useEffect(() => {
    const done = setTimeout(() => finished.current(), big ? 1700 : 1100);
    return () => clearTimeout(done);
  }, [big]);
  return (
    <span className={`desk-burst${big ? " is-big" : ""}`} aria-hidden="true">
      {sparks.map((s, i) => (
        <i key={i} style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--tone": s.tone, animationDelay: `${s.delay}ms` } as React.CSSProperties} />
      ))}
    </span>
  );
}

/**
 * The weather where he's set to show it, in and around his halo: rain or
 * snow falling onto the floor, mist drifting, a storm's flashes, glints of
 * sun by day and twinkling stars on a clear night.
 */
function WeatherFx({ weather }: { weather: Weather }) {
  const kind = weather.kind === "clear" ? (weather.day ? "sun" : "stars") : weather.kind;
  const [bits] = useState(() =>
    Array.from({ length: kind === "rain" || kind === "storm" ? 14 : kind === "snow" ? 12 : 6 }, () => ({
      x: 12 + Math.random() * 76,
      y: Math.random() * 60,
      delay: Math.random() * 2400,
      size: 0.7 + Math.random() * 0.6,
    })),
  );
  return (
    <span className={`desk-weather is-${kind}`} title={`${Math.round(weather.temperature)}° in ${weather.place}`} aria-hidden="true">
      {kind !== "clouds" &&
        kind !== "fog" &&
        bits.map((b, i) => <i key={i} style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.delay}ms`, "--size": b.size } as React.CSSProperties} />)}
    </span>
  );
}

/** Typing to him, instead of talking: Enter sends, Escape closes. */
function TypeBox({ me, onSend }: { me: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="desk-bubble desk-type"
      onSubmit={(e) => {
        e.preventDefault();
        onSend(text);
      }}
    >
      <input autoFocus placeholder={`Ask ${me} something small…`} aria-label={`Type to ${me}`} value={text} onChange={(e) => setText(e.currentTarget.value)} />
    </form>
  );
}

/** The right-click menu, as the system draws it. */
async function popUp(entries: (MenuEntry | "-")[]) {
  const { Menu, MenuItem, PredefinedMenuItem } = await import("@tauri-apps/api/menu");
  const items = await Promise.all(
    entries.map((e) => (e === "-" ? PredefinedMenuItem.new({ item: "Separator" }) : MenuItem.new({ text: e.label, enabled: !e.disabled, action: e.run }))),
  );
  const menu = await Menu.new({ items });
  await menu.popup();
}

/** The same menu, drawn in the window, where there's no system one. */
function FallbackMenu({ entries, onClose }: { entries: (MenuEntry | "-")[]; onClose: () => void }) {
  return (
    <div className="desk-menu" role="menu">
      {entries.map((e, i) =>
        e === "-" ? (
          <hr key={i} />
        ) : (
          <button
            key={e.label}
            role="menuitem"
            disabled={e.disabled}
            onClick={() => {
              onClose();
              e.run();
            }}
          >
            {e.label}
          </button>
        ),
      )}
    </div>
  );
}
