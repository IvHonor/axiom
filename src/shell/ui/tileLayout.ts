/** Shared geometry for overview placement, movement and resizing. */
export const TILE_GRID = { columns: 12, rowHeight: 48, gap: 16 };
export interface TileSize { w: number; h: number }
/** One-based CSS grid coordinates. */
export interface TilePosition { col: number; row: number }
export interface LayoutTile { id: string; size: TileSize }
export const MAX_TILE_ROW = 1000;

export function fitPosition(position: TilePosition, size: TileSize): TilePosition {
  return {
    col: Math.max(1, Math.min(TILE_GRID.columns - size.w + 1, Math.round(position.col))),
    row: Math.max(1, Math.min(MAX_TILE_ROW, Math.round(position.row))),
  };
}

/** Keep the edited tile fixed; displace collisions down, preserving other gaps. */
export function arrangeTiles(
  tiles: LayoutTile[],
  saved: Record<string, TilePosition>,
  edited?: { id: string; position: TilePosition } | null,
): Record<string, TilePosition> {
  const positions: Record<string, TilePosition> = {};
  const placed: (LayoutTile & TilePosition)[] = [];
  const free = (position: TilePosition, size: TileSize) => !placed.some(other =>
    position.col < other.col + other.size.w && position.col + size.w > other.col &&
    position.row < other.row + other.size.h && position.row + size.h > other.row);
  // Reserve explicit positions before placing newly installed areas in gaps.
  const ordered = [...tiles].sort((a, b) =>
    Number(b.id === edited?.id) - Number(a.id === edited?.id) ||
    Number(!!saved[b.id]) - Number(!!saved[a.id]) ||
    (saved[a.id]?.row ?? 0) - (saved[b.id]?.row ?? 0) ||
    (saved[a.id]?.col ?? 0) - (saved[b.id]?.col ?? 0));
  for (const tile of ordered) {
    const wanted = tile.id === edited?.id ? edited.position : saved[tile.id];
    let position: TilePosition;
    if (wanted) {
      position = fitPosition(wanted, tile.size);
      // Jump to the bottom of overlapping tiles, rather than scanning every row.
      while (!free(position, tile.size)) {
        position.row = Math.max(...placed.filter(other =>
          position.col < other.col + other.size.w && position.col + tile.size.w > other.col &&
          position.row < other.row + other.size.h && position.row + tile.size.h > other.row
        ).map(other => other.row + other.size.h));
      }
    } else {
      position = { col: 1, row: 1 };
      while (!free(position, tile.size)) {
        position.col++;
        if (position.col + tile.size.w > TILE_GRID.columns + 1) {
          position.col = 1;
          position.row++;
        }
      }
    }
    positions[tile.id] = position;
    placed.push({ ...tile, ...position });
  }
  return positions;
}
