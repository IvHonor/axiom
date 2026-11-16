// Drawing how Nexus hangs together (routes.ts has the maths): the districts'
// islands, stepped cliffs of lit arcades rising out of a river of light (the
// Simulation Chambers floating free above it); the rivers themselves, and
// light spilling down into them; and the routes between, each its own kind of
// place: the Rialto's market stalls, the Golden Gate's towers and cables, the
// Great Firewall's battlements and beacons, Tower Bridge, the Thousand Steps,
// the rainbow of the Bifröst, and the Ascension Lift's gravity stream.
import * as THREE from "three";
import { dataRain, dotTexture, edges, glow, seeded, sign, stone, tag, windows } from "./kit";
import { beam } from "./terrain";
import { ISLANDS, LIFTS, SPANS, fromSpan, liftAt, type Island, type Span } from "./routes";
import { RIALTO_BENCH, STALLS, alongSpan } from "./world";

const DISTRICT_COLORS: Record<string, string> = { nexus: "#8fc4ff", memory: "#ffd89a", computation: "#6fe3ff", simulation: "#c58bff", gardens: "#7ff5c9" };

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};
const lit = (color: string, columns: number, seed: string, repeatX: number) => {
  const t = windows(color, columns, 1, true, seed);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(repeatX, 1);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map: t, emissive: new THREE.Color(color), emissiveMap: t, emissiveIntensity: 0.65, roughness: 0.8 });
};
const line = (points: THREE.Vector3[], color: THREE.Color, opacity = 0.9) =>
  new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.7), transparent: true, opacity }));

/** Instanced posts at the given spots, with a glowing rail joining neighbours. */
function balustrade(spots: THREE.Vector3[], color: THREE.Color, height = 1.1): THREE.Group {
  const group = new THREE.Group();
  if (!spots.length) return group;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, height, 6), stone(color), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => { m.makeTranslation(p.x, p.y + height / 2, p.z); mesh.setMatrixAt(i, m); });
  const rail: number[] = [];
  for (let i = 1; i < spots.length; i++) {
    const a = spots[i - 1], b = spots[i];
    if (a.distanceTo(b) < 3) rail.push(a.x, a.y + height, a.z, b.x, b.y + height, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(rail, 3));
  group.add(mesh, new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.7), transparent: true, opacity: 0.85 })));
  return group;
}

// ---------- Flowing light ----------

function streamTexture(color: string, seed: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  const band = g.createLinearGradient(0, 0, 64, 0);
  band.addColorStop(0, "rgba(0,0,0,0)");
  band.addColorStop(0.5, color);
  band.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.5;
  g.fillStyle = band;
  g.fillRect(0, 0, 64, 256);
  g.globalAlpha = 1;
  const rand = seeded(seed);
  for (let i = 0; i < 10; i++) {
    const x = 14 + rand() * 36, y = rand() * 256, h = 10 + rand() * 28;
    const dash = g.createLinearGradient(0, y, 0, y + h);
    dash.addColorStop(0, "rgba(255,255,255,0)");
    dash.addColorStop(1, "rgba(255,255,255,0.95)");
    g.fillStyle = dash;
    g.fillRect(x, y, 3, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A flat ribbon along a line of points. */
function ribbon(points: THREE.Vector3[], width: number, repeat: number): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  let along = 0;
  points.forEach((p, i) => {
    const next = points[Math.min(points.length - 1, i + 1)], prev = points[Math.max(0, i - 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    if (i > 0) along += p.distanceTo(points[i - 1]);
    positions.push(p.x + (nx * width) / 2, p.y, p.z + (nz * width) / 2, p.x - (nx * width) / 2, p.y, p.z - (nz * width) / 2);
    uvs.push(0, along / repeat, 1, along / repeat);
    if (i > 0) index.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function flowing(points: THREE.Vector3[], width: number, color: string, speed: number, opacity = 1): THREE.Mesh {
  const texture = streamTexture(color, `${color}${width}`);
  const mesh = new THREE.Mesh(ribbon(points, width, 16), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  return tag(mesh, { scroll: { texture, speed } });
}

// ---------- The islands ----------

/** Rim posts round an island, leaving gaps where routes and lifts meet it. */
function rimSpots(island: Island): THREE.Vector3[] {
  const r = island.r - 0.4, count = Math.ceil((Math.PI * 2 * r) / 1.8), out: THREE.Vector3[] = [];
  const ways = SPANS.filter((s) => s.from === island.id || s.to === island.id);
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2, p = { x: island.x + Math.cos(a) * r, z: island.z + Math.sin(a) * r };
    if (ways.some((s) => fromSpan(s, p) < s.width / 2 + 1)) continue;
    out.push(new THREE.Vector3(p.x, island.h, p.z));
  }
  return out;
}

function island(i: Island): THREE.Group {
  const group = new THREE.Group();
  const hex = DISTRICT_COLORS[i.id], color = new THREE.Color(hex), rand = seeded(`island-${i.id}`);
  // The top, edged in light.
  const top = new THREE.Mesh(new THREE.CircleGeometry(i.r, 128), new THREE.MeshStandardMaterial({ color: "#0a1024", emissive: color.clone().multiplyScalar(0.05), roughness: 0.85, metalness: 0.25 }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(i.x, i.h + 0.01, i.z);
  const edge = new THREE.Mesh(new THREE.RingGeometry(i.r - 0.7, i.r, 160), glow(color, 0.75));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(i.x, i.h + 0.04, i.z);
  group.add(top, edge, balustrade(rimSpots(i), color));
  if (i.id === "simulation") {
    // Floating free: a thick slab, and a great crystal keel hanging beneath, light pouring from its tip.
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(i.r, i.r - 1.5, 4, 96, 1, true), lit(hex, 12, "sim-slab", Math.round((Math.PI * 2 * i.r) / 10)));
    slab.position.y = i.h - 2;
    const keel = new THREE.Mesh(new THREE.ConeGeometry(i.r - 1.5, 17, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#120a24", emissive: color.clone().multiplyScalar(0.25), roughness: 0.4, metalness: 0.6, flatShading: true, side: THREE.DoubleSide }));
    keel.rotation.x = Math.PI;
    keel.position.y = i.h - 4 - 8.5;
    const keelLines = edges(new THREE.ConeGeometry(i.r - 1.5, 17, 12, 1, true), color, 0.6);
    keelLines.rotation.x = Math.PI;
    keelLines.position.copy(keel.position);
    group.add(at(slab, i.x, slab.position.y, i.z), at(keel, i.x, keel.position.y, i.z), at(keelLines, i.x, keelLines.position.y, i.z));
    group.add(at(beam(color, i.h - 21, 3), i.x, 0, i.z));
    // Rocks drifting round it.
    for (let k = 0; k < 14; k++) {
      const a = rand() * Math.PI * 2, r = i.r + 6 + rand() * 18;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rand() * 2.5, 0), new THREE.MeshStandardMaterial({ color: "#1a1030", emissive: color.clone().multiplyScalar(0.3), flatShading: true }));
      group.add(tag(at(rock, i.x + Math.cos(a) * r, 8 + rand() * 20, i.z + Math.sin(a) * r), { spin: 0.1 + rand() * 0.3, float: rand() * 6 }));
    }
    return group;
  }
  // Grounded: stepped tiers of lit arcades going down to the river, each a little wider.
  let topY = i.h, r = i.r, tier = 0;
  while (topY > 0.2) {
    const height = Math.min(topY, tier === 0 ? 4 : 5);
    const bottom = r + (tier === 0 ? 0.6 : 1.2);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, bottom, height, 128, 1, true), lit(hex, 10, `${i.id}-tier${tier}`, Math.round((Math.PI * 2 * r) / (tier === 0 ? 7 : 9))));
    body.position.set(i.x, topY - height / 2, i.z);
    group.add(body);
    if (tier > 0) {
      // The ledge on top of each lower tier, its lip glowing.
      const ledge = new THREE.Mesh(new THREE.RingGeometry(r - 3.2, r, 128), new THREE.MeshStandardMaterial({ color: "#0a1024", roughness: 0.9 }));
      ledge.rotation.x = -Math.PI / 2;
      ledge.position.set(i.x, topY + 0.02, i.z);
      const lip = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 128), glow(color, 0.6));
      lip.rotation.x = -Math.PI / 2;
      lip.position.set(i.x, topY + 0.05, i.z);
      group.add(ledge, lip);
    }
    topY -= height;
    r = bottom + 3;
    tier++;
  }
  // Light spilling over the edge, down into the river.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand(), p = { x: i.x + Math.cos(a) * (i.r + 0.4), z: i.z + Math.sin(a) * (i.r + 0.4) };
    if (SPANS.some((s) => fromSpan(s, p) < s.width + 4)) continue;
    const fall = dataRain(color, i.h);
    fall.position.x = p.x;
    fall.position.z = p.z;
    fall.rotation.y = -a + Math.PI / 2;
    group.add(fall);
  }
  return group;
}

export function islands(): THREE.Group {
  const group = new THREE.Group();
  for (const i of ISLANDS) group.add(island(i));
  return group;
}

// ---------- The river ----------

/** Rivers of light: a ring round the Nexus, and streams running out between the districts to the edge of the city. */
export function rivers(): THREE.Group {
  const group = new THREE.Group();
  const lanes: [number, number, string, number][] = [[0, 7, "#6f9dff", -0.45], [3.2, 3, "#bfe0ff", -0.75], [-3.6, 2, "#8fc4ff", -0.6]];
  // The ring.
  for (const [off, width, color, speed] of lanes) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 240; k++) {
      const a = (k / 240) * Math.PI * 2, r = 76 + off + Math.sin(a * 5) * 3;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.06, Math.sin(a) * r));
    }
    group.add(flowing(pts, width, color, speed, 0.9));
  }
  // The streams out: north, east, south and west, winding.
  [-Math.PI / 2, 0.12, Math.PI / 2, Math.PI - 0.1].forEach((angle, n) => {
    const u = { x: Math.cos(angle), z: Math.sin(angle) }, v = { x: -u.z, z: u.x };
    for (const [off, width, color, speed] of lanes) {
      const pts: THREE.Vector3[] = [];
      for (let r = 80; r <= 230; r += 3) {
        const wiggle = Math.sin(r / 22 + n) * 7 + off;
        pts.push(new THREE.Vector3(u.x * r + v.x * wiggle, 0.06, u.z * r + v.z * wiggle));
      }
      group.add(flowing(pts, width, color, speed, 0.9));
    }
  });
  return group;
}

// ---------- The routes ----------

interface Sample { p: THREE.Vector3; dir: THREE.Vector3; side: THREE.Vector3 }

/** Points every `step` metres along a route's crossing, with which way it runs and which way is its side. */
function samples(s: Span, step: number): Sample[] {
  const pts = s.points.slice(1, -1);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const count = Math.max(2, Math.round(total / step));
  return Array.from({ length: count + 1 }, (_, k) => {
    const a = alongSpan(s, k / count);
    return { p: new THREE.Vector3(a.x, a.y, a.z), dir: new THREE.Vector3(a.dir.x, 0, a.dir.z), side: new THREE.Vector3(-a.dir.z, 0, a.dir.x) };
  });
}

/** A deck: a slab `thickness` deep under a route's surface (to the river for a wall), with glowing edges. */
function deck(s: Span, list: Sample[], material: THREE.Material, thickness: number | "ground", color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const w = s.width / 2;
  const positions: number[] = [], index: number[] = [];
  // Four corners per sample: top-left, top-right, bottom-right, bottom-left.
  list.forEach(({ p, side }) => {
    const below = thickness === "ground" ? 0 : p.y - thickness;
    for (const [sx, y] of [[-1, p.y], [1, p.y], [1, below], [-1, below]] as const) positions.push(p.x + side.x * w * sx, y, p.z + side.z * w * sx);
  });
  for (let k = 1; k < list.length; k++) {
    const a = (k - 1) * 4, b = k * 4;
    for (let f = 0; f < 4; f++) {
      const f2 = (f + 1) % 4;
      index.push(a + f, b + f, a + f2, a + f2, b + f, b + f2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  group.add(mesh);
  for (const sx of [-1, 1]) group.add(line(list.map(({ p, side }) => new THREE.Vector3(p.x + side.x * w * sx, p.y + 0.04, p.z + side.z * w * sx)), color));
  return group;
}

/** A route's name at each end, facing whoever's about to set off along it. */
function nameSigns(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  for (const [t, towards] of [[0.02, s.to], [0.98, s.from]] as const) {
    const a = alongSpan(s, t);
    const board = sign(s.name, `to the ${towards === "gardens" ? "Model District" : towards === "nexus" ? "Nexus" : towards === "memory" ? "Memory District" : towards === "computation" ? "Computation District" : "Simulation Chambers"}`, color, Math.max(10, s.width + 1));
    board.position.set(a.x, a.y, a.z);
    board.rotation.y = Math.atan2(a.dir.x, a.dir.z) + (t < 0.5 ? Math.PI : 0);
    group.add(board);
  }
  return group;
}

function sides(list: Sample[], w: number, every = 1): THREE.Vector3[][] {
  return [-1, 1].map((sx) => list.filter((_, k) => k % every === 0).map(({ p, side }) => new THREE.Vector3(p.x + side.x * w * sx, p.y, p.z + side.z * w * sx)));
}

/** Arched piers from a deck down to the river. */
function piers(list: Sample[], s: Span, every: number): THREE.Group {
  const group = new THREE.Group();
  for (let k = every; k < list.length - every / 2; k += every) {
    const { p, dir } = list[k];
    const pier = new THREE.Mesh(new THREE.BoxGeometry(s.width * 0.8, p.y - 1.5, 3), lit(s.color, 4, `${s.id}-pier`, 1));
    pier.position.set(p.x, (p.y - 1.5) / 2, p.z);
    pier.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(pier);
  }
  return group;
}

function market(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 2), rand = seeded("rialto");
  group.add(deck(s, list, new THREE.MeshStandardMaterial({ color: "#1d1408", emissive: "#3a2410", emissiveIntensity: 0.4, roughness: 0.8 }), 2, color));
  group.add(piers(list, s, 7));
  // A warm runner of light up the middle.
  group.add(flowing(list.map(({ p }) => p.clone().setY(p.y + 0.05)), 3, "#ffd89a", -0.3, 0.6));
  // The stalls: little shops down both sides, lit fronts facing the walkway, awnings in every colour.
  for (const st of STALLS) {
    const shop = new THREE.Group();
    const hue = new THREE.Color().setHSL(rand(), 0.75, 0.55);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2.6), new THREE.MeshStandardMaterial({ color: "#2a1a0c", roughness: 0.8 }));
    body.position.y = 1.5;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: hue.clone().lerp(new THREE.Color("#fff2d6"), 0.6) }));
    front.position.set(0, 1.4, 1.31);
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), new THREE.MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    awning.position.set(0, 3.1, 1.6);
    awning.rotation.x = -0.6;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(new THREE.Color("#ffd89a")));
    lamp.position.set(1.3, 2.6, 1.6);
    shop.add(body, front, awning, tag(lamp, { pulse: 0.5 + rand() }));
    shop.position.set(st.x, groundY(s, st), st.z);
    // Its front faces the middle of the bridge.
    shop.lookAt(st.x + st.dir.z * st.side * 6.6, shop.position.y, st.z - st.dir.x * st.side * 6.6);
    group.add(shop);
  }
  // The bench in the middle, round a little tree of light.
  const by = groundY(s, RIALTO_BENCH);
  group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.55, 24), new THREE.MeshStandardMaterial({ color: "#3a2414" })), RIALTO_BENCH.x, by + 0.27, RIALTO_BENCH.z));
  group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), stone(color)), RIALTO_BENCH.x, by + 2, RIALTO_BENCH.z));
  group.add(tag(at(edges(new THREE.IcosahedronGeometry(1.4, 1), color, 0.8), RIALTO_BENCH.x, by + 3.8, RIALTO_BENCH.z), { spin: 0.3 }));
  // Strings of lanterns across, every so often.
  const bulbs: THREE.Vector3[] = [];
  for (let k = 3; k < list.length - 2; k += 5) {
    const { p, side } = list[k], w = s.width / 2 + 0.2;
    const a = new THREE.Vector3(p.x - side.x * w, p.y + 5, p.z - side.z * w), b = new THREE.Vector3(p.x + side.x * w, p.y + 5, p.z + side.z * w);
    const curve: THREE.Vector3[] = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12, q = a.clone().lerp(b, t);
      q.y -= Math.sin(Math.PI * t) * 1.4;
      curve.push(q);
      if (j % 2 === 1) bulbs.push(q.clone().setY(q.y - 0.15));
    }
    group.add(line(curve, new THREE.Color("#ffd89a"), 0.6));
    for (const end of [a, b]) group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), stone(color)), end.x, end.y - 2.5, end.z));
  }
  group.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(bulbs), new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, color: "#ffe2b0", size: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  // A grand arch over the middle.
  const mid = alongSpan(s, 0.5), archTop = mid.y + 13;
  for (const sx of [-1, 1]) group.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 13, 1.6), stone(color)), mid.x - mid.dir.z * sx * (s.width / 2 + 0.8), mid.y + 6.5, mid.z + mid.dir.x * sx * (s.width / 2 + 0.8)));
  const crown = new THREE.Mesh(new THREE.TorusGeometry(s.width / 2 + 0.8, 0.6, 8, 32, Math.PI), stone(color));
  crown.position.set(mid.x, archTop - 0.5, mid.z);
  crown.rotation.y = Math.atan2(mid.dir.x, mid.dir.z) + Math.PI / 2;
  const crownGlow = new THREE.Mesh(new THREE.TorusGeometry(s.width / 2 + 1.5, 0.08, 6, 48, Math.PI), glow(color));
  crownGlow.position.copy(crown.position);
  crownGlow.rotation.copy(crown.rotation);
  group.add(crown, crownGlow);
  group.add(balustrade(sides(list, s.width / 2 - 0.2, 1).flat(), color));
  return group;
}

/** How high a route's surface is at a spot on it. */
function groundY(s: Span, p: { x: number; z: number }): number {
  const [a, b] = s.chord, dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return s.heights[1] + (s.heights[s.heights.length - 2] - s.heights[1]) * t;
}

function suspension(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 2);
  const orange = new THREE.Color("#ff7a2f");
  group.add(deck(s, list, new THREE.MeshStandardMaterial({ color: "#140b06", emissive: "#2a1206", roughness: 0.7 }), 1.6, orange));
  group.add(balustrade(sides(list, s.width / 2 - 0.2, 1).flat(), orange));
  const towerAt = [0.25, 0.75].map((t) => alongSpan(s, t));
  const tall = 40;
  const towerMat = new THREE.MeshStandardMaterial({ color: "#3a1606", emissive: orange, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.4 });
  for (const tw of towerAt) {
    const turn = Math.atan2(tw.dir.x, tw.dir.z);
    for (const sx of [-1, 1]) {
      const legX = tw.x - tw.dir.z * sx * (s.width / 2 + 1.4), legZ = tw.z + tw.dir.x * sx * (s.width / 2 + 1.4);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2, tw.y + tall, 2.4), towerMat);
      leg.position.set(legX, (tw.y + tall) / 2, legZ);
      leg.rotation.y = turn;
      group.add(leg, at(edges(new THREE.BoxGeometry(2, tw.y + tall, 2.4), orange, 0.7), legX, (tw.y + tall) / 2, legZ));
      (group.children[group.children.length - 1] as THREE.Object3D).rotation.y = turn;
    }
    for (const up of [tw.y + 12, tw.y + 24, tw.y + tall - 1]) {
      const beamMesh = new THREE.Mesh(new THREE.BoxGeometry(s.width + 4.8, 1.6, 1.6), towerMat);
      beamMesh.position.set(tw.x, up, tw.z);
      beamMesh.rotation.y = turn + Math.PI / 2;
      group.add(beamMesh);
    }
    group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), glow(new THREE.Color("#ff3b3b"))), tw.x, tw.y + tall + 1.2, tw.z), { pulse: 1.2 }));
  }
  // The main cables: from the ends up over the towers, sagging between; hangers down to the deck.
  for (const sx of [-1, 1]) {
    const cable: THREE.Vector3[] = [];
    list.forEach(({ p, side }, k) => {
      const t = k / (list.length - 1);
      const top = t < 0.25 ? 2 + (t / 0.25) * (tall - 2) : t > 0.75 ? 2 + ((1 - t) / 0.25) * (tall - 2) : 6 + (tall - 6) * Math.pow((t - 0.5) / 0.25, 2);
      cable.push(new THREE.Vector3(p.x + side.x * (s.width / 2 + 1.4) * sx, p.y + top, p.z + side.z * (s.width / 2 + 1.4) * sx));
    });
    group.add(line(cable, orange, 0.95));
    const hangers: number[] = [];
    cable.forEach((c, k) => { if (k % 2 === 0) hangers.push(c.x, c.y, c.z, c.x, list[k].p.y + 1.1, c.z); });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(hangers, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: orange.clone().multiplyScalar(1.3), transparent: true, opacity: 0.45 })));
  }
  void color;
  return group;
}

function wall(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 1.6), fire = new THREE.Color("#ff7a45");
  group.add(deck(s, list, lit("#ff9a5a", 6, "firewall", 1), "ground", fire));
  // Battlements: merlons along both edges, every other step.
  const merlon = new THREE.BoxGeometry(1, 1.4, 0.8);
  const spots = sides(list, s.width / 2 - 0.4, 2).flat();
  const merlons = new THREE.InstancedMesh(merlon, stone(fire), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach((p, k) => {
    const d = list[Math.min(list.length - 1, (k % Math.ceil(list.length / 2)) * 2)].dir;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.x, d.z));
    m.compose(new THREE.Vector3(p.x, p.y + 0.7, p.z), q, new THREE.Vector3(1, 1, 1));
    merlons.setMatrixAt(k, m);
  });
  group.add(merlons);
  // Watchtowers at every bend and each end, beacons burning on top.
  const corners = s.points.slice(1, -1);
  corners.forEach((c, k) => {
    const y = s.heights[k + 1];
    for (const sx of [-1, 1]) {
      const prev = corners[Math.max(0, k - 1)], next = corners[Math.min(corners.length - 1, k + 1)];
      const d = { x: next.x - prev.x, z: next.z - prev.z }, len = Math.hypot(d.x, d.z);
      const tx = c.x - (d.z / len) * sx * (s.width / 2 + 2.2), tz = c.z + (d.x / len) * sx * (s.width / 2 + 2.2);
      // Low enough not to hide whoever's walking past.
      group.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.6, y + 4.5, 3.6), lit("#ff9a5a", 3, `fw-tower${k}${sx}`, 1)), tx, (y + 4.5) / 2, tz));
      group.add(tag(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.8), glow(fire)), tx, y + 5.6, tz), { spin: 2, pulse: 3 }));
      group.add(at(beam(fire, 16, 0.7), tx, y + 4.5, tz));
    }
  });
  // A line of fire glowing down the middle.
  group.add(flowing(list.map(({ p }) => p.clone().setY(p.y + 0.05)), 1.4, "#ff9a5a", -0.6, 0.7));
  void color;
  return group;
}

function towers(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 2);
  group.add(deck(s, list, new THREE.MeshStandardMaterial({ color: "#06121a", emissive: "#062a3a", roughness: 0.7 }), 1.6, color));
  group.add(balustrade(sides(list, s.width / 2 - 0.2, 1).flat(), color));
  group.add(piers(list, s, 10));
  const tall = 24;
  for (const t of [0.3, 0.7]) {
    const tw = alongSpan(s, t), turn = Math.atan2(tw.dir.x, tw.dir.z);
    for (const sx of [-1, 1]) {
      const x = tw.x - tw.dir.z * sx * (s.width / 2 + 2.6), z = tw.z + tw.dir.x * sx * (s.width / 2 + 2.6);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, tw.y + tall, 4.6), lit("#6fe3ff", 3, `tb${t}${sx}`, 1));
      body.position.set(x, (tw.y + tall) / 2, z);
      body.rotation.y = turn;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 4), stone(color));
      spire.position.set(x, tw.y + tall + 4.5, z);
      spire.rotation.y = turn + Math.PI / 4;
      group.add(body, spire, tag(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.6), glow(color)), x, tw.y + tall + 9.8, z), { spin: 1, pulse: 1.4 }));
    }
    // The high walkway between the towers.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(s.width + 5.2, 2, 3), stone(color));
    walk.position.set(tw.x, tw.y + tall - 4, tw.z);
    walk.rotation.y = turn + Math.PI / 2;
    group.add(walk, at(edges(new THREE.BoxGeometry(s.width + 5.2, 2, 3), color, 0.8), tw.x, tw.y + tall - 4, tw.z));
    (group.children[group.children.length - 1] as THREE.Object3D).rotation.y = turn + Math.PI / 2;
  }
  // Chains from the towers to the ends.
  for (const sx of [-1, 1]) {
    const chain: THREE.Vector3[] = [];
    list.forEach(({ p, side }, k) => {
      const t = k / (list.length - 1);
      const up = t < 0.3 ? (t / 0.3) * (tall - 6) : t > 0.7 ? ((1 - t) / 0.3) * (tall - 6) : tall - 6 - Math.sin(((t - 0.3) / 0.4) * Math.PI) * 3;
      chain.push(new THREE.Vector3(p.x + side.x * (s.width / 2 + 0.6) * sx, p.y + 1 + up, p.z + side.z * (s.width / 2 + 0.6) * sx));
    });
    group.add(line(chain, color, 0.8));
  }
  return group;
}

function steps(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 0.6);
  // Stone underneath, stepped on top: each step level, its front edge glowing on every third.
  group.add(deck(s, list, new THREE.MeshStandardMaterial({ color: "#140e06", roughness: 0.9 }), 3, color).children[0]);
  const step = new THREE.BoxGeometry(s.width, 0.4, 0.62);
  const mesh = new THREE.InstancedMesh(step, stone(color), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const nosing: number[] = [];
  list.forEach(({ p, dir, side }, k) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z));
    m.compose(new THREE.Vector3(p.x, p.y - 0.18, p.z), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(k, m);
    if (k % 3 === 0) nosing.push(p.x - side.x * s.width / 2, p.y + 0.03, p.z - side.z * s.width / 2, p.x + side.x * s.width / 2, p.y + 0.03, p.z + side.z * s.width / 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(nosing, 3));
  group.add(mesh, new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.5 })));
  group.add(balustrade(sides(list, s.width / 2 - 0.2, 3).flat(), color));
  group.add(piers(list, s, 24));
  // Lanterns on posts, every so often, both sides.
  for (let k = 8; k < list.length; k += 16) {
    for (const sx of [-1, 1]) {
      const { p, side } = list[k];
      const x = p.x + side.x * (s.width / 2 + 0.4) * sx, z = p.z + side.z * (s.width / 2 + 0.4) * sx;
      group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3, 6), stone(color)), x, p.y + 1.5, z));
      group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glow(new THREE.Color("#ffe2b0"))), x, p.y + 3.2, z), { pulse: 0.7 }));
    }
  }
  return group;
}

function rainbowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  ["#ff5f6d", "#ffa65f", "#ffe66b", "#6bff95", "#5fd2ff", "#7a7bff", "#c58bff"].forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i / 7) * 128, 0, 128 / 7 + 1, 64);
  });
  g.fillStyle = "rgba(255,255,255,0.5)";
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rainbow(s: Span, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const list = samples(s, 2);
  const texture = rainbowTexture();
  const surface = new THREE.Mesh(ribbon(list.map(({ p }) => p), s.width, 8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  group.add(tag(surface, { scroll: { texture, speed: -0.25 } }));
  for (const sx of [-1, 1]) group.add(line(list.map(({ p, side }) => new THREE.Vector3(p.x + side.x * s.width / 2 * sx, p.y + 0.05, p.z + side.z * s.width / 2 * sx)), new THREE.Color("#ffffff"), 0.9));
  // Rainbow arches overhead, now and then.
  const colors = ["#ff5f6d", "#ffe66b", "#5fd2ff", "#c58bff"];
  for (let k = 8; k < list.length - 4; k += 14) {
    const { p, dir } = list[k];
    colors.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(s.width / 2 + 1 + i * 0.5, 0.09, 6, 40, Math.PI), glow(new THREE.Color(c), 0.8));
      arc.position.copy(p);
      arc.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      group.add(arc);
    });
  }
  // Sparkles drifting over it.
  const rand = seeded("bifrost");
  const sparks = list.flatMap(({ p, side }) => [0, 1].map(() => new THREE.Vector3(p.x + side.x * (rand() - 0.5) * s.width, p.y + 0.5 + rand() * 4, p.z + side.z * (rand() - 0.5) * s.width)));
  group.add(tag(new THREE.Points(new THREE.BufferGeometry().setFromPoints(sparks), new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, color: "#ffffff", size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), { float: 0 }));
  void color;
  return group;
}

const KINDS = { market, suspension, wall, towers, steps, rainbow };

export function bridges(): THREE.Group {
  const group = new THREE.Group();
  for (const s of SPANS) {
    const color = new THREE.Color(s.color);
    group.add(KINDS[s.kind](s, color), nameSigns(s, color));
  }
  return group;
}

// ---------- The lift ----------

export function lifts(): THREE.Group {
  const group = new THREE.Group();
  for (const lift of LIFTS) {
    const color = new THREE.Color(lift.color);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 80; k++) {
      const p = liftAt(lift, k / 80, true);
      pts.push(new THREE.Vector3(p.x, p.y + 1.5, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    // The gravity stream: a glowing tube of moving light.
    const texture = streamTexture("#e2c8ff", "lift");
    texture.repeat.set(1, 1);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 2.2, 16, false), new THREE.MeshBasicMaterial({ map: texture, color: color.clone().multiplyScalar(1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    group.add(tag(tube, { scroll: { texture, speed: 0.6 } }));
    // Rings along the way.
    for (let k = 1; k < 10; k++) {
      const t = k / 10, p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.12, 6, 40), glow(color, 0.85));
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      group.add(tag(ring, { pulse: 1.5 + k * 0.1 }));
    }
    // A pad at each end, a beam of light rising from it.
    for (const [pad, y] of [[lift.a, liftAt(lift, 0, true).y], [lift.b, liftAt(lift, 1, true).y]] as const) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 0.4, 40), stone(color));
      disc.position.set(pad.x, y + 0.2, pad.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 48), glow(color));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.x, y + 0.45, pad.z);
      group.add(disc, tag(ring, { pulse: 1.8 }), at(beam(color, 30, 2.4), pad.x, y, pad.z));
    }
    const board = sign(lift.name, "Step on to float up", color, 12);
    board.position.set(lift.a.x - (lift.b.x - lift.a.x) * 0.06, liftAt(lift, 0, true).y, lift.a.z - (lift.b.z - lift.a.z) * 0.06);
    board.rotation.y = Math.atan2(lift.a.x - lift.b.x, lift.a.z - lift.b.z);
    group.add(board);
  }
  return group;
}
