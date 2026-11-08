// Where the companion sits, and moving it: dragged with the pointer (or
// touch), or nudged with the arrow keys. It stays inside the room between
// the top bar and the status bar; where it ends up is saved as shares of
// that room (preferences.ts `spot`), so the place carries over to other
// window sizes and, through the profile, to your other devices.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { setCompanionPrefs, type CompanionPrefs, type Spot } from "./preferences";

/** Further than this, a press is a move rather than a click. */
const MOVE_PX = 4;
const SIDE = 18;
const GAP = 6;

interface Room { left: number; top: number; right: number; bottom: number }

/** The space the companion may use: clear of the top bar and the status bar (and a phone's bottom bar, which sits below it). */
function room(): Room {
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 48;
  // A phone's bottom bar (the activity bar along the bottom); on a desktop it's down the side.
  const nav = document.querySelector(".activitybar")?.getBoundingClientRect();
  const bottomBar = nav && nav.top > window.innerHeight / 2 ? nav.top : window.innerHeight;
  const status = document.querySelector(".statusbar")?.getBoundingClientRect().top ?? bottomBar;
  const bottom = Math.min(status, bottomBar);
  return { left: SIDE, top: top + GAP, right: window.innerWidth - SIDE, bottom: bottom - 12 };
}

function place(prefs: CompanionPrefs, w: number, h: number, r = room()) {
  const spanX = Math.max(0, r.right - r.left - w), spanY = Math.max(0, r.bottom - r.top - h);
  const share = prefs.spot ?? { x: prefs.corner.endsWith("left") ? 0 : 1, y: prefs.corner.startsWith("top") ? 0 : 1 };
  return { x: r.left + share.x * spanX, y: r.top + share.y * spanY };
}

function spotOf(x: number, y: number, w: number, h: number, r = room()): Spot {
  const spanX = Math.max(1, r.right - r.left - w), spanY = Math.max(1, r.bottom - r.top - h);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { x: clamp((x - r.left) / spanX), y: clamp((y - r.top) / spanY) };
}

/** `onTap`: a finger tap that wasn't a drag (phones may send no click after one). */
export function useCompanionPlace<T extends HTMLElement>(prefs: CompanionPrefs, onTap?: () => void) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [, relayout] = useState(0);
  /** While dragging: where it is now, before it's saved. */
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const justMoved = useRef(false);
  /** A tap answered on lift: the click that may follow is the same tap. */
  const tappedAt = useRef(0);

  // Measure it (its size changes with the companion's size and when it's minimised).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((old) => (old && old.w === el.offsetWidth && old.h === el.offsetHeight ? old : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // A resized window moves it with the room, keeping its share of it.
  useEffect(() => {
    const again = () => relayout((n) => n + 1);
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, []);

  const at = dragAt ?? (box ? place(prefs, box.w, box.h) : null);
  const style: CSSProperties = at
    ? { left: at.x, top: at.y, right: "auto", bottom: "auto" }
    : { visibility: "hidden", right: 18, bottom: 38 };

  const save = useCallback((x: number, y: number) => {
    const el = ref.current;
    if (el) setCompanionPrefs({ spot: spotOf(x, y, el.offsetWidth, el.offsetHeight) });
  }, []);

  const clampToRoom = (x: number, y: number) => {
    const el = ref.current!, r = room();
    return { x: Math.max(r.left, Math.min(r.right - el.offsetWidth, x)), y: Math.max(r.top, Math.min(r.bottom - el.offsetHeight, y)) };
  };

  /** Pointer handlers for whatever it's moved by (the pill, or the card's frame). */
  const handle = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || !ref.current) return;
      // A touch drag ends without a click; this press's click is its own.
      justMoved.current = false;
      const rect = ref.current.getBoundingClientRect();
      press.current = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, startX: e.clientX, startY: e.clientY, moved: false };
      // From the first move on, however fast the pointer leaves it.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (!p.moved) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < MOVE_PX) return;
        p.moved = true;
      }
      e.preventDefault();
      setDragAt(clampToRoom(e.clientX - p.dx, e.clientY - p.dy));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      press.current = null;
      if (p && !p.moved && e.pointerType !== "mouse" && onTap) {
        tappedAt.current = Date.now();
        onTap();
      }
      if (!p?.moved) return;
      const end = clampToRoom(e.clientX - p.dx, e.clientY - p.dy);
      justMoved.current = true;
      setDragAt(null);
      save(end.x, end.y);
    },
    onPointerCancel() {
      press.current = null;
      setDragAt(null);
    },
    /** A press that moved it isn't also a click. */
    onClickCapture(e: MouseEvent) {
      if (!justMoved.current && Date.now() - tappedAt.current > 800) return;
      justMoved.current = false;
      tappedAt.current = 0;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  /** Arrow keys move it (Shift for bigger steps); true when the key was used. */
  const onArrow = (e: KeyboardEvent): boolean => {
    const step = e.shiftKey ? 48 : 12;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || !ref.current || !at) return false;
    e.preventDefault();
    const next = clampToRoom(at.x + d[0], at.y + d[1]);
    save(next.x, next.y);
    return true;
  };

  return { ref, style, handle, onArrow, dragging: !!dragAt };
}
