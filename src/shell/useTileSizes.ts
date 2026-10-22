import { useCallback } from "react";
import type { TileSize } from "./ui/ResizableTile";
import { usePersistentState } from "./usePersistentState";

const DEFAULT_SIZE: TileSize = { w: 4, h: 4 };

function isSize(value: unknown): value is TileSize {
  const size = value as TileSize;
  return Number.isInteger(size?.w) && size.w >= 2 && size.w <= 12 &&
    Number.isInteger(size?.h) && size.h >= 2 && size.h <= 16;
}

/** The size of each extension's overview tile, remembered across restarts. */
export function useTileSizes() {
  const [sizes, setSizes] = usePersistentState<Record<string, TileSize>>("axiom.tileSizes", (saved) =>
    saved && typeof saved === "object" ? Object.fromEntries(Object.entries(saved).filter(([, size]) => isSize(size))) : {},
  );

  const sizeOf = (id: string): TileSize => sizes[id] ?? DEFAULT_SIZE;

  const resize = useCallback(
    (id: string, size: TileSize) => setSizes((all) => ({ ...all, [id]: size })),
    [setSizes],
  );

  return { sizeOf, resize };
}
