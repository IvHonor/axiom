import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePersistentState } from "../../shell/usePersistentState";
import { nameOf, type NoteCard } from "./api";
import { StickyNote } from "./StickyNote";

interface Position { x: number; y: number; z: number }
type Layout = Record<string, Position>;
const WIDTH = 240, HEIGHT = 240, GAP = 28, MARGIN = 16, LIMIT = 50000;
const clamp = (value: number) => Math.max(MARGIN, Math.min(LIMIT, value));
const steps: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

function readLayout(value: unknown): Layout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, p]) =>
    p && typeof p === "object" && [p.x, p.y, p.z].every((n) => typeof n === "number" && Number.isFinite(n))
      ? [[id, { x: clamp(p.x), y: clamp(p.y), z: Math.max(0, Math.min(1000000, p.z)) }]] : []));
}

interface Drag {
  id: string; pointer: number; target: HTMLDivElement; origin: Position;
  startX: number; startY: number; x: number; y: number;
  scrollX: number; scrollY: number; frame: number; active: boolean;
  position: Position;
}

/** Free positions belong to this board; overview tiles keep their own layout. */
export function StickyCanvas({ notes, autofocusId, onOpen }: {
  notes: NoteCard[]; autofocusId: string | null; onOpen: (id: string) => void;
}) {
  const [saved, setSaved] = usePersistentState("axiom.notes.board.v1", readLayout);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; position: Position } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [width, setWidth] = useState(0);
  const layout = { ...saved };
  const columns = Math.max(1, Math.floor((width - MARGIN * 2 + GAP) / (WIDTH + GAP)));
  let nextZ = Math.max(0, ...Object.values(saved).map((p) => p.z));
  for (const note of notes) {
    if (layout[note.id]) continue;
    let slot = 0;
    let x = MARGIN, y = MARGIN;
    // Only new notes find an empty place. Moving a note never displaces another.
    while (Object.values(layout).some((p) => Math.abs(p.x - x) < WIDTH + GAP && Math.abs(p.y - y) < HEIGHT + GAP)) {
      slot++;
      x = MARGIN + (slot % columns) * (WIDTH + GAP);
      y = MARGIN + Math.floor(slot / columns) * (HEIGHT + GAP);
    }
    layout[note.id] = { x, y, z: ++nextZ };
  }
  const missing = notes.filter((note) => !saved[note.id]);
  useEffect(() => {
    if (width && missing.length) setSaved((previous) => ({ ...layout, ...previous }));
  });
  useEffect(() => {
    const node = viewport.current!;
    const measure = new ResizeObserver(() => setWidth(node.clientWidth));
    measure.observe(node);
    return () => measure.disconnect();
  }, []);

  const front = (id: string) => setSaved((previous) => {
    const highest = Math.max(0, ...Object.values(previous).map((p) => p.z));
    const position = previous[id] ?? layout[id];
    return position.z === highest ? previous : { ...previous, [id]: { ...position, z: highest + 1 } };
  });

  const finish = (cancelled: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    if (current.target.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer);
    setPreview(null);
    if (cancelled) {
      viewport.current?.scrollTo(current.scrollX, current.scrollY);
      setAnnouncement("Move cancelled");
    } else if (current.active) {
      setSaved((previous) => ({ ...previous, [current.id]: { ...current.position, z: previous[current.id]?.z ?? current.position.z } }));
      setAnnouncement("Sticky note moved");
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const cancel = () => finishRef.current(true);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); cancel(); }
    };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", visibility);
      if (drag.current) cancelAnimationFrame(drag.current.frame);
    };
  }, []);
  useEffect(() => {
    if (drag.current && !notes.some((note) => note.id === drag.current!.id)) finishRef.current(true);
  }, [notes]);

  const update = () => {
    const current = drag.current, node = viewport.current;
    if (!current || !node) return;
    if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) < 4) return;
    current.active = true;
    current.position = { ...current.origin,
      x: clamp(current.origin.x + current.x - current.startX + node.scrollLeft - current.scrollX),
      y: clamp(current.origin.y + current.y - current.startY + node.scrollTop - current.scrollY),
    };
    setPreview((previous) => previous?.id === current.id && previous.position.x === current.position.x && previous.position.y === current.position.y
      ? previous : { id: current.id, position: current.position });
  };
  const tick = () => {
    const current = drag.current, node = viewport.current;
    if (!current || !node) return;
    if (current.active) {
      const rect = node.getBoundingClientRect();
      const speed = (point: number, min: number, max: number) => point < min + 40
        ? -Math.min(12, (min + 40 - point) / 4) : point > max - 40 ? Math.min(12, (point - max + 40) / 4) : 0;
      node.scrollBy(speed(current.x, rect.left, rect.right), speed(current.y, rect.top, rect.bottom));
    }
    update();
    current.frame = requestAnimationFrame(tick);
  };
  const start = (event: PointerEvent<HTMLDivElement>, id: string) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || !event.isPrimary || drag.current || !target.closest(".sticky-band")) return;
    if (target.closest("button") && !target.closest(".nt-board-move")) return;
    const node = viewport.current!;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLButtonElement>(".nt-board-move")?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointer: event.pointerId, target: event.currentTarget, origin: layout[id], position: layout[id],
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      scrollX: node.scrollLeft, scrollY: node.scrollTop, frame: requestAnimationFrame(tick), active: false };
  };

  const positions = notes.map((note) => preview?.id === note.id ? preview.position : layout[note.id]);
  const canvasWidth = Math.max(width, ...positions.map((p) => p.x + WIDTH + MARGIN));
  const canvasHeight = Math.max(400, ...positions.map((p) => p.y + HEIGHT + 100));
  return <div className="nt-board" ref={viewport} role="region" aria-label="Sticky note board">
    <div className="nt-board-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
      {notes.map((note) => {
        const position = preview?.id === note.id ? preview.position : layout[note.id];
        return <div key={note.id} data-note-id={note.id} className={`nt-board-slot${preview?.id === note.id ? " is-moving" : ""}`}
          style={{ left: position.x, top: position.y, zIndex: layout[note.id].z }}
          onPointerDownCapture={() => front(note.id)} onFocusCapture={() => front(note.id)}
          onPointerDown={(event) => start(event, note.id)}
          onPointerMove={(event) => {
            if (drag.current?.pointer === event.pointerId) { drag.current.x = event.clientX; drag.current.y = event.clientY; }
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer === event.pointerId) {
              drag.current.x = event.clientX; drag.current.y = event.clientY;
              update(); finish(false);
            }
          }}
          onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}>
          <StickyNote card={note} place="board" autofocus={autofocusId === note.id && !note.words} onOpen={() => onOpen(note.id)}
            moveHandle={<button className="sticky-btn nt-board-move" aria-label={`Move ${nameOf(note) || "sticky note"}`}
              title="Drag to move. Arrow keys move 10px; Shift moves 1px. Escape cancels a drag."
              onKeyDown={(event) => {
                const step = steps[event.key];
                if (!step || drag.current) return;
                event.preventDefault();
                const distance = event.shiftKey ? 1 : 10;
                setSaved((previous) => {
                  const p = previous[note.id] ?? layout[note.id];
                  return { ...previous, [note.id]: { ...p, x: clamp(p.x + step[0] * distance), y: clamp(p.y + step[1] * distance) } };
                });
                setAnnouncement(`${nameOf(note) || "Sticky note"} moved`);
              }}><GripVertical size={14} strokeWidth={1.75} /></button>} />
        </div>;
      })}
    </div>
    <span className="tile-move-announcement" role="status">{announcement}</span>
  </div>;
}
