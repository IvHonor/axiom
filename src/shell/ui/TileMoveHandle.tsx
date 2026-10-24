import { GripVertical } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { fitPosition, MAX_TILE_ROW, TILE_GRID, type TilePosition, type TileSize } from "./tileLayout";

export interface TileMovement {
  onPreview: (position: TilePosition) => void;
  onCommit: (position: TilePosition) => void;
  onCancel: () => void;
}
export const TileMoveContext = createContext<ReactNode>(null);
/** Place in a panel's actions; available only when its tile can move. */
export function TileMoveHandle() { return useContext(TileMoveContext); }

interface Drag {
  x: number; y: number; pointerX: number; pointerY: number; pointerId: number;
  grabX: number; grabY: number; target: TilePosition; colStep: number;
  grid: HTMLElement; gridWidth: number; minHeight: string;
  scroller: HTMLElement; scrollTop: number; frame: number; time: number; active: boolean;
}
const steps: Record<string, TilePosition> = {
  ArrowLeft: { col: -1, row: 0 }, ArrowRight: { col: 1, row: 0 },
  ArrowUp: { col: 0, row: -1 }, ArrowDown: { col: 0, row: 1 },
};

// A little resistance around cell boundaries prevents collision previews from fluttering.
function snap(value: number, previous: number) {
  return Math.abs(value - previous) <= .62 ? previous : Math.round(value);
}

function scrollParent(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return document.scrollingElement as HTMLElement;
}

export function useTileMovement(
  cell: RefObject<HTMLDivElement | null>, label: string, size: TileSize,
  position?: TilePosition, movement?: TileMovement,
) {
  const drag = useRef<Drag | null>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const latest = useRef({ position, movement, size });
  latest.current = { position, movement, size };
  const [moving, setMoving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const finish = (cancelled: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    document.documentElement.classList.remove("is-moving");
    setMoving(false);
    current.grid.style.minHeight = current.minHeight;
    if (handle.current?.hasPointerCapture(current.pointerId)) handle.current.releasePointerCapture(current.pointerId);
    if (cancelled) {
      latest.current.movement?.onCancel();
      current.scroller.scrollTop = current.scrollTop;
      setAnnouncement("Move cancelled");
    } else if (current.active) {
      latest.current.movement?.onCommit(current.target);
      setAnnouncement(`${label} moved to column ${current.target.col}, row ${current.target.row}`);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault(); event.stopPropagation(); finishRef.current(true);
      }
    };
    const cancel = () => finishRef.current(true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", visibility);
      // The parent can disappear while switching tabs or uninstalling an area.
      const current = drag.current;
      if (current) {
        drag.current = null;
        cancelAnimationFrame(current.frame);
        document.documentElement.classList.remove("is-moving");
        current.grid.style.minHeight = current.minHeight;
        latest.current.movement?.onCancel();
      }
    };
  }, []);

  const preview = () => {
    const current = drag.current;
    const node = cell.current;
    if (!current || !node) return;
    // A sidebar or viewport change invalidates the original grab geometry.
    if (Math.abs(current.grid.clientWidth - current.gridWidth) > 1) { finishRef.current(true); return; }
    if (!current.active && Math.hypot(current.pointerX - current.x, current.pointerY - current.y) < 4) return;
    if (!current.active) {
      current.active = true;
      setMoving(true);
      document.documentElement.classList.add("is-moving");
    }
    const rect = current.grid.getBoundingClientRect();
    if (rect.height > parseFloat(current.grid.style.minHeight)) current.grid.style.minHeight = `${rect.height}px`;
    const left = Math.max(0, Math.min(current.gridWidth - node.offsetWidth, current.pointerX - current.grabX - rect.left));
    const top = Math.max(0, Math.min((MAX_TILE_ROW - 1) * (TILE_GRID.rowHeight + TILE_GRID.gap), current.pointerY - current.grabY - rect.top));
    const target = fitPosition({
      col: snap(1 + left / current.colStep, current.target.col),
      row: snap(1 + top / (TILE_GRID.rowHeight + TILE_GRID.gap), current.target.row),
    }, latest.current.size);
    const actual = latest.current.position ?? current.target;
    node.style.transform = `translate(${left - (actual.col - 1) * current.colStep}px, ${top - (actual.row - 1) * (TILE_GRID.rowHeight + TILE_GRID.gap)}px)`;
    if (target.col !== current.target.col || target.row !== current.target.row) {
      current.target = target;
      latest.current.movement?.onPreview(target);
    }
  };
  // Rebase the floating tile in the same paint as a snapped grid preview.
  useLayoutEffect(() => { if (drag.current?.active) preview(); }, [position?.col, position?.row, moving]);
  const tick = (time: number) => {
    const current = drag.current;
    if (!current) return;
    const rect = current.scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : current.scroller.getBoundingClientRect();
    const elapsed = Math.min(32, time - current.time || 16.67);
    current.time = time;
    const edge = Math.min(64, (rect.bottom - rect.top) / 4);
    const speed = current.pointerY < rect.top + edge
      ? -Math.min(1, (rect.top + edge - current.pointerY) / edge)
      : current.pointerY > rect.bottom - edge
        ? Math.min(1, (current.pointerY - rect.bottom + edge) / edge) : 0;
    if (speed && current.active) {
      current.scroller.scrollTop += Math.sign(speed) * speed * speed * .85 * elapsed;
    }
    preview();
    if (drag.current !== current) return;
    current.frame = requestAnimationFrame(tick);
  };

  const control = position && movement ? <>
    <button ref={handle} className="icon-btn tile-move-handle" aria-label={`Move ${label}`}
      title="Drag to move, or focus and use arrow keys. Escape cancels a drag."
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || !cell.current || drag.current) return;
        const grid = cell.current.parentElement;
        if (!grid) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const scroller = scrollParent(grid);
        const rect = cell.current.getBoundingClientRect();
        drag.current = {
          x: event.clientX, y: event.clientY, pointerX: event.clientX, pointerY: event.clientY, pointerId: event.pointerId,
          grabX: event.clientX - rect.left, grabY: event.clientY - rect.top, target: position,
          colStep: (grid.clientWidth + TILE_GRID.gap) / TILE_GRID.columns,
          grid, gridWidth: grid.clientWidth, minHeight: grid.style.minHeight,
          scroller, scrollTop: scroller.scrollTop, frame: 0, time: 0, active: false,
        };
        // Keep the scrollable canvas from collapsing while displaced tiles return home.
        grid.style.minHeight = `${grid.getBoundingClientRect().height}px`;
        drag.current.frame = requestAnimationFrame(tick);
      }}
      onPointerMove={event => {
        if (!drag.current || event.pointerId !== drag.current.pointerId) return;
        drag.current.pointerX = event.clientX; drag.current.pointerY = event.clientY;
      }}
      onPointerUp={event => { if (event.pointerId === drag.current?.pointerId) { preview(); finish(false); } }}
      onPointerCancel={event => { if (event.pointerId === drag.current?.pointerId) finish(true); }}
      onLostPointerCapture={() => finish(true)}
      onKeyDown={event => {
        if (drag.current) return;
        const step = steps[event.key];
        if (!step) return;
        event.preventDefault();
        const next = fitPosition({ col: position.col + step.col, row: position.row + step.row }, size);
        if (next.col === position.col && next.row === position.row) return;
        movement.onCommit(next);
        setAnnouncement(`${label} moved to column ${next.col}, row ${next.row}`);
      }}>
      <GripVertical size={15} strokeWidth={1.5} aria-hidden="true" />
    </button>
    <span className="tile-move-announcement" role="status">{announcement}</span>
  </> : null;
  return { control, moving };
}
