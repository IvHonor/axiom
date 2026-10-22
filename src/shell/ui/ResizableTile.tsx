import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { TileMoveContext, useTileMovement, type TileMovement } from "./TileMoveHandle";
import { TILE_GRID, type TilePosition, type TileSize } from "./tileLayout";
export { TILE_GRID, type TileSize } from "./tileLayout";

interface TileLayout {
  size: TileSize;
  width: number;
  height: number;
}
const TileLayoutContext = createContext<TileLayout>({ size: { w: 4, h: 4 }, width: 0, height: 0 });
/** Actual content space, excluding the panel header and padding. */
export const useTileLayout = () => useContext(TileLayoutContext);

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
  position?: TilePosition;
  movement?: TileMovement;
  onResize: (size: TileSize) => void;
  /** Names the tile for screen readers ("Resize Finance"). */
  label: string;
  children: ReactNode;
}

/** A grid cell whose bottom-right corner can be dragged to resize it, snapping to whole cells. */
export function ResizableTile({ size, position, movement, onResize, label, children }: ResizableTileProps) {
  const cell = useRef<HTMLDivElement>(null);
  const { control, moving } = useTileMovement(cell, label, size, position, movement);
  const drag = useRef<{ x: number; y: number; width: number; height: number; colStep: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const body = cell.current?.querySelector(".panel-body");
    if (!body) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

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
      className={`tile-cell${resizing ? " is-resizing" : ""}${moving ? " is-moving" : ""}`}
      style={{
        "--w": size.w, "--h": size.h,
        ...(position ? { gridColumn: `${position.col} / span ${size.w}`, gridRow: `${position.row} / span ${size.h}` } : {}),
      } as CSSProperties}
    >
      <TileLayoutContext.Provider value={{ size, ...bounds }}>
        <TileMoveContext.Provider value={control}>{children}</TileMoveContext.Provider>
      </TileLayoutContext.Provider>
      {(resizing || moving) && (
        <span className="tile-size">
          {moving && position ? `Column ${position.col} · Row ${position.row}` : `${size.w} × ${size.h}`}
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
