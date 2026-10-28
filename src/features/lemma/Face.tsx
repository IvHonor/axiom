import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { HOLDINGS, lookColors, useLook, type Look } from "./look";
import type { LemmaState } from "./state";
import type { createCompanionScene, SceneState } from "./scene";
import { useAssistantName } from "./persona";

export type Mood = "idle" | "listening" | "thinking" | "looking" | "preparing" | "waiting" | "happy" | "concerned" | "sleepy" | "speaking";

export function moodOf(s: LemmaState, now = new Date()): Mood {
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
}

export function Face({ mood, size = 120, level = 0, tool, alive = true, look: given, interactive = false }: FaceProps) {
  const chosen = useLook();
  const me = useAssistantName();
  const look = given ?? chosen;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createCompanionScene> | null>(null);
  const latest = useRef<SceneState>({ look, mood, level, working: !!tool });
  latest.current = { look, mood, level, working: !!tool };
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
  useEffect(() => { scene.current?.update(latest.current); }, [look, mood, level, !!tool]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const greet = () => {
    scene.current?.greet();
    setGreeted(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setGreeted(false); scene.current?.update(latest.current); }, 1600);
  };
  const displayedMood = greeted && ["idle", "sleepy", "waiting", "happy"].includes(mood) ? "happy" : mood;
  const Tool = tool?.icon ?? (!ready && alive ? HOLDINGS.find((h) => h.id === look.holding)?.icon : null);
  return (
    <div
      ref={host}
      className={`lemma-face${interactive ? " is-interactive" : ""}`}
      style={{ width: size, height: size, ...lookColors(look) } as CSSProperties}
      data-mood={displayedMood}
      data-shape={look.shape}
      data-renderer={ready ? "3d" : "illustration"}
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${me}, ${displayedMood === "idle" ? "ready" : displayedMood}. Tap to say hello; drag or use arrow keys to turn.` : `${me}, ${mood === "idle" ? "ready" : mood}`}
      onClick={interactive ? () => { if (!dragged.current) greet(); } : undefined}
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
      {!ready && <Illustration look={look} mood={displayedMood} />}
      {Tool && <span className="lemma-work-badge" style={{ color: tool?.color }} aria-hidden="true"><Tool size={14} /></span>}
    </div>
  );
}

/** A readable companion still appears on devices without WebGL. */
function Illustration({ look, mood }: { look: Look; mood: Mood }) {
  const id = useId();
  return <svg className="lemma-illustration" viewBox="-100 -100 200 200" aria-hidden="true">
    <defs><radialGradient id={id} cx="30%" cy="25%"><stop stopColor="var(--lemma-glow)" stopOpacity="0.65" /><stop offset="1" stopColor="var(--lemma-shell)" /></radialGradient></defs>
    <ellipse cx="0" cy="76" rx="42" ry="7" fill="none" stroke="var(--lemma-glow)" opacity="0.35" />
    <g fill={`url(#${id})`} stroke="var(--lemma-glow)" strokeWidth="1.6">
      {look.shape === "orb" ? <><circle r="58" /><ellipse rx="65" ry="60" transform="rotate(-25)" fill="none" /></> :
        look.shape === "prism" ? <><path d="M-45 -49L27 -58L51 -39L51 45L-25 58L-45 38Z" /><path d="M27 -58V27L-25 58M27 27L51 45" fill="none" /></> :
        look.shape === "pyramid" ? <><path d="M0 -65L62 43L3 62L-59 43Z" /><path d="M0 -65L3 62M3 62L62 43" fill="none" /></> :
        <path d="M0 -61C70 -61 63 0 25 55Q0 87 -25 55C-63 0 -70 -61 0 -61Z" />}
    </g>
    <rect x="-36" y="-20" width="72" height="43" rx="21" fill="#071b26" />
    {mood === "happy" ? <path d="M-23 5Q-15 -8 -7 5M7 5Q15 -8 23 5" fill="none" stroke="var(--lemma-glow)" strokeWidth="4" strokeLinecap="round" /> :
      <g fill="var(--lemma-glow)"><rect x="-20" y="-7" width="9" height={mood === "sleepy" ? 4 : 17} rx="4" /><rect x="11" y="-7" width="9" height={mood === "sleepy" ? 4 : 17} rx="4" /></g>}
    {mood === "speaking" && <ellipse className="lemma-illustration-talk" cx="0" cy="16" rx="7" ry="3" fill="var(--lemma-glow)" />}
    {look.accessory !== "none" && <g fill="var(--lemma-glow)" stroke="var(--lemma-glow)" strokeWidth="4">
      {look.accessory === "halo" ? <ellipse cy="-74" rx="30" ry="7" fill="none" /> : look.accessory === "headphones" ? <path d="M-63 4V-12A63 63 0 0 1 63 -12V4" fill="none" strokeWidth="9" /> : look.accessory === "bow" ? <path d="M0 58L-17 49V67ZM0 58L17 49V67Z" /> : look.accessory === "crown" ? <path d="M-29 -55L-35 -76L-14 -65L0 -83L14 -65L35 -76L29 -55Z" /> : <path d="M-42 -45Q-44 -81 0 -81Q44 -81 42 -45Z" />}
    </g>}
  </svg>;
}
