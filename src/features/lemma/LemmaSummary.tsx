import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, Square, Volume2 } from "lucide-react";
import { findExtension } from "../../extensions";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { ExtensionIcon } from "../../shell/ui/ExtensionIcon";
import { speak, stopSpeaking } from "../../lib/voice";
import { plain, type Briefing, type Stat } from "./briefing";
import { Face, moodOf } from "./Face";
import { doing, toolOf } from "./parts";
import { useAssistantName } from "./persona";
import { useLemma } from "./state";
import { useBriefing } from "./useBriefing";

/** How the tile arranges Lemma and its words, from the space it measures:
 *  - pill: one row (2 high, or very narrow and short): a little face and one thing at a time
 *  - ribbon: short (3 high): face beside a greeting and one thing at a time
 *  - column: narrow, or tall and not wide: face above its speech bubble
 *  - card: medium (about 4×4): face beside the bubble
 *  - wide: short and wide: face, bubble and the day's numbers side by side
 *  - stage: big: a large face and the whole briefing, numbers underneath */
type Layout = "pill" | "ribbon" | "column" | "card" | "wide" | "stage";

function layoutOf(w: number, h: number): Layout {
  if (h < 84 || (h < 150 && w < 220)) return "pill";
  if (h < 150) return "ribbon";
  if (w < 270) return "column";
  if (w < 380) return h < 250 ? "card" : "column";
  if (h < 330) return w < 600 ? "card" : "wide";
  return w < 560 ? "column" : "stage";
}

const STAT_H = 72;
/** The talk column's actions row, and the bubble's padding, border and pager. */
const ACTIONS = 38;
const SPEECH_CHROME = 50;
const STAT_ROW = 40;
/** Space between things said, as in the CSS. */
const GAP = 8;

interface Geometry {
  face: number;
  /** How many numbers to show, and whether they go in a side list. */
  stats: number;
  statsList: boolean;
  actions: boolean;
  /** Stage only: face and bubble side by side. */
  split: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, n)));

function geometry(layout: Layout, w: number, h: number, statCount: number): Geometry {
  const none = { stats: 0, statsList: false, actions: false, split: false };
  switch (layout) {
    case "pill":
      return { ...none, face: clamp(Math.min(h, w * 0.28), 30, 60) };
    case "ribbon":
      return { ...none, face: clamp(Math.min(h, w * 0.3), 60, 132) };
    case "column": {
      // Numbers join in once there's room for them and a few lines besides.
      const stats = h >= 560 ? Math.min(statCount, Math.floor((h - 470) / (STAT_ROW + 8))) : 0;
      return { ...none, face: clamp(Math.min(w * 0.62, h * 0.3), 64, 200), actions: h >= 290, stats, statsList: true };
    }
    case "card":
      return { ...none, face: clamp(Math.min(h * 0.8, w * 0.36), 80, 210), actions: h >= 196 };
    case "wide": {
      const stats = w >= 780 ? Math.min(statCount, Math.floor((h + 8) / (STAT_ROW + 8))) : 0;
      return { ...none, face: clamp(Math.min(h * 0.86, w * 0.22), 90, 240), actions: true, stats, statsList: true };
    }
    case "stage": {
      const split = w >= 760;
      const cols = Math.max(2, Math.floor((w + 10) / 160));
      const face = split ? 0 : clamp(Math.min(w * 0.45, h * 0.3), 110, 220);
      // The numbers take the rows they can while the speech keeps room to talk.
      const talk = (rows: number) => h - (split ? 0 : face + 14) - (rows ? rows * STAT_H + (rows - 1) * 10 + 14 : 0) - ACTIONS - SPEECH_CHROME;
      let rows = Math.min(split ? 1 : 2, Math.ceil(statCount / cols));
      while (rows > 0 && talk(rows) < Math.max(130, h * 0.38)) rows--;
      const statsH = rows ? rows * STAT_H + (rows - 1) * 10 + 14 : 0;
      return { face: split ? clamp(Math.min((h - statsH) * 0.85, w * 0.3), 150, 320) : face, split, stats: Math.min(statCount, rows * cols), statsList: false, actions: true };
    }
  }
}

/** One thing said: the greeting, a line about an area, a sign-off. */
interface Said {
  id: string;
  kind: "greeting" | "intro" | "line" | "signoff" | "status";
  text: string;
  area?: string;
}

/** Small tiles say one thing at a time, cut to the rows there are. */
const oneAtATime = (layout: Layout, h: number) => layout === "pill" || layout === "ribbon" || (layout === "column" && h < 260);

function said(briefing: Briefing | null, status: string | null, single: boolean, width: number, me: string): Said[] {
  if (status) return [{ id: "status", kind: "status", text: status }];
  if (!briefing) return [{ id: "loading", kind: "status", text: "Getting your day together…" }];
  const lines: Said[] = briefing.lines.map((l) => ({ id: l.id, kind: "line", text: l.text, area: l.area }));
  const intro: Said = { id: "intro", kind: "intro", text: briefing.intro };
  // The greeting has a line of its own on the small tiles, or no room.
  if (single) return lines.length ? lines : [intro];
  // Narrow bubbles keep to the point: hello, then what matters.
  const narrow = width < 380;
  const greeting: Said = { id: "greeting", kind: "greeting", text: narrow ? briefing.greeting : `${briefing.greeting} ${me} here.` };
  if (narrow && lines.length) return [greeting, ...lines];
  return [greeting, intro, ...lines, ...(lines.length ? [{ id: "signoff", kind: "signoff" as const, text: briefing.signoff }] : [])];
}

/** Splits what's said into bubblefuls that fit `room`, given each one's height. */
function paginate(heights: number[], room: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  heights.forEach((h, i) => {
    if (page.length && used + GAP + h > room) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += (page.length ? GAP : 0) + h;
    page.push(i);
  });
  if (page.length) pages.push(page);
  return pages;
}

const samePages = (a: number[][], b: number[][]) => a.length === b.length && a.every((p, i) => p.join() === b[i].join());

// ---------- Speaking ----------

/** Bubblefuls already said this session: shown straight away, not typed again. */
const spoken = new Set<string>();
const CHARS_PER_SECOND = 46;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** How many characters of `key`'s `total` are said so far, as if spoken. */
function useTypewriter(key: string, total: number): [number, () => void] {
  const [state, setState] = useState({ key, count: 0 });
  const count = state.key === key ? state.count : spoken.has(key) || reducedMotion() ? total : 0;
  useEffect(() => {
    if (spoken.has(key) || reducedMotion() || total === 0) {
      setState({ key, count: total });
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      const n = Math.min(total, Math.floor(((performance.now() - started) / 1000) * CHARS_PER_SECOND));
      setState({ key, count: n });
      if (n >= total) {
        spoken.add(key);
        window.clearInterval(timer);
      }
    }, 33);
    return () => window.clearInterval(timer);
  }, [key, total]);
  const finish = () => {
    spoken.add(key);
    setState({ key, count: total });
  };
  return [Math.min(count, total), finish];
}

/** `text` with **bold**, the first `shown` characters said and the rest held
 *  in place (invisible), so the bubble doesn't jump as the words arrive. */
function Words({ text, shown }: { text: string; shown: number }) {
  const parts: ReactNode[] = [];
  let left = shown;
  text.split("**").forEach((part, i) => {
    const said = part.slice(0, Math.max(0, left));
    const unsaid = part.slice(said.length);
    left -= part.length;
    const Tag = i % 2 ? "strong" : "span";
    if (said) parts.push(<Tag key={`s${i}`}>{said}</Tag>);
    if (unsaid) parts.push(<Tag key={`u${i}`} className="lemma-unsaid">{unsaid}</Tag>);
  });
  return <>{parts}</>;
}

/** One thing said; a line about an area opens it. */
function Saying({ s, shown, onOpenArea }: { s: Said; shown: number; onOpenArea?: (id: string) => void }) {
  const ext = s.area ? findExtension(s.area) : undefined;
  const words = <span><Words text={s.text} shown={shown} /></span>;
  if (ext && onOpenArea) {
    return <button className="lemma-say is-line" onClick={() => onOpenArea(ext.id)} title={`Open ${ext.name}`}><ExtensionIcon ext={ext} size={14} />{words}</button>;
  }
  return <p className={`lemma-say is-${s.kind}`}>{ext && <ExtensionIcon ext={ext} size={14} />}{words}</p>;
}

// ---------- The tile ----------

/** The overview tile: Lemma talking you through the day, fitted to whatever
 *  size the tile is. Tap a line to open its area, or the face to chat. */
export function LemmaSummary({ onOpen, onOpenArea }: { onOpen: () => void; onOpenArea?: (id: string) => void }) {
  const { width, height } = useTileLayout();
  const state = useLemma();
  const me = useAssistantName();
  const briefing = useBriefing(width > 0 && height > 0);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [aloud, setAloud] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    stopSpeaking();
  }, []);

  const layout = layoutOf(width, height);
  const single = oneAtATime(layout, height);
  const g = geometry(layout, width, height, briefing?.stats.length ?? 0);
  const items = said(briefing, doing(state), single, width, me);
  const itemsKey = items.map((s) => s.text).join("\n");

  // Bubblefuls from the real heights: a hidden copy of everything is measured
  // in the bubble itself. The small tiles say one thing at a time, cut to the
  // rows the bubble has.
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([[0]]);
  const [rows, setRows] = useState({ small: 2, big: 1 });
  useLayoutEffect(() => {
    const room = box.current?.clientHeight ?? 0;
    const next = single || !probe.current
      ? items.map((_, i) => [i])
      : paginate([...probe.current.children].map((c) => (c as HTMLElement).offsetHeight), room);
    setPages((prev) => (samePages(prev, next) ? prev : next));
    setRows((prev) => {
      const next = { small: Math.max(1, Math.floor(room / 19)), big: Math.max(1, Math.floor(room / 23)) };
      return prev.small === next.small && prev.big === next.big ? prev : next;
    });
  }, [itemsKey, single, width, height, g.face, g.stats]);

  const at = Math.min(page, pages.length - 1);
  const current = (pages[at] ?? []).map((i) => items[i]).filter(Boolean);
  const key = current.map((s) => s.text).join("\n");
  const total = current.reduce((n, s) => n + plain(s.text).length, 0);
  const [shown, finish] = useTypewriter(key, total);
  const typing = shown < total;

  // A full bubble stays a while, then the next one's said.
  useEffect(() => {
    if (typing || paused || pages.length < 2) return;
    const timer = window.setTimeout(() => setPage((p) => (p + 1) % pages.length), 7000);
    return () => window.clearTimeout(timer);
  }, [typing, paused, at, pages.length]);

  if (width === 0 || height === 0) return null;

  const busy = state.activity !== "idle" || !!state.feeling || state.waiting > 0;
  const mood = !busy && (typing || aloud) ? "speaking" : moodOf(state);
  const readAloud = () => {
    if (aloud) {
      stopSpeaking();
      return setAloud(false);
    }
    setAloud(true);
    speak(said(briefing, null, false, Infinity, me).map((s) => plain(s.text)).join(" "), () => { if (mounted.current) setAloud(false); });
  };
  const aloudButton = briefing && (
    <button className="icon-btn" onClick={readAloud} title={aloud ? "Stop" : "Read it aloud"} aria-label={aloud ? "Stop reading aloud" : "Read it aloud"} aria-pressed={aloud}>
      {aloud ? <Square size={13} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={1.75} />}
    </button>
  );

  let left = shown;
  const bubble = current.map((s) => {
    const n = Math.max(0, Math.min(plain(s.text).length, left));
    left -= plain(s.text).length;
    return <Saying key={s.id} s={s} shown={n} onOpenArea={onOpenArea} />;
  });
  const go = (to: number) => setPage((to + pages.length) % pages.length);
  // Dots while they fit; a count with arrows past that.
  // Its room is kept even with nothing to page, so measuring and showing agree.
  const pager = pages.length < 2 ? <div className="lemma-brief-pager" /> : pages.length <= Math.min(8, Math.floor(width / 40)) ? (
    <div className="lemma-brief-pager" role="group" aria-label="What I'm saying">
      {pages.map((_, i) => (
        <button key={i} className={`lemma-dot${i === at ? " is-on" : ""}`} aria-label={`Part ${i + 1} of ${pages.length}`} aria-current={i === at || undefined} onClick={() => go(i)} />
      ))}
    </div>
  ) : (
    <div className="lemma-brief-pager is-count" role="group" aria-label="What I'm saying">
      {width >= 260 && <button className="icon-btn" onClick={() => go(at - 1)} aria-label="Back"><ChevronLeft size={13} /></button>}
      <span aria-live="off">{at + 1} / {pages.length}</span>
      {width >= 260 && <button className="icon-btn" onClick={() => go(at + 1)} aria-label="Next"><ChevronRight size={13} /></button>}
    </div>
  );

  const face = (
    <button className="lemma-brief-face" onClick={onOpen} title={`Talk to ${me}`} aria-label={`Open ${me}`} style={{ width: g.face, height: g.face }}>
      <Face mood={mood} size={g.face} level={state.level} tool={toolOf(state)} />
    </button>
  );
  const words = (
    <div ref={box} className="lemma-speech-words" aria-live="polite" onClick={typing ? finish : undefined}>
      {bubble}
      {!single && (
        <div ref={probe} className="lemma-speech-probe" aria-hidden="true">
          {items.map((s) => <Saying key={s.id} s={s} shown={plain(s.text).length} onOpenArea={onOpenArea} />)}
        </div>
      )}
    </div>
  );
  const speech = (
    <div className="lemma-speech" data-tail={layout === "column" || (layout === "stage" && !g.split) ? "top" : "left"}>
      {words}
      {layout !== "pill" && pager}
    </div>
  );

  return (
    <div
      className="lemma-brief"
      data-layout={layout}
      data-split={g.split || undefined}
      data-single={single || undefined}
      style={{ "--lemma-rows": rows.small, "--lemma-big-rows": rows.big } as CSSProperties}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {layout === "pill" ? (
        <>
          {face}
          {words}
          {width >= 300 && pages.length > 1 && <span className="lemma-pill-count">{at + 1}/{pages.length}</span>}
        </>
      ) : layout === "ribbon" ? (
        <>
          {face}
          <div className="lemma-ribbon-body">
            {width >= 300 && <p className="lemma-ribbon-hello">{briefing?.greeting ?? `Hi, I'm ${me}.`}</p>}
            {speech}
          </div>
          {width >= 420 && <div className="lemma-ribbon-aloud">{aloudButton}</div>}
        </>
      ) : (
        <>
          <div className="lemma-brief-hero">
            {face}
            <div className="lemma-brief-talk">
              {speech}
              {g.actions && (
                <div className="lemma-brief-actions">
                  <button className="btn btn-sm btn-ghost" onClick={onOpen}><MessageSquare size={13} strokeWidth={1.75} /> Talk to {me}</button>
                  {aloudButton}
                </div>
              )}
            </div>
          </div>
          {g.stats > 0 && briefing && <Stats stats={briefing.stats.slice(0, g.stats)} list={g.statsList} onOpenArea={onOpenArea} />}
        </>
      )}
    </div>
  );
}

/** The day's numbers, one per area: tap one to open it. */
function Stats({ stats, list, onOpenArea }: { stats: Stat[]; list: boolean; onOpenArea?: (id: string) => void }) {
  return (
    <div className={`lemma-stats${list ? " is-list" : ""}`}>
      {stats.map((s) => {
        const ext = findExtension(s.area);
        if (!ext) return null;
        return (
          <button key={s.area} className="lemma-stat" onClick={() => onOpenArea?.(s.area)} title={`Open ${ext.name}`} disabled={!onOpenArea}>
            <ExtensionIcon ext={ext} size={14} />
            <span className="lemma-stat-label">{s.label}</span>
            <strong>{s.value}</strong>
          </button>
        );
      })}
    </div>
  );
}
