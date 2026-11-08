import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { HOLDINGS, lookColors, lookForRole, useLook, type Look } from "./look";
import { useAccount } from "../../shell/useAccount";
import { useLemma, type LemmaState } from "./state";
import type { createCompanionScene, SceneState } from "./scene";
import { nameOf, usePersona, type Personality } from "./persona";
import { expressionOf, type Mood } from "./expressions";
import { useCompanionPrefs } from "./preferences";
import { hasTalked, HINT_TAPS, markTalked, TAP_WINDOW_MS, tapHint } from "./talk";

export type { Mood } from "./expressions";

export function moodOf(s: LemmaState, now = new Date()): Mood {
  if (s.feeling === "acknowledged" && s.activity !== "listening" && s.activity !== "speaking") return "acknowledged";
  if (s.slow && ["thinking", "looking", "preparing"].includes(s.activity)) return "patient";
  if (s.activity !== "idle") return s.activity;
  if (s.feeling) return s.feeling;
  if (s.waiting > 0) return "waiting";
  const hour = now.getHours();
  return hour >= 23 || hour < 5 ? "sleepy" : "idle";
}

interface FaceProps {
  mood: Mood;
  size?: number;
  level?: number;
  tool?: { icon: LucideIcon; color?: string } | null;
  /** Small identity marks use a static illustration, without a WebGL context. */
  alive?: boolean;
  look?: Look;
  /** Tap to greet; drag or use arrow keys to inspect the 3D body. */
  interactive?: boolean;
  /** Which way he turns (see `SceneState`): on the desktop, towards the middle of the screen. */
  facing?: { x: number; y: number };
  /** Where his eyes go (the cursor, anywhere on the screen); left out, they follow the mouse over him. */
  gaze?: { x: number; y: number } | null;
  /** Words in his face socket in place of his face (a timer counting). */
  display?: { text: string; color?: string } | null;
  quiet?: boolean;
  /** Double-clicked: talk to him. With it, tapping him instead gets a hint on how. */
  onTalk?: () => void;
  idlePreview?: number;
}

export function Face({ mood, size = 120, level = 0, tool, alive = true, look: given, interactive = false, facing, gaze, display, quiet = false, idlePreview = 0, onTalk }: FaceProps) {
  const chosen = useLook();
  const { brightness, movement } = useCompanionPrefs();
  const persona = usePersona();
  const me = nameOf(persona);
  const context = useLemma();
  const focused = quiet || context.focused;
  const compact = size < 90;
  const [account] = useAccount();
  const admin = account?.state === "signed_in" && account.admin;
  const look = useMemo(() => lookForRole(given ?? chosen, admin), [given, chosen, admin]);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createCompanionScene> | null>(null);
  const latest = useRef<SceneState>({ look, mood, level, working: !!tool, facing, gaze, display, brightness, movement, personality: persona.personality, focused, compact, admin });
  latest.current = { look, mood, level, working: !!tool, facing, gaze, display, brightness, movement, personality: persona.personality, focused, compact, admin };
  const [ready, setReady] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const timer = useRef(0);
  const drag = useRef<{ x: number; y: number; distance: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    setReady(false);
    if (!alive) return;
    let cancelled = false;
    // The renderer and Three.js only load when a live companion is on screen.
    void import("./scene").then(({ createCompanionScene }) => {
      if (cancelled || !host.current) return;
      scene.current = createCompanionScene(host.current, latest.current, setReady);
    }).catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [alive]);
  useEffect(() => { scene.current?.update(latest.current); }, [look, mood, level, !!tool, facing?.x, facing?.y, gaze?.x, gaze?.y, display?.text, display?.color, brightness, movement, persona.personality, focused, compact, admin]);
  const previewed = useRef(0);
  useEffect(() => {
    if (ready && idlePreview > 0 && previewed.current !== idlePreview) { previewed.current = idlePreview; scene.current?.previewIdle(); }
  }, [idlePreview, ready]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const greet = () => {
    scene.current?.greet();
    setGreeted(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setGreeted(false); scene.current?.update(latest.current); }, 1600);
  };
  // Tapped (not double-clicked) when he can be talked to: after a couple of
  // taps, or the first if they've never talked to him, he says how, his way.
  // A double-click's own two clicks don't count: the hint waits to be sure.
  const [hint, setHint] = useState<string | null>(null);
  const taps = useRef({ count: 0, last: 0 });
  const hintTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);
  useEffect(() => {
    if (!hint) return;
    const gone = window.setTimeout(() => setHint(null), 4000);
    return () => window.clearTimeout(gone);
  }, [hint]);
  const tapped = () => {
    if (!onTalk) return;
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => {
      const now = Date.now();
      const t = taps.current;
      t.count = now - t.last < TAP_WINDOW_MS ? t.count + 1 : 1;
      t.last = now;
      if (t.count >= HINT_TAPS || !hasTalked()) setHint(tapHint(persona.personality));
    }, 350);
  };
  const talk = () => {
    window.clearTimeout(hintTimer.current);
    taps.current.count = 0;
    setHint(null);
    markTalked();
    onTalk?.();
  };
  const displayedMood = greeted && ["idle", "sleepy", "waiting", "happy"].includes(mood) ? "happy" : mood;
  const Tool = tool?.icon ?? (!ready && size >= 50 ? HOLDINGS.find((h) => h.id === look.holding)?.icon : null);
  return (
    <div
      ref={host}
      className={`lemma-face${interactive ? " is-interactive" : ""}`}
      style={{ width: size, height: size, ...lookColors(look) } as CSSProperties}
      data-mood={displayedMood}
      data-personality={persona.personality}
      data-quiet={focused || undefined}
      data-display={display?.text}
      data-shape={look.shape}
      data-holding={look.holding}
      data-renderer={ready ? "3d" : "illustration"}
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${me}, ${displayedMood === "idle" ? "ready" : displayedMood}. Tap to say hello${onTalk ? ", double-click to talk" : ""}; drag or use arrow keys to turn.` : `${me}, ${mood === "idle" ? "ready" : mood}`}
      onClick={interactive ? () => { if (!dragged.current) { greet(); tapped(); } } : undefined}
      onDoubleClick={interactive && onTalk ? () => { if (!dragged.current) talk(); } : undefined}
      onKeyDown={interactive ? (e) => {
        if (["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          if (e.key === "Enter" || e.key === " ") greet();
          else scene.current?.turn(e.key === "ArrowLeft" ? -0.3 : e.key === "ArrowRight" ? 0.3 : 0, e.key === "ArrowUp" ? -0.1 : e.key === "ArrowDown" ? 0.1 : 0);
        }
      } : undefined}
      onPointerDown={interactive ? (e) => {
        if (e.button !== 0) return;
        dragged.current = false;
        drag.current = { x: e.clientX, y: e.clientY, distance: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
      } : undefined}
      onPointerMove={interactive ? (e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY, distance: drag.current.distance + Math.abs(dx) + Math.abs(dy) };
        scene.current?.turn(dx * 0.012, dy * 0.006);
      } : undefined}
      onPointerUp={interactive ? (e) => {
        dragged.current = !!drag.current && drag.current.distance >= 5;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      } : undefined}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <span className="lemma-color-probe" data-glow style={{ color: "var(--lemma-glow)" }} />
      <span className="lemma-color-probe" data-shell style={{ color: "var(--lemma-shell)" }} />
      {!ready && <Illustration look={look} mood={displayedMood} personality={persona.personality} compact={compact} />}
      {!ready && display && <span className="lemma-display" style={{ color: display.color }} aria-hidden="true">{display.text}</span>}
      {Tool && <span className="lemma-work-badge" style={{ color: tool?.color }} aria-hidden="true"><Tool size={14} /></span>}
      {hint && <span className="lemma-face-hint" role="status">{hint}</span>}
    </div>
  );
}

/** A readable companion still appears on devices without WebGL. */
function Illustration({ look, mood, personality, compact }: { look: Look; mood: Mood; personality: Personality; compact: boolean }) {
  const id = useId();
  const expression = expressionOf(mood, personality, compact);
  const paint = (value: string, fallback: string) => value === "theme" ? "var(--lemma-glow)" : /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  return <svg className="lemma-illustration" viewBox="-100 -100 200 200" aria-hidden="true">
    <defs><radialGradient id={id} cx="30%" cy="25%"><stop stopColor="var(--lemma-glow)" stopOpacity="0.65" /><stop offset="1" stopColor="var(--lemma-shell)" /></radialGradient></defs>
    <ellipse cx="0" cy="76" rx="42" ry="7" fill="none" stroke="var(--lemma-glow)" opacity="0.35" />
    <g fill={look.finish === "matte" ? "var(--lemma-shell)" : `url(#${id})`} opacity={look.finish === "glass" ? 0.6 : 1} stroke="var(--lemma-glow)" strokeWidth="1.6">
      {look.shape === "orb" ? <circle r="58" /> :
        look.shape === "prism" ? <>["cap", "beanie", "crown"].includes(look.accessory) ? <path d="M-46 -40Q-46 -54 -30 -54H30Q46 -54 46 -40V45Q46 54 37 54H-37Q-46 54 -46 45Z" /> : <rect x="-46" y="-54" width="92" height="108" rx="9" /></> :
        look.shape === "pyramid" ? <><path d="M0 -65L62 43L3 62L-59 43Z" /><path d="M0 -65L3 62M3 62L62 43" fill="none" /></> :
        <path d="M0 -61C70 -61 63 0 25 55Q0 87 -25 55C-63 0 -70 -61 0 -61Z" />}
    </g>
    <rect x="-36" y="-20" width="72" height="43" rx="21" fill="#071b26" />
    <g transform={`translate(${expression.gaze[0] * 70} ${-expression.gaze[1] * 70})`}>
      {mood === "happy" ? <path d="M-23 5Q-15 -8 -7 5M7 5Q15 -8 23 5" fill="none" stroke="var(--lemma-glow)" strokeWidth="4" strokeLinecap="round" /> :
        expression.eyes.map((height, i) => <rect key={i} x={i ? 10 : compact ? -22 : -20} y={2 - height * 7} width={compact ? 12 : 9} height={height * 14} rx="4" fill="var(--lemma-glow)" />)}
    </g>
    {expression.brows.map((tilt, i) => <path key={i} d="M-6 0Q0 -1 6 0" transform={`translate(${i ? 15 : -15} ${-expression.browY[i] * 70}) rotate(${-tilt * 180 / Math.PI})`} stroke="var(--lemma-glow)" strokeWidth="2" strokeLinecap="round" fill="none" />)}
    {expression.mouth === "round" ? <ellipse className={mood === "speaking" ? "lemma-illustration-talk" : undefined} cx="0" cy="15" rx="5" ry={mood === "speaking" ? 4 : 3} fill="none" stroke="var(--lemma-glow)" strokeWidth="2" /> :
      <path d={expression.mouth === "smile" ? "M-7 13Q0 19 7 13" : expression.mouth === "frown" ? "M-6 17Q0 11 6 17" : "M-5 15H5"} fill="none" stroke="var(--lemma-glow)" strokeWidth={compact ? 3 : 2} strokeLinecap="round" />}
    {look.accessory === "crown" && <g stroke={paint(look.headwearColor, "#ffd078")} strokeWidth="2" strokeLinejoin="round"><path d="M-30 -52L-36 -77L-18 -65L0 -85L18 -65L36 -77L30 -52Z" fill={paint(look.headwearColor, "#e9b84e")} /><path d="M-30 -55H30" /><path d="M0 -66L4 -62L0 -58L-4 -62Z" fill={paint(look.jewelColor, "#c52e58")} stroke="none" /></g>}
    {look.neckwear === "bow" && <path d="M0 50L-17 41V59ZM0 50L17 41V59Z" fill={paint(look.neckwearColor, "#b83f55")} />}
    {look.facewear === "glasses" && <g fill="none" stroke={paint(look.facewearColor, "#d7e1e5")} strokeWidth="2"><circle cx="-15" cy="2" r="11" /><circle cx="15" cy="2" r="11" /><path d="M-4 1Q0 -2 4 1" /></g>}
    {look.facewear === "sunglasses" && <g stroke={paint(look.facewearColor, "#161b20")} strokeWidth="3" strokeLinejoin="round">
      <path d="M-29 -7H-4L-7 10H-25ZM4 -7H29L25 10H7Z" fill="#10241f" /><path d="M-4 -4H4M-29 -5L-34 -7M29 -5L34 -7" fill="none" />
      <path d="M-27 -4H-25M25 -4H27" stroke="#edf8f5" strokeWidth="1.5" />
    </g>}
    {look.accessory !== "none" && look.accessory !== "crown" && <g fill={paint(look.headwearColor, look.accessory === "halo" ? "#ffd078" : "#466b85")} stroke={paint(look.headwearColor, look.accessory === "halo" ? "#ffd078" : "#466b85")} strokeWidth="4">
      {look.accessory === "halo" ? <ellipse cy="-74" rx="30" ry="7" fill="none" /> : look.accessory === "headphones" ? <path d="M-63 4V-12A63 63 0 0 1 63 -12V4" fill="none" strokeWidth="9" /> : <path d="M-42 -45Q-44 -81 0 -81Q44 -81 42 -45Z" />}
    </g>}
  </svg>;
}
