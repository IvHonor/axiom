import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { EVERYDAY_HEADWEAR, HOLDINGS, hasFirstLight, lookColors, lookForRewards, lookForRole, useLook, type Look } from "./look";
import { useAchievementRewards } from "./achievements/useAchievementRewards";
import { useAccount } from "../../shell/useAccount";
import { useLemma, type LemmaState } from "./state";
import type { createCompanionScene, SceneState } from "./scene";
import { nameOf, usePersona, type Personality } from "./persona";
import { expressionOf, type Mood } from "./expressions";
import { useCompanionPrefs } from "./preferences";
import { hasTalked, HINT_TAPS, markTalked, TAP_WINDOW_MS, tapHint } from "./talk";
import type { IdleContext } from "./idleMotion";
import type { CompletedAction } from "./dialogue";
import { useCompassSteady } from "./useCompassSteady";
import { EverydayIllustration } from "./everydayIllustration";

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
  idleContext?: IdleContext;
  onIdleComplete?: (kind: CompletedAction) => void;
  dialogueRef?: (node: HTMLElement | null) => void;
  /** Someone else's Lemma (the Playground): its personality, name and keepsakes, not yours. */
  peer?: { personality: Personality; name: string; admin: boolean; firstLight: boolean };
}

export function Face({ mood, size = 120, level = 0, tool, alive = true, look: given, interactive = false, facing, gaze, display, quiet = false, idlePreview = 0, idleContext, onIdleComplete, dialogueRef, onTalk, peer }: FaceProps) {
  const chosen = useLook();
  const { brightness, movement } = useCompanionPrefs();
  const own = usePersona();
  const persona = peer ? { name: peer.name, personality: peer.personality } : own;
  const me = nameOf(persona);
  const context = useLemma();
  const focused = quiet || context.focused;
  const compact = size < 90;
  const [account] = useAccount();
  const admin = peer ? peer.admin : account?.state === "signed_in" && account.admin;
  const firstLight = peer ? peer.firstLight : hasFirstLight(account);
  const rewards = useAchievementRewards(!peer);
  const look = useMemo(() => {
    const permitted = lookForRole(given ?? chosen, admin, firstLight);
    return peer ? permitted : lookForRewards(permitted, rewards);
  }, [given, chosen, admin, firstLight, peer, rewards]);
  // Someone else's compass always shows settled: their day is their own business.
  const ownCompassSteady = useCompassSteady(alive && !peer && look.holding === "true-compass");
  const compassSteady = !!peer || ownCompassSteady;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createCompanionScene> | null>(null);
  const latest = useRef<SceneState>({ look, mood, level, working: !!tool, facing, gaze, display, brightness, movement, personality: persona.personality, focused, compact, admin, firstLight, compassSteady, idleContext, onIdleComplete });
  latest.current = { look, mood, level, working: !!tool, facing, gaze, display, brightness, movement, personality: persona.personality, focused, compact, admin, firstLight, compassSteady, idleContext, onIdleComplete };
  const [ready, setReady] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const timer = useRef(0);
  const drag = useRef<{ x: number; y: number; fromX: number; fromY: number; moved: boolean } | null>(null);
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
  useEffect(() => { scene.current?.update(latest.current); }, [look, mood, level, !!tool, facing?.x, facing?.y, gaze?.x, gaze?.y, display?.text, display?.color, brightness, movement, persona.personality, focused, compact, admin, firstLight, compassSteady, idleContext, onIdleComplete]);
  useEffect(() => {
    dialogueRef?.(host.current);
    return () => dialogueRef?.(null);
  }, [dialogueRef]);
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
      data-idle-context={idleContext}
      data-display={display?.text}
      data-shape={look.shape}
      data-holding={look.holding}
      data-headwear={look.accessory}
      data-neckwear={look.neckwear}
      data-facewear={look.facewear}
      data-finish={look.finish}
      data-compass-steady={look.holding === "true-compass" ? String(compassSteady) : undefined} data-glow-effect={look.glowEffect}
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
        drag.current = { x: e.clientX, y: e.clientY, fromX: e.clientX, fromY: e.clientY, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      } : undefined}
      onPointerMove={interactive ? (e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        // A hand that wobbles while clicking is still a click.
        drag.current = { ...drag.current, x: e.clientX, y: e.clientY, moved: drag.current.moved || Math.hypot(e.clientX - drag.current.fromX, e.clientY - drag.current.fromY) >= 8 };
        scene.current?.turn(dx * 0.012, dy * 0.006);
      } : undefined}
      onPointerUp={interactive ? (e) => {
        dragged.current = !!drag.current?.moved;
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
    <g fill={look.finish === "matte" ? "var(--lemma-shell)" : `url(#${id})`} opacity={look.finish === "glass" ? 0.6 : look.finish === "skeleton" || look.finish === "living-ink" || look.finish === "voyage" ? 0.42 : 1} stroke="var(--lemma-glow)" strokeWidth="1.6">
      {look.shape === "orb" ? <circle r="58" /> :
        look.shape === "prism" ? <rect x="-46" y="-54" width="92" height="108" rx="9" /> :
        look.shape === "pyramid" ? <><path d="M0 -65L62 43L3 62L-59 43Z" /><path d="M0 -65L3 62M3 62L62 43" fill="none" /></> :
        <path d="M0 -61C70 -61 63 0 25 55Q0 87 -25 55C-63 0 -70 -61 0 -61Z" />}
    </g>
    {look.finish === "skeleton" && <g fill="none" stroke="#c79a4f" strokeWidth="4"><circle cx="-13" cy="-33" r="13" strokeDasharray="4 2.5" /><circle cx="17" cy="36" r="9" strokeDasharray="3 2" /></g>}
    {look.finish === "voyage" && <g><path d="M-46 22Q-30 10 -14 22T18 22T46 18C42 44 24 54 0 55C-24 54 -42 44 -46 22Z" fill="#3a1236" /><path d="M-18 30H18L12 40H-12Z" fill="#14100f" /><path d="M0 30V10M-11 12H11L8 25H-8Z" fill="#e7dcc2" stroke="#8d2233" strokeWidth="1.5" /></g>}
    {look.finish === "living-ink" && <g><path d="M-44 -6Q-22 -14 0 -6T44 -6C46 26 28 48 0 50C-28 48 -46 26 -44 -6Z" fill="#090b12" /><circle cx="-24" cy="30" r="1.8" fill="#e8bf68" /><circle cx="22" cy="36" r="1.4" fill="#e8bf68" /><circle cx="30" cy="16" r="1.2" fill="#e8bf68" /></g>}
    <rect x="-36" y="-20" width="72" height="43" rx="21" fill="#071b26" />
    <g transform={`translate(${expression.gaze[0] * 70} ${-expression.gaze[1] * 70})`}>
      {mood === "happy" ? <path d="M-23 5Q-15 -8 -7 5M7 5Q15 -8 23 5" fill="none" stroke="var(--lemma-glow)" strokeWidth="4" strokeLinecap="round" /> :
        expression.eyes.map((height, i) => <rect key={i} x={i ? 10 : compact ? -22 : -20} y={2 - height * 7} width={compact ? 12 : 9} height={height * 14} rx="4" fill="var(--lemma-glow)" />)}
    </g>
    {expression.brows.map((tilt, i) => <path key={i} d="M-6 0Q0 -1 6 0" transform={`translate(${i ? 15 : -15} ${-expression.browY[i] * 70}) rotate(${-tilt * 180 / Math.PI})`} stroke="var(--lemma-glow)" strokeWidth="2" strokeLinecap="round" fill="none" />)}
    {expression.mouth === "round" ? <ellipse className={mood === "speaking" ? "lemma-illustration-talk" : undefined} cx="0" cy="15" rx="5" ry={mood === "speaking" ? 4 : 3} fill="none" stroke="var(--lemma-glow)" strokeWidth="2" /> :
      <path d={expression.mouth === "smile" ? "M-7 13Q0 19 7 13" : expression.mouth === "frown" ? "M-6 17Q0 11 6 17" : "M-5 15H5"} fill="none" stroke="var(--lemma-glow)" strokeWidth={compact ? 3 : 2} strokeLinecap="round" />}
    {look.accessory === "crown" && <g stroke={paint(look.headwearColor, "#ffd078")} strokeWidth="2" strokeLinejoin="round"><path d="M-30 -52L-36 -77L-18 -65L0 -85L18 -65L36 -77L30 -52Z" fill={paint(look.headwearColor, "#e9b84e")} /><path d="M-30 -55H30" /><path d="M0 -66L4 -62L0 -58L-4 -62Z" fill={paint(look.jewelColor, "#c52e58")} stroke="none" /></g>}
    <EverydayIllustration look={look} paint={paint} />
    {look.neckwear === "bow" && <path d="M0 50L-17 41V59ZM0 50L17 41V59Z" fill={paint(look.neckwearColor, "#b83f55")} />}
    {look.neckwear === "tie" && <g fill={paint(look.neckwearColor, "#7a2e3a")} stroke="#491c25" strokeWidth="1" strokeLinejoin="round"><path d="M-5 36H5L7 44L0 49L-7 44ZM-4 48H4L9 68L0 77L-9 68Z" /></g>}
    {look.accessory === "fedora" && <g fill={paint(look.headwearColor, "#35343a")} stroke="#242329" strokeWidth="1.5"><ellipse cy="-52" rx="48" ry="9" /><path d="M-31 -53L-26 -83Q-16 -90 0 -81Q16 -90 26 -83L31 -53Z" /><path d="M-29 -62Q0 -56 29 -62L31 -53Q0 -47 -31 -53Z" fill="#19191d" /></g>}
    {look.neckwear === "cog-bolo" && <g fill="none" stroke={paint(look.neckwearColor, "#a67c4b")} strokeWidth="2" strokeLinecap="round"><path d="M-24 37Q-10 44 0 52Q10 44 24 37M-3 55L-5 72M3 55L5 72" /><circle cy="52" r="6" fill="#c79a4f" stroke="#8d6a2f" strokeDasharray="2.5 1.5" /></g>}
    {look.neckwear === "counts-collar" && <g><path d="M0 47C-16 46 -32 38 -40 18C-30 28 -22 32 -15 28C-12 36 -6 41 0 42C6 41 12 36 15 28C22 32 30 28 40 18C32 38 16 46 0 47Z" fill={paint(look.neckwearColor, "#121117")} stroke="#8c0f24" strokeWidth="1.5" /><circle cy="46" r="3.5" fill="#c0122f" stroke="#d9b163" /></g>}
    {look.accessory === "deerstalker" && <g fill="#8c7a5e" stroke="#4f4331" strokeWidth="1.5"><path d="M-58 -50Q-40 -58 -30 -55L-30 -49Q-44 -46 -58 -50ZM58 -50Q40 -58 30 -55L30 -49Q44 -46 58 -50Z" /><path d="M-36 -50Q-40 -84 0 -86Q40 -84 36 -50Q0 -44 -36 -50Z" /><path d="M0 -86V-48M-18 -82Q-22 -64 -20 -48M18 -82Q22 -64 20 -48" fill="none" /></g>}
    {look.accessory === "dragon-helm" && <g fill={paint(look.headwearColor, "#dfb04a")} stroke="#8a611a" strokeWidth="1.5"><path d="M-40 -48Q-42 -84 0 -86Q42 -84 40 -48Q0 -42 -40 -48Z" /><path d="M-40 -55Q0 -49 40 -55" fill="none" /><path d="M-10 -56C-8 -74 -2 -94 14 -96C8 -88 12 -80 8 -70C6 -64 4 -60 2 -54Z" fill="#c8922f" /><circle cx="-5" cy="-60" r="1.8" fill="#ff5a12" stroke="none" /></g>}
    {look.facewear === "griffin-goggles" && <g fill="#123d70" stroke={paint(look.facewearColor, "#c79a4f")} strokeWidth="3"><circle cx="-15" cy="2" r="12" /><circle cx="15" cy="2" r="12" /><path d="M-3 0H3M-27 0H-35M27 0H35" fill="none" stroke="#3a2a20" /></g>}
    {look.facewear === "three-realms" && <g stroke="#d9ab50" strokeWidth="1.5"><path d="M-40 -12Q-20 -24 -8 -20V16Q-24 20 -40 4Z" fill="#17120f" /><path d="M-8 -20H8V16H-8Z" fill="#777a83" /><path d="M8 -20Q20 -24 40 -12V4Q24 20 8 16Z" fill="#d9ab50" /><circle cx="-18" cy="-1" r="7" fill="#071b26" /><circle cx="18" cy="-1" r="7" fill="#071b26" /></g>}
    {look.neckwear === "ribbon-bookmark" && <g fill={paint(look.neckwearColor, "#a3234a")}><path d="M-4 42H4L6 72L0 67L-6 72ZM-3 44L-16 62L-10 64L1 48Z" /><circle cy="43" r="3" fill="#e8bf68" /></g>}
    {look.accessory === "scribe-cap" && <g><path d="M-38 -50C-48 -72 -18 -84 8 -80C36 -76 50 -62 38 -50Q0 -42 -38 -50Z" fill={paint(look.headwearColor, "#3b2a58")} /><path d="M-38 -51Q0 -43 38 -51" fill="none" stroke="#e8bf68" strokeWidth="3" /><path d="M-22 -54C-34 -68 -32 -84 -22 -92C-14 -80 -14 -66 -20 -54Z" fill="#f1e8d6" /></g>}
    {look.accessory === "gearwright-hat" && <g fill={paint(look.headwearColor, "#26252b")} stroke="#17161a" strokeWidth="1.5"><ellipse cy="-52" rx="43" ry="7" /><path d="M-25 -53L-28 -92H28L25 -53Z" /><path d="M-26 -66H26L25.5 -58H-25.5Z" fill="#c79a4f" stroke="none" /><circle cy="-62" r="6" fill="#e4c47f" stroke="#8d6a2f" strokeDasharray="2.5 1.5" /></g>}
    {look.facewear === "loupe" && <g fill="none" stroke={paint(look.facewearColor, "#c79a4f")} strokeWidth="2.5"><path d="M-34 -4Q-12 -13 4 -4" stroke="#59606a" strokeWidth="1.5" /><circle cx="15" cy="2" r="14" strokeDasharray="3.5 1.8" /><circle cx="15" cy="2" r="9.5" /></g>}
    {look.facewear === "glasses" && <g fill="none" stroke={paint(look.facewearColor, "#d7e1e5")} strokeWidth="2"><circle cx="-15" cy="2" r="11" /><circle cx="15" cy="2" r="11" /><path d="M-4 1Q0 -2 4 1" /></g>}
    {look.facewear === "sunglasses" && <g stroke={paint(look.facewearColor, "#161b20")} strokeWidth="3" strokeLinejoin="round">
      <path d="M-29 -7H-4L-7 10H-25ZM4 -7H29L25 10H7Z" fill="#10241f" /><path d="M-4 -4H4M-29 -5L-34 -7M29 -5L34 -7" fill="none" />
      <path d="M-27 -4H-25M25 -4H27" stroke="#edf8f5" strokeWidth="1.5" />
    </g>}
    {look.accessory !== "none" && look.accessory !== "crown" && look.accessory !== "fedora" && look.accessory !== "gearwright-hat" && look.accessory !== "scribe-cap" && look.accessory !== "deerstalker" && look.accessory !== "dragon-helm" && !(EVERYDAY_HEADWEAR as readonly string[]).includes(look.accessory) && <g fill={paint(look.headwearColor, look.accessory === "halo" ? "#ffd078" : "#466b85")} stroke={paint(look.headwearColor, look.accessory === "halo" ? "#ffd078" : "#466b85")} strokeWidth="4">
      {look.accessory === "halo" ? <ellipse cy="-74" rx="30" ry="7" fill="none" /> : look.accessory === "headphones" ? <path d="M-63 4V-12A63 63 0 0 1 63 -12V4" fill="none" strokeWidth="9" /> : <path d="M-42 -45Q-44 -81 0 -81Q44 -81 42 -45Z" />}
    </g>}
  </svg>;
}
