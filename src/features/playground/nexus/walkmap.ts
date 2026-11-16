// A walkable map: what's solid in it, and finding the way across it. The city
// has one (world.ts) and so does each building's inside (interiors.ts).
// Plain maths, tested without a screen.
//
// Units are metres, x east and z south, the map's middle at (0, 0).

export interface Point { x: number; z: number }

/** Something you can't walk through: a circle or a box. */
export type Solid =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x: number; z: number; w: number; d: number };

export interface MapShape {
  solids: Solid[];
  /** Half its width (x) and depth (z): the walls. */
  halfW: number;
  halfD: number;
  /** A round room: its walls are a circle this big instead. */
  round?: number;
  /** Squares of the pathfinding grid, in metres: smaller for tight rooms. */
  cell: number;
  /** Where to go when there's nowhere open at all. */
  fallback: Point;
  /** How high the ground is (raised terraces and stairs); flat if not given. */
  height?: (p: Point) => number;
  /** Where there's ground to stand on at all (`pad` metres from its edge); everywhere inside the walls if not given. */
  walkable?: (p: Point, pad: number) => boolean;
}

export interface WalkMap {
  shape: MapShape;
  /** Inside something solid (or a wall), with `pad` metres of clearance around it. */
  blocked: (p: Point, pad?: number) => boolean;
  /** A straight walk from `a` to `b` touches nothing solid. */
  clearLine: (a: Point, b: Point) => boolean;
  /** The nearest walkable spot to `p`. */
  nearestOpen: (p: Point) => Point;
  /**
   * The way from `from` to `to`, round anything solid: a few corner points (the
   * grid's path, pulled straight wherever the line's clear). Ends at the nearest
   * open spot to `to`. Empty when there's no way.
   */
  findPath: (from: Point, to: Point) => Point[];
  /** How high the ground is at a spot. */
  height: (p: Point) => number;
}

export function makeMap(shape: MapShape): WalkMap {
  const { solids, halfW, halfD, round, cell: CELL, fallback, walkable } = shape;
  // Solids by area, so checking a spot looks at the few nearby, not all of them.
  const BUCKET = 16;
  const buckets = new Map<string, Solid[]>();
  for (const solid of solids) {
    const reach = solid.kind === "circle" ? solid.r : Math.max(solid.w, solid.d) / 2;
    for (let bx = Math.floor((solid.x - reach - 2) / BUCKET); bx <= Math.floor((solid.x + reach + 2) / BUCKET); bx++) {
      for (let bz = Math.floor((solid.z - reach - 2) / BUCKET); bz <= Math.floor((solid.z + reach + 2) / BUCKET); bz++) {
        const key = `${bx},${bz}`;
        buckets.set(key, [...(buckets.get(key) ?? []), solid]);
      }
    }
  }

  const edge = Math.min(2, Math.max(0.8, CELL));
  const blocked = (p: Point, pad = 0.8): boolean => {
    if (Math.abs(p.x) > halfW - edge || Math.abs(p.z) > halfD - edge) return true;
    if (round !== undefined && Math.hypot(p.x, p.z) > round - edge) return true;
    if (walkable && !walkable(p, pad)) return true;
    const near = buckets.get(`${Math.floor(p.x / BUCKET)},${Math.floor(p.z / BUCKET)}`);
    return !!near && near.some((s) => s.kind === "circle"
      ? Math.hypot(p.x - s.x, p.z - s.z) < s.r + pad
      : Math.abs(p.x - s.x) < s.w / 2 + pad && Math.abs(p.z - s.z) < s.d / 2 + pad);
  };

  const COLS = Math.ceil((halfW * 2) / CELL), ROWS = Math.ceil((halfD * 2) / CELL);
  const toCol = (v: number) => Math.max(0, Math.min(COLS - 1, Math.floor((v + halfW) / CELL)));
  const toRow = (v: number) => Math.max(0, Math.min(ROWS - 1, Math.floor((v + halfD) / CELL)));
  const colX = (c: number) => c * CELL - halfW + CELL / 2;
  const rowZ = (r: number) => r * CELL - halfD + CELL / 2;

  let walls: Uint8Array | null = null;
  /** Which cells are solid, worked out once. */
  const grid = (): Uint8Array => {
    if (walls) return walls;
    walls = new Uint8Array(COLS * ROWS);
    // A little more room than walking needs, so the straight line between two open squares
    // never clips an edge between them (an edge that curves or meets another at an angle).
    const roomy = walkable ? 0.8 + CELL * 0.25 : 0.8;
    for (let cz = 0; cz < ROWS; cz++) for (let cx = 0; cx < COLS; cx++) walls[cz * COLS + cx] = blocked({ x: colX(cx), z: rowZ(cz) }, roomy) ? 1 : 0;
    return walls;
  };

  const clearLine = (a: Point, b: Point): boolean => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  };

  const nearestOpen = (p: Point): Point => {
    if (!blocked(p)) return p;
    const step = Math.min(1, CELL);
    for (let r = step; r < 140; r += step) {
      for (let a = 0; a < 16; a++) {
        const q = { x: p.x + Math.cos((a / 16) * Math.PI * 2) * r, z: p.z + Math.sin((a / 16) * Math.PI * 2) * r };
        if (!blocked(q)) return q;
      }
    }
    return fallback;
  };

  const findPath = (from: Point, to: Point): Point[] => {
    const goal = nearestOpen(to);
    if (clearLine(from, goal)) return [goal];
    const w = grid();
    const start = toRow(from.z) * COLS + toCol(from.x);
    let end = toRow(goal.z) * COLS + toCol(goal.x);
    // An open spot right beside something solid can sit in a square whose middle
    // isn't: aim for the nearest square that's open all the way.
    if (w[end]) {
      const gx = end % COLS, gz = Math.floor(end / COLS);
      search: for (let r = 1; r < 12; r++) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx, nz = gz + dz;
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS || w[nz * COLS + nx]) continue;
          end = nz * COLS + nx;
          break search;
        }
      }
    }
    // Full precision: rounded costs can make the same detour look better again and
    // again, so the search never settles (and can even trace back in a loop).
    const total = COLS * ROWS;
    const cost = new Float64Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const done = new Uint8Array(total);
    const heap: [number, number][] = [];
    const push = (f: number, n: number) => {
      heap.push([f, n]);
      for (let i = heap.length - 1; i > 0;) {
        const up = (i - 1) >> 1;
        if (heap[up][0] <= heap[i][0]) break;
        [heap[up], heap[i]] = [heap[i], heap[up]];
        i = up;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const ex = end % COLS, ez = Math.floor(end / COLS);
    const guess = (n: number) => Math.hypot((n % COLS) - ex, Math.floor(n / COLS) - ez);
    cost[start] = 0;
    push(guess(start), start);
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [, n] = pop();
      // An older, worse entry for somewhere already finished.
      if (done[n]) continue;
      done[n] = 1;
      if (n === end) break;
      const cx = n % COLS, cz = Math.floor(n / COLS);
      for (const [dx, dz, c] of steps) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue;
        const m = nz * COLS + nx;
        // No cutting corners past something solid.
        if (done[m] || w[m] || (dx && dz && (w[cz * COLS + nx] || w[nz * COLS + cx]))) continue;
        const next = cost[n] + c;
        if (next < cost[m]) {
          cost[m] = next;
          came[m] = n;
          push(next + guess(m), m);
        }
      }
    }
    if (came[end] < 0 && start !== end) return [];
    const cells: Point[] = [];
    for (let n = end, guard = 0; n !== start && n >= 0 && guard < total; n = came[n], guard++) cells.push({ x: colX(n % COLS), z: rowZ(Math.floor(n / COLS)) });
    cells.reverse();
    if (cells.length && clearLine(cells[Math.max(0, cells.length - 2)], goal)) cells[cells.length - 1] = goal;
    // Pull the path straight in one sweep: from each corner, carry on as far as
    // it can see, and turn only where it can't.
    const out: Point[] = [];
    let at = from;
    for (let i = 0; i < cells.length;) {
      let j = i;
      while (j + 1 < cells.length && clearLine(at, cells[j + 1])) j++;
      out.push(cells[j]);
      at = cells[j];
      i = j + 1;
    }
    return out;
  };

  return { shape, blocked, clearLine, nearestOpen, findPath, height: shape.height ?? (() => 0) };
}
