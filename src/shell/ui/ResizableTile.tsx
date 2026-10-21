import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

/** A tile's size in grid cells. */
export interface TileSize {
  w: number;
  h: number;
}

/** The grid tiles snap to. The CSS reads these values, so this is the one place to change them. */
export const TILE_GRID = { columns: 12, rowHeight: 48, gap: 16 };
const MIN: TileSize = { w: 2, h: 2 };
const MAX: TileSize = { w: TILE_GRID.columns, h: 16 };

const ARROWS: Record<string, TileSize> = {
  ArrowLeft: { w: -1, h: 0 },
  ArrowRight: { w: 1, h: 0 },
  ArrowUp: { w: 0, h: -1 },
  ArrowDown: { w: 0, h: 1 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function TileGrid({ children }: { children: ReactNode }) {
  const style = {
    "--cols": TILE_GRID.columns,
    "--row": `${TILE_GRID.rowHeight}px`,
    "--gap": `${TILE_GRID.gap}px`,
  } as CSSProperties;
  return (
    <div className="tile-grid" style={style}>
      {children}
    </div>
  );
}

interface ResizableTileProps {
  size: TileSize;
  onResize: (size: TileSize) => void;
  /** Names the tile for screen readers ("Resize Finance"). */
  label: string;
  children: ReactNode;
}

/** A grid cell whose bottom-right corner can be dragged to resize it, snapping to whole cells. */
export function ResizableTile({ size, onResize, label, children }: ResizableTileProps) {
  const cell = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number; colStep: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  function update(next: TileSize) {
    const w = clamp(next.w, MIN.w, MAX.w);
    const h = clamp(next.h, MIN.h, MAX.h);
    if (w !== size.w || h !== size.h) onResize({ w, h });
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    const grid = cell.current?.parentElement;
    if (!cell.current || !grid) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { columns, gap } = TILE_GRID;
    const rect = cell.current.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      colStep: (grid.clientWidth - gap * (columns - 1)) / columns + gap,
    };
    setResizing(true);
    document.documentElement.classList.add("is-resizing");
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start) return;
    const { gap, rowHeight } = TILE_GRID;
    // A tile spanning n cells is n * step - gap wide, so n = (size + gap) / step.
    update({
      w: Math.round((start.width + e.clientX - start.x + gap) / start.colStep),
      h: Math.round((start.height + e.clientY - start.y + gap) / (rowHeight + gap)),
    });
  }

  function onPointerUp() {
    drag.current = null;
    setResizing(false);
    document.documentElement.classList.remove("is-resizing");
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = ARROWS[e.key];
    if (!step) return;
    e.preventDefault();
    update({ w: size.w + step.w, h: size.h + step.h });
  }

  return (
    <div
      ref={cell}
      className={resizing ? "tile-cell is-resizing" : "tile-cell"}
      style={{ "--w": size.w, "--h": size.h } as CSSProperties}
    >
      {children}
      {resizing && (
        <span className="tile-size">
          {size.w} × {size.h}
        </span>
      )}
      <button
        className="resize-handle"
        aria-label={`Resize ${label}`}
        title="Drag to resize, or focus and use the arrow keys"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M9.5 2.5 2.5 9.5M9.5 6.5 6.5 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
