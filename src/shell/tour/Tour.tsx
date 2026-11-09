// Lemma's tour of Axiom: a few steps, each pointing at the real thing on
// screen. Scripted, not the AI: it's the same for everyone, costs nothing,
// and works without an account or a connection. One step asks the person
// to switch an area on themselves, because doing it once teaches it.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ExtensionManifest } from "../../extensions/types";
import { EXTENSIONS } from "../../extensions";
import { Face } from "../../features/lemma/Face";
import type { Mood } from "../../features/lemma/expressions";
import { useAreaName, useAssistantName } from "../../features/lemma/persona";
import type { SidePanel } from "../ActivityBar";
import { useAccount } from "../useAccount";
import { endTour } from "./tourState";
import "./tour.css";

type StepId = "welcome" | "overview" | "areas" | "extensions" | "switch" | "added" | "lemma";

/** Where each step sits in the count the person sees ("2 of 5"). */
const NUMBER: Record<StepId, number> = { welcome: 1, overview: 2, areas: 3, extensions: 4, switch: 4, added: 4, lemma: 5 };
const STEPS = 5;

interface Step {
  /** What to point at: elements marked `data-tour` (the spotlight goes round all that match). */
  target?: string;
  title: string;
  body: string;
  mood: Mood;
  /** The main button. Without one, the step waits for the person to do what it asks. */
  next?: string;
  /** A way past a step that waits, e.g. "Later". */
  skip?: { label: string; to: StepId };
}

interface TourProps {
  /** The areas switched on now. */
  areas: ExtensionManifest[];
  /** The sidebar panel showing. */
  panel: SidePanel | null;
  /** Shows the overview (for the step about it). */
  onShowOverview: () => void;
}

export function Tour({ areas, panel, onShowOverview }: TourProps) {
  const me = useAssistantName();
  const nameOf = useAreaName();
  const [account] = useAccount();
  const [at, setAt] = useState<StepId>("welcome");
  /** The areas on when the person was asked to switch one on, and the one they picked. */
  const before = useRef<string[]>([]);
  const [added, setAdded] = useState<ExtensionManifest | null>(null);

  const onIds = areas.map((a) => a.id);
  const starting = areas.filter((a) => a.id !== "lemma");
  const off = EXTENSIONS.filter((ext) => ext.area?.View && !onIds.includes(ext.id));
  const signedIn = account?.state === "signed_in";

  const steps: Record<StepId, Step> = {
    welcome: {
      title: `Hi, I'm ${me}`,
      body: "Welcome to Axiom. Let me show you around. It takes about a minute.",
      mood: "happy",
      next: "Show me around",
    },
    overview: {
      target: '[data-tour="main"]',
      title: "This is your overview",
      body: "Each area you use puts a tile here, so your day is there at a glance. Drag the tiles to arrange them however you like.",
      mood: "encouraging",
      next: "Next",
    },
    areas: {
      target: starting.map((a) => `[data-tour="area:${a.id}"]`).join(", ") || undefined,
      // A first run has a few; a replay may have the lot.
      title: !starting.length ? "Your areas live here" : starting.length <= 3 ? `You're starting with ${list(starting.map(nameOf))}` : "These are your areas",
      body: "Open an area from here. Each one has a sidebar of its own.",
      mood: "encouraging",
      next: "Next",
    },
    extensions: off.length
      ? {
          target: '[data-tour="extensions"]',
          title: "There's more when you want it",
          body: `${list(off.length > 4 ? [...off.slice(0, 4).map(nameOf), "more"] : off.map(nameOf))} ${off.length === 1 ? "is" : "are"} built in, just switched off so ${off.length === 1 ? "it doesn't" : "they don't"} crowd you. Open Extensions to have a look.`,
          mood: "looking",
          skip: { label: "Later", to: "lemma" },
        }
      : {
          target: '[data-tour="extensions"]',
          title: "Extensions",
          body: "This is where you switch areas on and off.",
          mood: "looking",
          next: "Next",
        },
    switch: {
      target: '[data-tour="extensions-panel"]',
      title: "Pick one to try",
      body: "Switch on anything that looks useful. You can switch it off again whenever you like.",
      mood: "encouraging",
      skip: { label: "Later", to: "lemma" },
    },
    added: {
      target: added ? `[data-tour="area:${added.id}"]` : undefined,
      title: added ? `${nameOf(added)} is ready` : "Ready",
      body: "It's in your bar now. Come back to Extensions whenever you want more.",
      mood: "happy",
      next: "Next",
    },
    lemma: {
      target: onIds.includes("lemma") ? '[data-tour="area:lemma"]' : undefined,
      title: "And I'm always here",
      body: `Ask me to plan your day, or anything about your areas. I only see the areas you let me, and I check with you before I change anything.${
        signedIn ? "" : " To chat with me, you'll need a free account. Everything else works without one."
      }`,
      mood: "happy",
      next: "Done",
    },
  };
  const step = steps[at];

  const go = (next: StepId) => {
    if (next === "overview") onShowOverview();
    if (next === "switch") before.current = onIds;
    setAt(next);
  };
  const order: StepId[] = ["welcome", "overview", "areas", "extensions", "switch", "added", "lemma"];
  const advance = () => {
    if (at === "lemma") return endTour();
    if (at === "extensions" && !off.length) return go("lemma");
    go(order[order.indexOf(at) + 1]);
  };

  // The steps that wait move on when the person does what was asked.
  const onKey = onIds.join();
  useEffect(() => {
    if (at === "extensions" && off.length && panel === "extensions") go("switch");
    if (at === "switch") {
      if (panel !== "extensions") return go("extensions");
      const fresh = areas.find((a) => !before.current.includes(a.id));
      if (fresh) {
        setAdded(fresh);
        go("added");
      }
    }
    // `go` and `areas` are read fresh each render; what's on and the panel are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, panel, onKey]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && endTour();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hole = useTargetRect(step.target);
  const card = useRef<HTMLElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const next = place(hole, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight);
    setSpot((was) => (was && was.left === next.left && was.top === next.top ? was : next));
  });

  const waits = !step.next;
  const holeStyle: CSSProperties | undefined = hole
    ? { left: hole.left - PAD, top: hole.top - PAD, width: hole.width + PAD * 2, height: hole.height + PAD * 2 }
    : undefined;

  return createPortal(
    <div className={`tour${waits ? " is-waiting" : ""}`}>
      {/* Steps that only talk keep clicks off the app; steps that wait let them through. */}
      {!waits && <div className="tour-block" />}
      {hole ? <div className="tour-hole" style={holeStyle} /> : <div className="tour-scrim" />}
      <section
        ref={card}
        className="tour-card"
        role="dialog"
        aria-live="polite"
        aria-label={step.title}
        style={spot ? { left: spot.left, top: spot.top } : { visibility: "hidden" }}
      >
        <div className="tour-face">
          <Face mood={step.mood} size={56} />
        </div>
        <div className="tour-text">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          <div className="tour-actions">
            <span className="tour-count">
              {NUMBER[at]} of {STEPS}
            </span>
            {at === "welcome" && (
              <button className="btn btn-sm btn-ghost" onClick={endTour}>
                Skip
              </button>
            )}
            {step.skip && (
              <button className="btn btn-sm btn-ghost" onClick={() => go(step.skip!.to)}>
                {step.skip.label}
              </button>
            )}
            {step.next && (
              <button className="btn btn-sm" onClick={advance} autoFocus>
                {step.next}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Room round the thing pointed at, inside the spotlight. */
const PAD = 6;

/** "A, B and C". */
function list(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the elements matching `selector` are on screen, all together; null if none show. Follows them as they move. */
function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!selector) return setRect(null);
    const measure = () => {
      const boxes = [...document.querySelectorAll(selector)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth);
      if (!boxes.length) return setRect(null);
      const left = Math.max(0, Math.min(...boxes.map((r) => r.left)));
      const top = Math.max(0, Math.min(...boxes.map((r) => r.top)));
      const right = Math.min(window.innerWidth, Math.max(...boxes.map((r) => r.right)));
      const bottom = Math.min(window.innerHeight, Math.max(...boxes.map((r) => r.bottom)));
      const next = { left, top, width: right - left, height: bottom - top };
      setRect((was) =>
        was && was.left === next.left && was.top === next.top && was.width === next.width && was.height === next.height ? was : next,
      );
    };
    measure();
    // Sidebars slide and windows resize: keep up.
    const timer = window.setInterval(measure, 150);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [selector]);
  return rect;
}

/** Where the card goes: beside what's pointed at, wherever there's room; in the middle if nowhere, or nothing's pointed at. */
export function place(target: Rect | null, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  const margin = 12;
  const gap = 14 + PAD;
  const clampX = (x: number) => Math.round(Math.min(Math.max(x, margin), vw - w - margin));
  const clampY = (y: number) => Math.round(Math.min(Math.max(y, margin), vh - h - margin));
  const middle = { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };
  if (!target) return middle;
  const t = { ...target, right: target.left + target.width, bottom: target.top + target.height };
  // Something that fills most of the window (the overview): the card sits in it, towards the bottom.
  if (target.width * target.height > vw * vh * 0.4) return { left: clampX(t.left + (target.width - w) / 2), top: clampY(t.bottom - h - 32) };
  const midY = t.top + target.height / 2 - h / 2;
  const midX = t.left + target.width / 2 - w / 2;
  if (t.right + gap + w + margin <= vw) return { left: Math.round(t.right + gap), top: clampY(midY) };
  if (t.top - gap - h >= margin) return { left: clampX(midX), top: Math.round(t.top - gap - h) };
  if (t.bottom + gap + h + margin <= vh) return { left: clampX(midX), top: Math.round(t.bottom + gap) };
  if (t.left - gap - w >= margin) return { left: Math.round(t.left - gap - w), top: clampY(midY) };
  return middle;
}
