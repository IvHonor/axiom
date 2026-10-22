import { GripVertical } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { fitPosition, TILE_GRID, type TilePosition, type TileSize } from "./tileLayout";

export interface TileMovement {
  onPreview: (position: TilePosition) => void;
  onCommit: (position: TilePosition) => void;
  onCancel: () => void;
}
export const TileMoveContext = createContext<ReactNode>(null);
/** Place in a panel's actions; available only when its tile can move. */
export function TileMoveHandle() { return useContext(TileMoveContext); }

interface Drag {
  x: number; y: number; pointerY: number; pointerId: number;
  start: TilePosition; target: TilePosition; colStep: number;
  scroller: HTMLElement; scrollTop: number; frame: number; active: boolean;
}
const steps: Record<string, TilePosition> = {
  ArrowLeft: { col: -1, row: 0 }, ArrowRight: { col: 1, row: 0 },
  ArrowUp: { col: 0, row: -1 }, ArrowDown: { col: 0, row: 1 },
};

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
    if (handle.current?.hasPointerCapture(current.pointerId)) handle.current.releasePointerCapture(current.pointerId);
    if (cancelled) {
      latest.current.movement?.onCancel();
      current.scroller.scrollTop = current.scrollTop;
      setAnnouncement("Move cancelled");
    } else {
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
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      // The parent can disappear while switching tabs or uninstalling an area.
      const current = drag.current;
      if (current) {
        drag.current = null;
        cancelAnimationFrame(current.frame);
        document.documentElement.classList.remove("is-moving");
        latest.current.movement?.onCancel();
      }
    };
  }, []);

  const preview = (x: number, y: number) => {
    const current = drag.current;
    if (!current) return;
    if (!current.active && Math.hypot(x - current.x, y - current.y) < 4) return;
    current.active = true;
    const target = fitPosition({
      col: current.start.col + Math.round((x - current.x) / current.colStep),
      row: current.start.row + Math.round((y - current.y + current.scroller.scrollTop - current.scrollTop) / (TILE_GRID.rowHeight + TILE_GRID.gap)),
    }, latest.current.size);
    if (target.col !== current.target.col || target.row !== current.target.row) {
      current.target = target;
      latest.current.movement?.onPreview(target);
    }
  };
  const pointerX = useRef(0);
  const tick = () => {
    const current = drag.current;
    if (!current) return;
    const rect = current.scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : current.scroller.getBoundingClientRect();
    const edge = 48;
    const speed = current.pointerY < rect.top + edge
      ? -Math.min(14, (rect.top + edge - current.pointerY) / 3)
      : current.pointerY > rect.bottom - edge
        ? Math.min(14, (current.pointerY - rect.bottom + edge) / 3) : 0;
    if (speed && current.active) {
      current.scroller.scrollTop += speed;
      preview(pointerX.current, current.pointerY);
    }
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
        pointerX.current = event.clientX;
        drag.current = {
          x: event.clientX, y: event.clientY, pointerY: event.clientY, pointerId: event.pointerId,
          start: position, target: position,
          colStep: (grid.clientWidth + TILE_GRID.gap) / TILE_GRID.columns,
          scroller, scrollTop: scroller.scrollTop, frame: 0, active: false,
        };
        setMoving(true);
        document.documentElement.classList.add("is-moving");
        drag.current.frame = requestAnimationFrame(tick);
      }}
      onPointerMove={event => {
        if (!drag.current || event.pointerId !== drag.current.pointerId) return;
        pointerX.current = event.clientX; drag.current.pointerY = event.clientY;
        preview(event.clientX, event.clientY);
      }}
      onPointerUp={event => { if (event.pointerId === drag.current?.pointerId) finish(false); }}
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
