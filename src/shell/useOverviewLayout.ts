import { useState } from "react";
import { arrangeTiles, MAX_TILE_ROW, TILE_GRID, type TilePosition, type TileSize } from "./ui/tileLayout";
import { usePersistentState } from "./usePersistentState";
import { useTileSizes } from "./useTileSizes";

function readPositions(saved: unknown): Record<string, TilePosition> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter(([, value]) =>
    value && Number.isInteger(value.col) && value.col >= 1 && value.col <= TILE_GRID.columns &&
    Number.isInteger(value.row) && value.row >= 1 && value.row <= MAX_TILE_ROW));
}

/** Sizes and positions use separate keys so existing tile sizes migrate unchanged. */
export function useOverviewLayout(ids: string[], defaults: Record<string, TileSize> = {}) {
  const { sizeOf: savedSize, resize: resizeTile } = useTileSizes();
  const sizeOf = (id: string) => savedSize(id, defaults[id]);
  const [saved, setSaved] = usePersistentState("axiom.tilePositions.v1", readPositions);
  const [preview, setPreview] = useState<{ id: string; position: TilePosition } | null>(null);
  const tiles = ids.map(id => ({ id, size: sizeOf(id) }));
  const baseline = arrangeTiles(tiles, saved);
  const positions = preview ? arrangeTiles(tiles, baseline, preview) : baseline;
  const save = (next: Record<string, TilePosition>) => {
    // Keep an uninstalled area's location for reinstallation.
    setSaved(previous => ({ ...previous, ...next }));
    setPreview(null);
  };
  return {
    sizeOf,
    positions,
    resize(id: string, size: TileSize) {
      save(arrangeTiles(tiles.map(tile => tile.id === id ? { ...tile, size } : tile), baseline, { id, position: positions[id] }));
      resizeTile(id, size);
    },
    movement(id: string) {
      return {
        onPreview: (position: TilePosition) => setPreview({ id, position }),
        onCommit: (position: TilePosition) => save(arrangeTiles(tiles, baseline, { id, position })),
        onCancel: () => setPreview(null),
      };
    },
  };
}
