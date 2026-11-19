// The Great Library: the Reading Tracker's rewards, each from a famous old book.
// All local geometry and drawn textures, nothing downloaded.
import * as THREE from "three";
import type { Shell } from "./look";

/** Something that keeps moving: called every frame with the scene's clock. */
export type Ticker = (time: number, dt: number) => void;

const TAU = Math.PI * 2;
export type Point = readonly [number, number, number];

export function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}
export const lathe = (points: number[][], segments = 48, start = 0, length = TAU) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments, start, length);
export const tubeOf = (points: readonly Point[], radius: number, segments = 24, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), closed), segments, radius, 6, closed);
export const metal = (color: string, emissive = "#3b2a10", glow = 0.3) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: glow, metalness: 0.5, roughness: 0.34 });
export const matte = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const shine = (color: string, opacity = 0) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
/** A thin rod between two points. */
function rod(parent: THREE.Object3D, a: Point, b: Point, radius: number, material: THREE.Material) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), along = to.clone().sub(from);
  const part = add(parent, new THREE.CylinderGeometry(radius, radius, along.length(), 5), material);
  part.position.copy(from).addScaledVector(along, 0.5);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
  return part;
}

// ---------- The Invisible Man ----------

/** Griffin's heavy blue goggles, with their side-lights. `frame` takes the facewear colour. */
export function griffinGoggles(face: THREE.Object3D, frame: THREE.Material): Ticker[] {
  const glass = new THREE.MeshPhysicalMaterial({ color: "#123d70", transparent: true, opacity: 0.62, roughness: 0.06, clearcoat: 1, depthWrite: false });
  const steel = metal("#8a8f98", "#22262c", 0.2), leather = matte("#3a2a20");
  const gleamMaterial = shine("#9fd4ff", 0.5);
  const gleams: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.22, 0.035, 0);
    face.add(eye);
    add(eye, lathe([[0.132, -0.02], [0.168, -0.02], [0.174, 0.045], [0.152, 0.09], [0.13, 0.09], [0.132, -0.02]], 40).rotateX(Math.PI / 2), frame);
    add(eye, new THREE.TorusGeometry(0.143, 0.012, 8, 40), frame, 0, 0, 0.09);
    add(eye, new THREE.CircleGeometry(0.135, 36), glass, 0, 0, 0.076).userData.keepColor = true;
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU;
      add(eye, new THREE.SphereGeometry(0.009, 8, 6), steel, Math.cos(angle) * 0.158, Math.sin(angle) * 0.158, 0.05);
    }
    gleams.push(add(eye, new THREE.RingGeometry(0.085, 0.104, 22, 1, 0, 0.95), gleamMaterial, 0, 0, 0.08));
    // The side-lights: a small leather blinker on a hinge.
    const blinker = add(eye, new THREE.BoxGeometry(0.016, 0.13, 0.1), leather, side * 0.178, 0, 0.012);
    blinker.rotation.y = side * 0.4;
    add(eye, new THREE.BoxGeometry(0.02, 0.1, 0.012), frame, side * 0.165, 0, 0.056).rotation.y = side * 0.4;
  }
  add(face, tubeOf([[-0.07, 0.06, 0.05], [0, 0.085, 0.07], [0.07, 0.06, 0.05]], 0.016), frame);
  for (const side of [-1, 1]) add(face, tubeOf([[side * 0.39, 0.05, 0.0], [side * 0.5, 0.07, -0.08], [side * 0.56, 0.05, -0.22]], 0.022), leather);
  return [(time) => gleams.forEach((gleam, i) => { gleam.rotation.z = 0.5 + Math.sin(time * 0.45 + i) * 0.5; })];
}

// ---------- The Divine Comedy ----------

/** A carved half-mask of Hell, Purgatory and Paradise, left to right. */
export function threeRealmsMask(face: THREE.Object3D): Ticker[] {
  const W = 0.62;
  const edgeTop = (x: number) => 0.345 - 0.14 * (x / W) ** 2;
  const edgeBottom = (x: number) => 0.02 - 0.12 * Math.sin(Math.PI * Math.min(1, Math.abs(x) / W));
  const inEye = (x: number, y: number) => ((Math.abs(x) - 0.22) / 0.135) ** 2 + ((y - 0.04) / 0.125) ** 2 < 1;
  const inside = (x: number, y: number) => Math.abs(x) <= W && y <= edgeTop(x) && y >= edgeBottom(x) && !inEye(x, y);
  const depth = (x: number, y: number) => 0.075 - 0.42 * x * x - 0.35 * (y - 0.12) ** 2 + 0.05 * Math.exp(-((x / 0.07) ** 2 + ((y - 0.02) / 0.12) ** 2));
  const char = new THREE.Color("#17120f"), stone = new THREE.Color("#777a83"), gilt = new THREE.Color("#d9ab50");
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  const columns = 110, rows = 50, colour = new THREE.Color();
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const x = -W + 2 * W * i / columns, y = -0.14 + 0.5 * j / rows;
    positions.push(x, y, depth(x, y));
    colour.copy(char).lerp(stone, THREE.MathUtils.smoothstep(x, -0.24, -0.14)).lerp(gilt, THREE.MathUtils.smoothstep(x, 0.14, 0.24));
    colour.multiplyScalar(0.92 + 0.08 * Math.sin(x * 19 + Math.sin(y * 23) * 2));
    colours.push(colour.r, colour.g, colour.b);
  }
  const at = (i: number, j: number) => j * (columns + 1) + i;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const x = -W + 2 * W * (i + 0.5) / columns, y = -0.14 + 0.5 * (j + 0.5) / rows;
    if (inside(x, y)) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  add(face, geometry, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.32, roughness: 0.46, side: THREE.DoubleSide }));

  const gold = metal("#e2b75c", "#7a5216", 0.42);
  const on = (x: number, y: number, lift = 0.008): Point => [x, y, depth(x, y) + lift];
  // A gilded edge hides the carving's outline and finishes it like real metalwork.
  const edge: Point[] = [];
  for (let i = 0; i <= 40; i++) { const x = -W + 2 * W * i / 40; edge.push(on(x, edgeTop(x), 0.004)); }
  for (let i = 40; i >= 0; i--) { const x = -W + 2 * W * i / 40; edge.push(on(x, edgeBottom(x), 0.004)); }
  add(face, tubeOf(edge, 0.011, 180, true), gold);
  for (const side of [-1, 1]) {
    const rim: Point[] = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * TAU, x = side * 0.22 + Math.cos(a) * 0.135, y = 0.04 + Math.sin(a) * 0.125; return on(x, y, 0.006); });
    add(face, tubeOf(rim, 0.009, 60, true), gold);
    // Nine small rings about each eye: the nine circles.
    for (let i = 0; i < 9; i++) {
      const a = 0.12 + i / 8 * (Math.PI - 0.24), x = side * 0.22 + Math.cos(a) * 0.166, y = 0.04 + Math.sin(a) * 0.152;
      add(face, new THREE.TorusGeometry(0.0095, 0.0028, 6, 14), gold, ...on(x, y, 0.009));
    }
  }
  // Inferno: cracks with fire behind them.
  const ember = new THREE.MeshStandardMaterial({ color: "#ff7a2c", emissive: "#ff4a10", emissiveIntensity: 1.4, roughness: 0.5 });
  for (const crack of [[[-0.57, 0.2], [-0.5, 0.15], [-0.47, 0.19], [-0.41, 0.12]], [[-0.55, 0.06], [-0.46, -0.0], [-0.42, 0.02], [-0.39, -0.06]], [[-0.36, 0.3], [-0.32, 0.23], [-0.27, 0.25], [-0.21, 0.19]], [[-0.2, -0.09], [-0.17, -0.05], [-0.13, -0.08]]]) {
    add(face, tubeOf(crack.map(([x, y]) => on(x, y)), 0.0058, 20), ember);
  }
  // Purgatorio: the terraced mountain at the brow.
  const rock = matte("#9c9fa8", 0.7);
  [[0.105, 0.036], [0.086, 0.034], [0.067, 0.032], [0.05, 0.03], [0.034, 0.028], [0.017, 0.028]].forEach(([radius, height], i) => {
    const [x, y, z] = on(0, 0.112 + i * 0.03, 0.016);
    const tier = add(face, new THREE.CylinderGeometry(radius * 0.72, radius, height, 7), rock, x, y, z);
    tier.scale.z = 0.3;
  });
  add(face, new THREE.OctahedronGeometry(0.01), gold, ...on(0, 0.285, 0.022));
  // Paradiso: stars that come and go.
  const starMaterial = new THREE.MeshBasicMaterial({ color: "#fff4cc" });
  const stars = [[0.46, 0.21], [0.53, 0.14], [0.4, 0.27], [0.49, 0.05], [0.42, -0.02], [0.33, 0.28], [0.56, 0.08], [0.19, 0.27], [0.27, -0.08]].map(([x, y]) => add(face, new THREE.OctahedronGeometry(0.012), starMaterial, ...on(x, y, 0.01)));
  // The laurel, across the top.
  add(face, tubeOf(Array.from({ length: 13 }, (_, i) => { const x = -0.48 + i * 0.08; return on(x, edgeTop(x) - 0.022, 0.012); }), 0.0045, 40), gold);
  for (let i = 0; i < 26; i++) {
    const x = -0.46 + i / 25 * 0.92, side = i % 2 ? 1 : -1;
    if (Math.abs(x) < 0.09) continue;
    const leaf = add(face, new THREE.SphereGeometry(1, 8, 6), gold, ...on(x, edgeTop(x) - 0.022 + side * 0.012, 0.014));
    leaf.scale.set(0.024, 0.0085, 0.004);
    leaf.rotation.z = (x < 0 ? 0.5 : -0.5) + side * 0.5;
  }
  return [(time) => {
    ember.emissiveIntensity = 1.15 + Math.sin(time * 5.3) * 0.25 + Math.sin(time * 11.7) * 0.2;
    stars.forEach((star, i) => star.scale.setScalar(0.45 + 0.55 * Math.max(0, Math.sin(time * 1.2 + i * 2.1))));
  }];
}

// ---------- Sherlock Holmes ----------

/** Tweed, drawn here, for the deerstalker: flecked wool with a faint rust check. */
export function tweedMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const pen = canvas.getContext("2d")!;
  pen.fillStyle = "#8f7d60"; pen.fillRect(0, 0, 256, 256);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const flecks = ["#6d5c44", "#a8967a", "#5a4b37", "#b7a789", "#7c6a50"];
  for (let i = 0; i < 5200; i++) {
    pen.fillStyle = flecks[Math.floor(next() * flecks.length)];
    const x = next() * 256, y = next() * 256, along = next() > 0.5;
    pen.fillRect(x, y, along ? 4 : 1.4, along ? 1.4 : 4);
  }
  pen.strokeStyle = "rgba(112, 66, 40, 0.55)"; pen.lineWidth = 2.4;
  for (const at of [64, 192]) { pen.beginPath(); pen.moveTo(at, 0); pen.lineTo(at, 256); pen.moveTo(0, at); pen.lineTo(256, at); pen.stroke(); }
  pen.strokeStyle = "rgba(52, 62, 44, 0.4)"; pen.lineWidth = 1.2;
  for (const at of [0, 128]) { pen.beginPath(); pen.moveTo(at, 0); pen.lineTo(at, 256); pen.moveTo(0, at); pen.lineTo(256, at); pen.stroke(); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  map.repeat.set(3, 2);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.95, emissiveIntensity: 0, side: THREE.DoubleSide });
}

/** One curved peak of the hat, narrowing to a rounded end. */
function hatPeak(facing: number) {
  const rows = 8, columns = 34, spread = 1.08, positions: number[] = [], uvs: number[] = [], faces: number[] = [], rim: Point[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const out = j / rows, a = -spread + 2 * spread * i / columns, middle = Math.cos(a / spread * Math.PI / 2) ** 0.72;
    const r = 0.55 + out * (0.02 + 0.31 * middle), y = 0.07 - out * 0.03 - out * out * 0.135 * (0.35 + 0.65 * middle);
    const x = Math.sin(a + facing) * r, z = Math.cos(a + facing) * r;
    positions.push(x, y, z);
    uvs.push(x * 0.9, z * 0.9);
    if (j === rows) rim.push([x, y, z]);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    faces.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return { geometry, rim };
}

export function deerstalker(hat: THREE.Object3D, tweed: THREE.Material) {
  const dark = matte("#3b3024"), tie = matte("#4c3b29");
  add(hat, lathe([[0.59, 0.02], [0.575, 0.16], [0.51, 0.33], [0.35, 0.47], [0.15, 0.535], [0, 0.545]]), tweed);
  // Six panels, sewn together at the top.
  for (let i = 0; i < 3; i++) {
    const seam = add(hat, new THREE.TorusGeometry(0.545, 0.005, 5, 40, Math.PI), dark, 0, 0.02, 0);
    seam.rotation.y = i * Math.PI / 3;
    seam.scale.set(1.04, 0.98, 1);
  }
  // The two peaks, front and back, with a bound edge.
  for (const facing of [0, Math.PI]) {
    const { geometry, rim } = hatPeak(facing);
    add(hat, geometry, tweed);
    add(hat, tubeOf(rim, 0.0085, 60), dark);
  }
  add(hat, new THREE.TorusGeometry(0.588, 0.007, 6, 72), dark, 0, 0.06, 0).rotation.x = Math.PI / 2;
  // The ear flaps, tied up over the crown with a bow.
  const flap = new THREE.Shape();
  flap.moveTo(-0.18, 0); flap.lineTo(0.18, 0); flap.quadraticCurveTo(0.2, 0.22, 0, 0.29); flap.quadraticCurveTo(-0.2, 0.22, -0.18, 0);
  const flapGeometry = new THREE.ExtrudeGeometry(flap, { depth: 0.018, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 12 });
  const uv = flapGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9);
  for (const side of [-1, 1]) {
    const piece = add(hat, flapGeometry, tweed, side * 0.565, 0.14, 0);
    piece.rotation.set(0, side * Math.PI / 2, side * -0.62, "YXZ");
    add(hat, tubeOf([[side * 0.4, 0.37, 0], [side * 0.25, 0.5, 0.005], [side * 0.02, 0.565, 0.01]], 0.006, 14), tie);
    const loop = add(hat, new THREE.TorusGeometry(0.044, 0.0075, 6, 20), tie, side * 0.052, 0.566, 0.004);
    loop.scale.y = 0.5;
    loop.rotation.set(Math.PI / 2 - 0.12, side * 0.1, 0);
    add(hat, tubeOf([[side * 0.008, 0.56, 0.012], [side * 0.05, 0.552, 0.055], [side * 0.098, 0.532, 0.095]], 0.0048, 8), tie);
  }
  add(hat, new THREE.SphereGeometry(0.016, 10, 8), tie, 0, 0.57, 0.006).scale.set(1.1, 0.75, 1);
}

// ---------- Dracula ----------

const FLARE = 0.55;

/** A tall black collar lined in crimson, with a ruby clasp and a chain. `cloth` takes the neckwear colour. */
export function countsCollar(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const bend = shape === "orb" ? 0.72 : shape === "drop" ? 0.62 : 6;
  /** Stands the collar up and curves it back around the body. */
  const fit = (x: number, y: number, z: number): Point => {
    const up = y * Math.cos(FLARE) - z * Math.sin(FLARE), out = y * Math.sin(FLARE) + z * Math.cos(FLARE), turn = x / bend;
    return [Math.sin(turn) * (bend + out * 0.2), up, out - (1 - Math.cos(turn)) * bend];
  };
  const crimson = new THREE.MeshStandardMaterial({ color: "#8c0f24", emissive: "#3c0610", emissiveIntensity: 0.5, roughness: 0.42, side: THREE.DoubleSide });
  const gold = metal("#d9b163", "#6b4a18", 0.35);
  const wing = (size: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0.03 * size, -0.05 * size);
    shape.bezierCurveTo(0.24 * size, -0.09 * size, 0.47 * size, 0.06 * size, 0.56 * size, 0.47 * size);
    shape.bezierCurveTo(0.4 * size, 0.28 * size, 0.28 * size, 0.2 * size, 0.2 * size, 0.27 * size);
    shape.bezierCurveTo(0.16 * size, 0.17 * size, 0.09 * size, 0.09 * size, 0.03 * size, 0.08 * size);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 22 });
    const at = geometry.getAttribute("position");
    const facing = geometry.getAttribute("normal");
    for (let i = 0; i < at.count; i++) {
      // The light follows the same curve, so the cloth stays smooth.
      const turn = at.getX(i) / bend, nx = facing.getX(i), ny = facing.getY(i), nz = facing.getZ(i);
      const out = ny * Math.sin(FLARE) + nz * Math.cos(FLARE);
      facing.setXYZ(i, nx * Math.cos(turn) + out * Math.sin(turn), ny * Math.cos(FLARE) - nz * Math.sin(FLARE), out * Math.cos(turn) - nx * Math.sin(turn));
      at.setXYZ(i, ...fit(at.getX(i), at.getY(i), at.getZ(i)));
    }
    return geometry;
  };
  const outer = wing(1), inner = wing(0.86);
  // The lining sits inside the black, so a dark edge shows all the way round.
  const edge = [[0.03, 0.08], [0.08, 0.105], [0.135, 0.165], [0.2, 0.265], [0.27, 0.25], [0.36, 0.29], [0.47, 0.38], [0.55, 0.46]];
  for (const side of [-1, 1]) {
    const back = add(neck, outer, cloth, 0, 0.03, 0.01);
    back.scale.x = side;
    const lining = add(neck, inner, crimson, side * 0.035, 0.055, 0.03);
    lining.scale.x = side;
    add(neck, tubeOf(edge.map(([x, y]) => { const [px, py, pz] = fit(x * 0.86, y * 0.86, 0.022); return [side * (px + 0.035), py + 0.055, pz + 0.03] as const; }), 0.0042, 40), gold);
  }
  // A fine chain slung under the clasp.
  const link = new THREE.TorusGeometry(0.0115, 0.0027, 5, 12);
  for (let i = 0; i <= 20; i++) {
    const x = -0.18 + i * 0.018, piece = add(neck, link, gold, x, -0.075 + 0.105 * (x / 0.18) ** 2, 0.066);
    piece.rotation.y = i % 2 ? Math.PI / 2 : 0;
    piece.scale.y = 1.3;
  }
  add(neck, new THREE.TorusGeometry(0.052, 0.012, 8, 24), gold, 0, 0.015, 0.075);
  const ruby = add(neck, new THREE.OctahedronGeometry(0.044), new THREE.MeshStandardMaterial({ color: "#c0122f", emissive: "#6d0515", emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.14 }), 0, 0.015, 0.086);
  ruby.scale.z = 0.5;
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(neck, new THREE.SphereGeometry(0.0065, 6, 5), gold, Math.cos(a) * 0.052, 0.015 + Math.sin(a) * 0.052, 0.09); }
}

// ---------- King Arthur ----------

/** A king's golden helm, ribbed and crowned, with a winged dragon along its crest. `plate` takes the headwear colour. */
export function dragonHelm(hat: THREE.Object3D, plate: THREE.Material): Ticker[] {
  const scale = metal("#b9852a", "#55350a", 0.26), bright = metal("#f0cd7c", "#80591b", 0.28);
  const bone = matte("#f1e6c8", 0.5), ruby = new THREE.MeshStandardMaterial({ color: "#b5142c", emissive: "#5c0612", emissiveIntensity: 0.7, roughness: 0.18, metalness: 0.2 });
  const profile = [[0.605, 0.0], [0.61, 0.1], [0.575, 0.28], [0.465, 0.45], [0.27, 0.575], [0, 0.625]];
  add(hat, lathe(profile), plate);
  // Eight raised ribs from the crown to the brow, riveted down.
  const dome = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const rivet = new THREE.SphereGeometry(0.0115, 8, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU, along = (u: number, lift: number): Point => { const p = dome.getPoint(u); return [Math.sin(a) * (p.x + lift), p.y + lift * 0.6, Math.cos(a) * (p.x + lift)]; };
    add(hat, tubeOf(Array.from({ length: 12 }, (_, j) => along(0.24 + j / 11 * 0.72, 0.004)), 0.0125, 34), bright);
    for (let j = 0; j < 5; j++) add(hat, rivet, scale, ...along(0.3 + j * 0.13, 0.016));
  }
  for (const [y, radius] of [[0.03, 0.613], [0.125, 0.611]]) add(hat, new THREE.TorusGeometry(radius, 0.018, 8, 72), bright, 0, y, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, gem = i % 3 === 0, stud = add(hat, new THREE.OctahedronGeometry(gem ? 0.024 : 0.016), gem ? ruby : i % 2 ? bright : scale, Math.sin(a) * 0.617, 0.078, Math.cos(a) * 0.617);
    stud.rotation.y = a;
  }
  // A crown of points rising from the band.
  const gable = new THREE.ConeGeometry(0.052, 0.115, 4);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, point = add(hat, gable, bright, Math.sin(a) * 0.603, 0.19, Math.cos(a) * 0.603);
    point.rotation.set(-0.12, a + Math.PI / 4, 0, "YXZ");
    point.scale.set(1, 1, 0.2);
    add(hat, new THREE.OctahedronGeometry(0.0095), ruby, Math.sin(a) * 0.617, 0.183, Math.cos(a) * 0.617);
  }
  // The dragon's body, in overlapping scales, from brow to tail.
  const spine = new THREE.CatmullRomCurve3([[0, 0.5, 0.5], [0, 0.69, 0.34], [0, 0.76, 0.08], [0, 0.72, -0.2], [0, 0.57, -0.45], [0.04, 0.34, -0.62], [0.12, 0.17, -0.62], [0.18, 0.11, -0.51], [0.13, 0.15, -0.42]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const bead = new THREE.SphereGeometry(1, 10, 8), spike = new THREE.ConeGeometry(0.02, 0.07, 5);
  for (let i = 0; i <= 76; i++) {
    const t = i / 76, at = spine.getPointAt(t), thick = 0.092 * (1 - t) ** 0.7 + 0.008;
    const piece = add(hat, bead, i % 2 ? scale : plate, at.x, at.y, at.z);
    piece.scale.set(thick, thick * 0.92, thick * 1.2);
    if (i % 4 === 0 && t < 0.88) {
      const fin = add(hat, spike, bright, at.x, at.y + thick * 0.95, at.z);
      fin.scale.setScalar(0.5 + thick * 8);
      fin.rotation.x = -0.35;
    }
  }
  // Its head, snarling over the brow.
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.54);
  head.rotation.x = 0.24;
  head.scale.setScalar(1.5);
  hat.add(head);
  add(head, new THREE.SphereGeometry(0.075, 14, 10), plate).scale.set(1, 0.82, 1.1);
  const snout = add(head, new THREE.ConeGeometry(0.058, 0.17, 8), plate, 0, -0.008, 0.12);
  snout.rotation.x = Math.PI / 2;
  snout.scale.x = 0.9;
  const jaw = add(head, new THREE.ConeGeometry(0.04, 0.13, 7), scale, 0, -0.058, 0.082);
  jaw.rotation.x = Math.PI / 2 + 0.42;
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#ffb24a", emissive: "#ff5a12", emissiveIntensity: 1.6 });
  const tooth = new THREE.ConeGeometry(0.0058, 0.024, 4);
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.014, 8, 6), eyeMaterial, side * 0.05, 0.022, 0.05);
    const ridge = add(head, new THREE.ConeGeometry(0.012, 0.075, 5), bright, side * 0.044, 0.046, 0.044);
    ridge.rotation.set(1.24, 0, side * -0.2);
    const horn = add(head, new THREE.ConeGeometry(0.018, 0.17, 7), bright, side * 0.052, 0.088, -0.07);
    horn.rotation.set(-0.95, 0, side * -0.32);
    add(head, new THREE.SphereGeometry(0.006, 5, 4), new THREE.MeshBasicMaterial({ color: "#3a1a05" }), side * 0.016, 0.012, 0.19);
    for (let i = 0; i < 4; i++) add(head, tooth, bone, side * (0.032 - i * 0.006), -0.047 - i * 0.0005, 0.07 + i * 0.03).rotation.x = Math.PI;
  }
  // Its wings, raised either side of the helm.
  const membrane = new THREE.MeshStandardMaterial({ color: "#a8741f", emissive: "#4a2d08", emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.42, side: THREE.DoubleSide });
  const wing = new THREE.Shape();
  wing.moveTo(0, 0); wing.quadraticCurveTo(0.1, 0.38, 0.46, 0.54); wing.quadraticCurveTo(0.37, 0.38, 0.41, 0.25);
  wing.quadraticCurveTo(0.31, 0.26, 0.31, 0.12); wing.quadraticCurveTo(0.21, 0.15, 0.18, 0.02); wing.quadraticCurveTo(0.08, 0.08, 0, 0);
  const wingGeometry = new THREE.ExtrudeGeometry(wing, { depth: 0.006, bevelEnabled: false, curveSegments: 14 });
  for (const side of [-1, 1]) {
    const raised = new THREE.Group();
    raised.position.set(side * 0.49, 0.3, -0.05);
    raised.rotation.y = side * 0.36;
    raised.scale.x = side;
    hat.add(raised);
    add(raised, wingGeometry, membrane);
    add(raised, tubeOf([[0, 0, 0.008], [0.1, 0.38, 0.008], [0.46, 0.54, 0.008]], 0.011, 20), bright);
    for (const [x, y] of [[0.41, 0.25], [0.31, 0.12], [0.18, 0.02]]) add(raised, tubeOf([[0.02, 0.05, 0.008], [(0.1 + x) / 2, (0.2 + y) / 2, 0.009], [x, y, 0.008]], 0.0058, 12), bright);
    for (const [x, y] of [[0.46, 0.54], [0.41, 0.25], [0.31, 0.12], [0.18, 0.02]]) { const claw = add(raised, new THREE.ConeGeometry(0.009, 0.04, 5), bone, x, y, 0.008); claw.rotation.z = -Math.atan2(x, y) ; }
  }
  return [(time) => { eyeMaterial.emissiveIntensity = 1.5 + Math.sin(time * 3.1) * 0.35 + Math.sin(time * 8.3) * 0.15; }];
}

// ---------- Alice's Adventures in Wonderland ----------

const FACES = [["A", "♠"], ["K", "♥"], ["Q", "♦"], ["J", "♣"], ["10", "♥"], ["7", "♠"], ["3", "♦"], ["A", "♥"]];

/** The playing cards' faces and their shared back, in one drawn sheet of 3 × 3. */
export function cardGeometries() {
  const size = 171;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * 3;
  const pen = canvas.getContext("2d")!;
  const cell = (i: number) => [(i % 3) * size, Math.floor(i / 3) * size] as const;
  FACES.forEach(([rank, suit], i) => {
    const [x, y] = cell(i), red = suit === "♥" || suit === "♦";
    pen.fillStyle = "#f7f1e3"; pen.fillRect(x + 3, y + 3, size - 6, size - 6);
    pen.strokeStyle = "#b9a678"; pen.lineWidth = 3; pen.strokeRect(x + 10, y + 10, size - 20, size - 20);
    pen.fillStyle = red ? "#b8152e" : "#15151c";
    pen.textAlign = "center"; pen.textBaseline = "middle";
    pen.font = "700 34px Georgia, serif"; pen.fillText(rank, x + 36, y + 36); pen.fillText(suit, x + 36, y + 68);
    pen.font = "700 76px Georgia, serif"; pen.fillText(suit, x + size / 2 + 12, y + size / 2 + 22);
  });
  const [bx, by] = cell(8);
  pen.fillStyle = "#7c1730"; pen.fillRect(bx + 3, by + 3, size - 6, size - 6);
  pen.strokeStyle = "#e6c678"; pen.lineWidth = 2;
  pen.strokeRect(bx + 12, by + 12, size - 24, size - 24);
  for (let n = -size; n < size; n += 18) {
    pen.beginPath(); pen.moveTo(bx + 14 + Math.max(0, n), by + 14 + Math.max(0, -n)); pen.lineTo(bx + 14 + Math.min(size - 28, size - 28 + n), by + 14 + Math.min(size - 28, size - 28 - n)); pen.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const plane = (i: number) => {
    const geometry = new THREE.PlaneGeometry(0.15, 0.21), uv = geometry.getAttribute("uv"), [x, y] = cell(i);
    for (let v = 0; v < uv.count; v++) {
      // The card shows the cell's middle portion, in a card's proportions.
      uv.setXY(v, (x + size * (0.14 + uv.getX(v) * 0.72)) / (size * 3), 1 - (y + size * (1 - uv.getY(v))) / (size * 3));
    }
    return geometry;
  };
  return { faces: FACES.map((_, i) => plane(i)), back: plane(8), material: new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide }) };
}

// ---------- The Odyssey ----------

// Each sea is low in the body, with the ship placed to sail clear of Lemma's face.
const SEAS: Record<Shell, { level: number; rx: number; rz: number; scale: number; offset: number; drift: number; top: number }> = {
  orb: { level: -0.64, rx: 0.6, rz: 0.6, scale: 0.6, offset: 0.2, drift: 0.05, top: 0.72 },
  prism: { level: -0.64, rx: 0.66, rz: 0.44, scale: 0.62, offset: 0.24, drift: 0.06, top: 0.72 },
  pyramid: { level: -0.74, rx: 0.74, rz: 0.74, scale: 0.44, offset: 0.56, drift: 0.03, top: 0.3 },
  drop: { level: -0.52, rx: 0.36, rz: 0.36, scale: 0.56, offset: 0, drift: 0.04, top: 0.56 },
};
const crest = (p: number) => (1 - Math.abs(Math.sin(p))) ** 1.6;
/** The height of the sea: long sharp swells, crossed by a second set and a fine chop. */
const seaHeight = (x: number, z: number, t: number) => 0.115 * crest(6.2 * z + 1.6 * Math.sin(2.3 * x + 0.5 * t) - 0.9 * t) + 0.06 * crest(3.4 * x + 1.3 * z + 0.85 * t) + 0.018 * Math.sin(8.3 * x - 1.5 * t + 5 * z);
const SEA_GLSL = `float crest(float p) { return pow(1.0 - abs(sin(p)), 1.6); }
  float seaHeight(vec2 p, float t) { return 0.115 * crest(6.2 * p.y + 1.6 * sin(2.3 * p.x + 0.5 * t) - 0.9 * t) + 0.06 * crest(3.4 * p.x + 1.3 * p.y + 0.85 * t) + 0.018 * sin(8.3 * p.x - 1.5 * t + 5.0 * p.y); }`;

/** A tiny sailor: `pose` is the pivot that leans as they work. */
function sailor(parent: THREE.Object3D, tunic: THREE.Material, skin: THREE.Material, x: number, y: number, z: number, size = 1) {
  const pose = new THREE.Group();
  pose.position.set(x, y, z);
  pose.scale.setScalar(size);
  parent.add(pose);
  add(pose, new THREE.CapsuleGeometry(0.0085, 0.017, 3, 7), tunic, 0, 0.016, 0);
  add(pose, new THREE.SphereGeometry(0.0078, 8, 6), skin, 0, 0.038, 0);
  return pose;
}

/** Odysseus's galley in the storm, with every man aboard. */
function galley() {
  const ship = new THREE.Group();
  ship.rotation.order = "YXZ";
  const pitch = new THREE.MeshStandardMaterial({ color: "#16110f", roughness: 0.42, side: THREE.DoubleSide });
  const deck = matte("#6f4d2e"), ochre = matte("#a5522a", 0.6), timber = matte("#4a3321");
  const bronze = metal("#c08a3e", "#553410", 0.35), rope = matte("#cdb68a"), bone = matte("#efe7d4", 0.6);
  const skin = matte("#c58f64"), tunics = [matte("#d8c7a2"), matte("#8c3a30"), matte("#6d7a62")];
  const L = 0.31;
  const beam = (u: number) => 0.08 * Math.sin(Math.PI * u ** 0.82) ** 0.7 + 0.0015;
  const sheer = (u: number) => 0.03 + 0.075 * (2 * u - 1) ** 4;
  const keel = (u: number) => 0.052 * Math.sin(Math.PI * u) ** 0.5;
  const px = (u: number) => -L + 2 * L * u;

  // The hull, lofted from cross-sections stem to stern.
  const stations = 36, around = 10, hull: number[] = [], faces: number[] = [];
  for (let i = 0; i <= stations; i++) for (let j = 0; j <= around; j++) {
    const u = i / stations, a = j / around * Math.PI;
    hull.push(px(u), sheer(u) - keel(u) * Math.sin(a), beam(u) * Math.cos(a));
  }
  for (let i = 0; i < stations; i++) for (let j = 0; j < around; j++) {
    const a = i * (around + 1) + j, b = a + around + 1;
    faces.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hull, 3));
  hullGeometry.setIndex(faces);
  hullGeometry.computeVertexNormals();
  add(ship, hullGeometry, pitch);
  // The deck and its planks.
  const planks = new THREE.Shape();
  for (let i = 0; i <= 24; i++) { const u = 0.06 + i / 24 * 0.88; const x = px(u), z = beam(u) * 0.94; if (i) planks.lineTo(x, z); else planks.moveTo(x, z); }
  for (let i = 24; i >= 0; i--) { const u = 0.06 + i / 24 * 0.88; planks.lineTo(px(u), -beam(u) * 0.94); }
  const deckMesh = add(ship, new THREE.ShapeGeometry(planks), deck, 0, 0.033, 0);
  deckMesh.rotation.x = Math.PI / 2;
  (deckMesh.material as THREE.Material).side = THREE.DoubleSide;
  for (let i = 1; i < 9; i++) rod(ship, [px(0.1 + i * 0.09), 0.036, -beam(0.1 + i * 0.09) * 0.9], [px(0.1 + i * 0.09), 0.036, beam(0.1 + i * 0.09) * 0.9], 0.0026, timber);
  for (const side of [-1, 1]) {
    // The painted rail, and the shield-row beneath it.
    add(ship, tubeOf(Array.from({ length: 14 }, (_, i) => { const u = 0.03 + i / 13 * 0.94; return [px(u), sheer(u), side * beam(u)] as const; }), 0.0042, 40), ochre);
    for (let i = 0; i < 8; i++) {
      const u = 0.2 + i * 0.085, disc = add(ship, new THREE.CircleGeometry(0.0115, 12), i % 2 ? bronze : ochre, px(u), sheer(u) - 0.012, side * (beam(u) + 0.0012));
      disc.rotation.y = side > 0 ? 0 : Math.PI;
    }
    // The eye on the bow, to see the way.
    const eyeAt = 0.9, eye = add(ship, new THREE.CircleGeometry(0.0145, 16), bone, px(eyeAt), sheer(eyeAt) - 0.022, side * (beam(eyeAt) + 0.0016));
    eye.rotation.y = side > 0 ? 0.28 : Math.PI - 0.28;
    eye.scale.x = 1.45;
    const pupil = add(ship, new THREE.CircleGeometry(0.0072, 12), new THREE.MeshBasicMaterial({ color: "#09090c", side: THREE.DoubleSide }), px(eyeAt) + 0.002, sheer(eyeAt) - 0.022, side * (beam(eyeAt) + 0.0032));
    pupil.rotation.y = eye.rotation.y;
  }
  // The great curved stern, and the bronze ram at the bow.
  add(ship, tubeOf([[-0.3, 0.09, 0], [-0.355, 0.14, 0], [-0.385, 0.2, 0], [-0.36, 0.262, 0], [-0.305, 0.275, 0], [-0.285, 0.245, 0]], 0.0105, 24), pitch);
  for (const offset of [-0.015, 0.015]) add(ship, tubeOf([[-0.36, 0.2, offset], [-0.33, 0.27, offset * 2], [-0.285, 0.3, offset * 3]], 0.0036, 8), ochre);
  add(ship, tubeOf([[0.295, 0.095, 0], [0.335, 0.14, 0], [0.33, 0.185, 0]], 0.008, 12), pitch);
  const ram = add(ship, new THREE.ConeGeometry(0.019, 0.1, 6), bronze, 0.345, -0.006, 0);
  ram.rotation.z = -Math.PI / 2;
  ram.scale.z = 0.7;

  // Mast, yard and the striped sail, hauled half up against the wind.
  const mastX = -0.015;
  rod(ship, [mastX, 0.03, 0], [mastX, 0.37, 0], 0.0058, timber);
  rod(ship, [mastX + 0.012, 0.31, -0.165], [mastX + 0.012, 0.31, 0.165], 0.0044, timber);
  for (const end of [[0.3, 0.095, 0], [-0.28, 0.1, 0]] as const) rod(ship, [mastX, 0.365, 0], end, 0.0013, rope);
  for (const side of [-1, 1]) {
    rod(ship, [mastX + 0.012, 0.31, side * 0.16], [0.1, 0.05, side * 0.07], 0.0011, rope);
    rod(ship, [mastX + 0.012, 0.31, side * 0.16], [-0.12, 0.05, side * 0.07], 0.0011, rope);
    rod(ship, [mastX, 0.34, 0], [mastX, 0.04, side * 0.075], 0.001, rope);
  }
  const sailGeometry = new THREE.PlaneGeometry(0.31, 0.17, 18, 10);
  sailGeometry.rotateY(Math.PI / 2);
  sailGeometry.translate(mastX + 0.016, 0.222, 0);
  const sailColours: number[] = [], cream = new THREE.Color("#e7dcc2"), wine = new THREE.Color("#8d2233"), sailBase = Float32Array.from(sailGeometry.getAttribute("position").array);
  const sailPositions = sailGeometry.getAttribute("position") as THREE.BufferAttribute;
  for (let v = 0; v < sailPositions.count; v++) { const c = Math.floor((sailPositions.getZ(v) + 0.155) / 0.0517) % 2 ? wine : cream; sailColours.push(c.r, c.g, c.b); }
  sailGeometry.setAttribute("color", new THREE.Float32BufferAttribute(sailColours, 3));
  add(ship, sailGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));

  // Twenty oarsmen, ten a side, pulling together.
  const rowers: { pose: THREE.Group; side: number }[] = [], oars: { pivot: THREE.Group; side: number }[] = [];
  const blade = matte("#b89b6c", 0.7);
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
    const u = 0.2 + i * 0.062, x = px(u), rail = beam(u);
    rowers.push({ pose: sailor(ship, tunics[(i + (side > 0 ? 1 : 0)) % 3], skin, x, 0.034, side * rail * 0.58), side });
    const pivot = new THREE.Group();
    pivot.position.set(x, sheer(u) + 0.001, side * rail);
    ship.add(pivot);
    rod(pivot, [0, 0.0, -side * 0.034], [0, -0.062, side * 0.13], 0.0016, timber);
    add(pivot, new THREE.BoxGeometry(0.012, 0.003, 0.03), blade, 0, -0.064, side * 0.14).rotation.x = side * 0.42;
    oars.push({ pivot, side });
  }
  // The helmsman at his two steering oars, and men hauling on the ropes.
  const helmsman = sailor(ship, tunics[2], skin, -0.245, 0.05, 0, 1.08);
  for (const side of [-1, 1]) {
    rod(ship, [-0.25, 0.082, side * 0.012], [-0.25, 0.1, side * 0.06], 0.0016, timber);
    rod(ship, [-0.25, 0.1, side * 0.06], [-0.325, -0.05, side * 0.078], 0.0022, timber);
    add(ship, new THREE.BoxGeometry(0.032, 0.01, 0.003), blade, -0.33, -0.06, side * 0.078);
  }
  const haulers = [sailor(ship, tunics[0], skin, 0.13, 0.036, 0.022), sailor(ship, tunics[1], skin, 0.17, 0.036, -0.02), sailor(ship, tunics[2], skin, -0.14, 0.036, 0.018)];

  // Odysseus, lashed to the mast: helmed and cloaked, the ropes tight around him.
  const hero = sailor(ship, matte("#2f4b70"), skin, mastX + 0.014, 0.04, 0, 1.35);
  add(hero, new THREE.SphereGeometry(0.0086, 8, 5, 0, TAU, 0, Math.PI / 2), bronze, 0, 0.04, 0);
  const crest = add(hero, new THREE.TorusGeometry(0.0085, 0.0022, 5, 12, Math.PI), new THREE.MeshStandardMaterial({ color: "#a01c2a" }), 0, 0.044, 0);
  crest.rotation.y = 0;
  const cloak = add(hero, new THREE.ConeGeometry(0.014, 0.034, 8, 1, true), new THREE.MeshStandardMaterial({ color: "#a01c2a", side: THREE.DoubleSide, roughness: 0.7 }), -0.006, 0.018, 0);
  cloak.scale.z = 0.8;
  for (const y of [0.012, 0.022, 0.032]) add(hero, new THREE.TorusGeometry(0.0125, 0.0015, 4, 14), rope, -0.003, y, 0).rotation.x = Math.PI / 2;

  const tick = (t: number) => {
    const stroke = Math.sin(t * 4.2), lift = Math.cos(t * 4.2);
    for (const { pose, side } of rowers) pose.rotation.z = stroke * 0.4 * (side ? 1 : 1);
    for (const { pivot, side } of oars) { pivot.rotation.y = side * stroke * 0.42; pivot.rotation.x = side * Math.max(0, lift) * 0.22; }
    helmsman.rotation.x = Math.sin(t * 1.1) * 0.25;
    haulers.forEach((man, i) => { man.rotation.z = -0.3 + Math.sin(t * 3 + i * 1.7) * 0.32; });
    hero.rotation.x = Math.sin(t * 2.6) * 0.14;
    cloak.rotation.z = 0.3 + Math.sin(t * 7) * 0.22;
    // The sail strains and shakes in the gale.
    for (let v = 0; v < sailPositions.count; v++) {
      const z = sailBase[v * 3 + 2], y = sailBase[v * 3 + 1], hang = (0.31 - y) / 0.17, across = 1 - (z / 0.155) ** 2;
      sailPositions.setX(v, sailBase[v * 3] + (0.044 * across + 0.012 * Math.sin(t * 9 + z * 40 + y * 30)) * (0.25 + hang));
      sailPositions.setY(v, y + 0.004 * hang * Math.sin(t * 11 + z * 50));
    }
    sailPositions.needsUpdate = true;
    sailGeometry.computeVertexNormals();
  };
  return { ship, tick };
}

/** The Voyage of Odysseus: a storm in a clear globe, and one ship fighting through it. */
export function odysseyVoyage(body: THREE.Object3D, shell: THREE.BufferGeometry, shape: Shell) {
  const sea = SEAS[shape];
  const group = new THREE.Group();
  body.add(group);
  const flash = { value: 0 }, clock = { value: 0 };
  // The storm sky, painted on the inside of the far wall.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { time: clock, flash, level: { value: sea.level } },
    vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float time; uniform float flash; uniform float level; varying vec3 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float clouds(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main() {
        if (vP.y < level) { gl_FragColor = vec4(vec3(0.05, 0.02, 0.08) + vec3(0.05, 0.03, 0.09) * flash, 1.0); return; }
        vec2 p = vec2(vP.x * 2.1 + vP.z * 1.3 + time * 0.1, vP.y * 2.8 - time * 0.04);
        float c = clouds(p + clouds(p * 0.7 + time * 0.07) * 0.9);
        vec3 sky = mix(vec3(0.03, 0.035, 0.075), vec3(0.3, 0.3, 0.41), smoothstep(0.36, 0.76, c));
        sky = mix(sky, sky * 1.35 + vec3(0.04, 0.02, 0.05), smoothstep(0.22, -0.2, vP.y - level - 0.2));
        sky += vec3(0.75, 0.72, 0.95) * flash * (0.25 + c);
        gl_FragColor = vec4(sky, 1.0); }`,
  });
  add(group, shell, skyMaterial).scale.setScalar(0.972);

  // The water filling the lower globe, seen through the glass from any side.
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: clock, flash, level: { value: sea.level } },
    vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float time; uniform float flash; uniform float level; varying vec3 vP;
      void main() {
        float below = level - vP.y;
        if (below < 0.0) discard;
        float swirl = sin(vP.x * 11.0 + vP.z * 9.0 + vP.y * 17.0 + time * 0.7) * sin(vP.z * 13.0 - vP.x * 7.0 - time * 0.5);
        vec3 colour = mix(vec3(0.2, 0.05, 0.19), vec3(0.03, 0.012, 0.06), smoothstep(0.0, 0.42, below)) + vec3(0.035, 0.01, 0.035) * swirl;
        colour = mix(colour, vec3(0.9, 0.87, 0.93), smoothstep(0.016, 0.0, below + 0.005 * sin(atan(vP.x, vP.z) * 26.0 + time * 2.0)));
        gl_FragColor = vec4(colour + vec3(0.2, 0.18, 0.28) * flash, 1.0); }`,
  });
  add(group, shell, waterMaterial).scale.setScalar(0.968);

  // One rolling surface, cut to fit this body exactly and meeting the glass all round.
  const probe = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld();
  const caster = new THREE.Raycaster(), samples = 48;
  const rim = Array.from({ length: samples }, (_, i) => {
    const a = i / samples * TAU;
    caster.set(new THREE.Vector3(0, sea.level, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    return (caster.intersectObject(probe)[0]?.distance ?? sea.rx) * 0.968;
  });
  const size = sea.scale / 1.05, rings = 48, spokes = 144;
  const surface: number[] = [0, 0, 0], out: number[] = [0], faces: number[] = [];
  for (let j = 1; j <= rings; j++) for (let i = 0; i < spokes; i++) {
    const s = j / rings, a = i / spokes * TAU, at = i / spokes * samples, low = Math.floor(at) % samples, high = (low + 1) % samples;
    const r = THREE.MathUtils.lerp(rim[low], rim[high], at - Math.floor(at)) * s;
    surface.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    out.push(s);
  }
  const vertex = (j: number, i: number) => 1 + (j - 1) * spokes + (i % spokes);
  for (let i = 0; i < spokes; i++) faces.push(0, vertex(1, i + 1), vertex(1, i));
  for (let j = 1; j < rings; j++) for (let i = 0; i < spokes; i++) faces.push(vertex(j, i), vertex(j, i + 1), vertex(j + 1, i + 1), vertex(j, i), vertex(j + 1, i + 1), vertex(j + 1, i));
  const seaGeometry = new THREE.BufferGeometry();
  seaGeometry.setAttribute("position", new THREE.Float32BufferAttribute(surface, 3));
  seaGeometry.setAttribute("aOut", new THREE.Float32BufferAttribute(out, 1));
  seaGeometry.setIndex(faces);
  const seaMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { time: clock, flash, size: { value: size } },
    vertexShader: `attribute float aOut; uniform float time; uniform float size; varying float vC; varying vec2 vP; varying vec3 vN; ${SEA_GLSL}
      void main() { vec2 p = position.xz; float h = seaHeight(p, time), e = 0.012, keep = 1.0 - pow(aOut, 4.0);
        vC = h / 0.135; vP = p;
        vN = normalize(normalMatrix * normalize(vec3(-(seaHeight(p + vec2(e, 0.0), time) - h) / e * size * keep, 1.0, -(seaHeight(p + vec2(0.0, e), time) - h) / e * size * keep)));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, h * size * keep, p.y, 1.0); }`,
    fragmentShader: `uniform float time; uniform float flash; varying float vC; varying vec2 vP; varying vec3 vN;
      void main() {
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float lit = max(dot(n, normalize(vec3(-0.35, 0.65, 0.65))), 0.0);
        vec3 colour = mix(vec3(0.075, 0.024, 0.105), vec3(0.36, 0.1, 0.29), smoothstep(0.05, 0.82, vC)) * (0.55 + 0.75 * lit) + vec3(0.5, 0.4, 0.58) * pow(lit, 26.0) * 0.3;
        float edge = vC + 0.06 * sin(vP.x * 17.0 + vP.y * 11.0 + time * 1.4) + 0.03 * sin(vP.x * 43.0 - vP.y * 29.0 - time * 2.2);
        float lace = smoothstep(0.62, 0.95, 0.5 + 0.5 * sin(vP.x * 27.0 + vP.y * 36.0 + time * 0.7)) * smoothstep(0.34, 0.62, vC);
        colour = mix(colour, vec3(0.93, 0.9, 0.95), max(smoothstep(0.7, 0.93, edge), lace * 0.18));
        gl_FragColor = vec4(colour + vec3(0.3, 0.28, 0.4) * flash * (0.4 + 0.6 * clamp(vC, 0.0, 1.0)), 1.0); }`,
  });
  const seaSurface = add(group, seaGeometry, seaMaterial, 0, sea.level, 0);
  seaSurface.frustumCulled = false;
  const heightAt = (x: number, z: number, t: number) => {
    const s = Math.min(1, Math.hypot(x / sea.rx, z / sea.rz));
    return seaHeight(x, z, t) * size * (1 - s ** 4);
  };

  const { ship, tick: sail } = galley();
  ship.scale.setScalar(sea.scale);
  // Three-quarters on, so both the hull and the sail can be seen.
  const YAW = 0.62, shipZ = sea.rz * 0.12;
  ship.rotation.y = -YAW;
  group.add(ship);
  const lit = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  ship.traverse((part) => {
    const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (material?.isMeshStandardMaterial && !lit.has(material)) lit.set(material, material.emissive.clone());
  });
  const white = new THREE.Color("#dcd8f2");

  // Driving rain, spray at the bow, and three forks of lightning.
  const rainMaterial = shine("#c9d3ea", 0.55), rainGeometry = new THREE.BoxGeometry(0.0035, 0.085, 0.0035);
  const rain = Array.from({ length: 72 }, (_, i) => ({ drop: add(group, rainGeometry, rainMaterial), a: i * 2.4, r: Math.sqrt((i + 0.5) / 72), speed: 1.05 + (i % 5) * 0.11, seed: i * 0.137 }));
  const sprayMaterial = new THREE.MeshBasicMaterial({ color: "#f1eef6" }), sprayGeometry = new THREE.OctahedronGeometry(0.01);
  const spray = Array.from({ length: 16 }, () => add(group, sprayGeometry, sprayMaterial));
  const boltMaterial = new THREE.MeshBasicMaterial({ color: "#efeaff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const fork = (points: THREE.Vector3[], radius: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "catmullrom", 0), 26, radius, 5, false);
  const bolts = [[-0.34, -0.2, -0.3, -0.05, -0.17, 0.04], [0.32, 0.14, 0.24, 0.02, 0.08, -0.04], [0.02, -0.12, 0.1, 0.05, -0.04, 0.0]].map((xs) => {
    const steps = xs.length - 1, wide = shape === "orb" || shape === "prism" ? 1 : 0.6;
    const points = xs.map((x, i) => new THREE.Vector3(x * wide, sea.top - (sea.top - sea.level - 0.12) * (i / steps) * 0.92, -sea.rz * 0.5 + (i % 2) * 0.05));
    const bolt = add(group, fork(points, 0.008), boltMaterial);
    const from = points[2], side = from.x > 0 ? -1 : 1;
    bolt.add(new THREE.Mesh(fork([from, from.clone().add(new THREE.Vector3(side * 0.09, -0.1, 0)), from.clone().add(new THREE.Vector3(side * 0.08, -0.2, 0.01))], 0.0045), boltMaterial));
    bolt.visible = false;
    return bolt;
  });

  const tick: Ticker = (t) => {
    clock.value = t;
    // Held back by the gale, it climbs each swell and crashes down the far side.
    const x = sea.offset + Math.sin(t * 0.17) * sea.drift, step = 0.09 * sea.scale, ax = Math.cos(YAW) * step, az = Math.sin(YAW) * step;
    ship.position.set(x, sea.level + 0.06 * sea.scale + heightAt(x, shipZ, t) * 0.95, shipZ);
    ship.rotation.z = Math.atan2(heightAt(x + ax, shipZ + az, t) - heightAt(x - ax, shipZ - az, t), 2 * step) * 0.8 + Math.sin(t * 1.15) * 0.07;
    ship.rotation.x = -Math.atan2(heightAt(x - az, shipZ + ax, t) - heightAt(x + az, shipZ - ax, t), 2 * step) * 0.6 + Math.sin(t * 0.83) * 0.1;
    sail(t);

    const cycle = 6.5, phase = t % cycle, strike = Math.floor(t / cycle);
    const light = phase < 0.09 ? 1 : phase < 0.16 ? 0.25 : phase < 0.25 ? 0.8 : Math.max(0, 1 - (phase - 0.25) / 0.34) * 0.32;
    flash.value = light;
    boltMaterial.opacity = phase < 0.27 ? light : 0;
    bolts.forEach((bolt, i) => { bolt.visible = phase < 0.27 && strike % bolts.length === i; });
    lit.forEach((base, material) => material.emissive.copy(base).lerp(white, light * 0.34));

    const height = sea.top - sea.level;
    for (const { drop, a, r, speed, seed } of rain) {
      const fall = (t * speed * 0.62 + seed) % 1, y = sea.top - fall * height, up = 1 - fall;
      const narrow = shape === "prism" ? 1 : Math.sqrt(Math.max(0.05, 1 - up * up * 0.82));
      // A pyramid's walls close in steadily, so its rain has to stay inside them.
      const spreadX = shape === "pyramid" ? (0.925 - y) * 0.39 : sea.rx * narrow, spreadZ = shape === "pyramid" ? spreadX : sea.rz * narrow;
      drop.position.set(Math.cos(a) * r * spreadX + fall * 0.09, y, Math.sin(a) * r * spreadZ);
      drop.rotation.z = 0.24;
    }
    const bowX = x + Math.cos(YAW) * 0.345 * sea.scale, bowZ = shipZ + Math.sin(YAW) * 0.345 * sea.scale, bowY = sea.level + heightAt(bowX, bowZ, t) + 0.03 * sea.scale;
    spray.forEach((piece, i) => {
      const life = (t * 1.5 + i / spray.length) % 1, side = i % 2 ? 1 : -1, angle = YAW + side * (0.8 + (i % 3) * 0.28);
      piece.position.set(bowX + Math.cos(angle) * life * 0.15 * sea.scale, bowY + Math.sin(life * Math.PI) * (0.13 + (i % 4) * 0.025) * sea.scale, bowZ + Math.sin(angle) * life * 0.15 * sea.scale);
      piece.scale.setScalar((1 - life) * 1.2 + 0.001);
    });
  };
  tick(3, 0);
  return { group, tick };
}

// ---------- Plato's Republic ----------

/** The Ring of Gyges, and the dust and wind of vanishing. */
export function gygesRing(prop: THREE.Object3D, body: THREE.Object3D, shell: THREE.BufferGeometry) {
  const gold = new THREE.MeshStandardMaterial({ color: "#e8c063", emissive: "#8a5c16", emissiveIntensity: 0.45, metalness: 0.55, roughness: 0.24 });
  const dark = metal("#a97e35", "#442c0c", 0.3);
  // A little stone plinth for it to rest on, in the hand.
  const stand = new THREE.Group();
  prop.add(stand);
  add(stand, new THREE.CylinderGeometry(0.11, 0.135, 0.05, 20), matte("#48505c", 0.55), 0, -0.16, 0);
  add(stand, new THREE.TorusGeometry(0.11, 0.009, 6, 24), dark, 0, -0.135, 0).rotation.x = Math.PI / 2;
  // The ring lives on the body so it can rise and fly.
  const ring = new THREE.Group();
  body.add(ring);
  add(ring, new THREE.TorusGeometry(0.115, 0.0155, 12, 56), gold);
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU, mark = add(ring, new THREE.BoxGeometry(0.004, 0.012, 0.004), dark, Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0.0158);
    mark.rotation.z = a;
  }
  // The setting, which Gyges turned inward to vanish.
  const bezel = new THREE.Group();
  bezel.position.y = 0.134;
  ring.add(bezel);
  add(bezel, new THREE.CylinderGeometry(0.057, 0.044, 0.026, 20), gold);
  const stoneMaterial = new THREE.MeshPhysicalMaterial({ color: "#1b2f4b", emissive: "#2f6aa8", emissiveIntensity: 0.5, roughness: 0.08, clearcoat: 1 });
  add(bezel, new THREE.SphereGeometry(0.049, 20, 12, 0, TAU, 0, Math.PI / 2), stoneMaterial, 0, 0.012, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(bezel, new THREE.ConeGeometry(0.008, 0.032, 5), dark, Math.cos(a) * 0.052, 0.024, Math.sin(a) * 0.052).rotation.set(Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5); }

  const realm = new THREE.Group();
  realm.visible = false;
  body.add(realm);
  // The body comes apart as silver dust, every grain starting from a point on its surface.
  const from = shell.getAttribute("position"), grains = Math.min(900, from.count), step = from.count / grains;
  const homes = new Float32Array(grains * 3), seeds = new Float32Array(grains * 3);
  let seed = 11;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < grains; i++) {
    const at = Math.floor(i * step);
    homes.set([from.getX(at), from.getY(at), from.getZ(at)], i * 3);
    seeds.set([next(), next(), next()], i * 3);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(homes, 3));
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { amount: { value: 0 } },
    vertexShader: `attribute vec3 aSeed; uniform float amount; varying float vA;
      void main() { float t = clamp(amount * 1.5 - (position.y + 1.0) * 0.25 * aSeed.x, 0.0, 1.0);
        vec3 out_ = normalize(position + vec3(0.001)) * (0.25 + aSeed.y * 0.8) + vec3(sin(aSeed.z * 40.0) * 0.3, 0.45 + aSeed.x * 0.5, cos(aSeed.z * 31.0) * 0.3);
        vec4 p = modelViewMatrix * vec4(position + out_ * t * t, 1.0); vA = sin(min(1.0, t * 1.05) * 3.14159);
        gl_PointSize = (1.6 + aSeed.y * 2.6) * 8.0 / -p.z; gl_Position = projectionMatrix * p; }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.84, 0.89, 1.0, vA * 0.8 * (1.0 - d * 2.0)); }`,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  realm.add(dust);
  const windMaterial = shine("#dbe5f5"), windGeometry = new THREE.BoxGeometry(1, 0.006, 0.006);
  const wind = Array.from({ length: 22 }, (_, i) => ({ streak: add(realm, windGeometry, windMaterial, 0, ((i * 0.618) % 1) * 2.2 - 1.1, ((i * 0.382) % 1) * 1.8 - 0.7), speed: 1.1 + (i % 4) * 0.4, seed: i * 0.173, size: 0.16 + (i % 5) * 0.08 }));
  const waveMaterial = shine("#fff0c8");
  const shock = add(realm, new THREE.TorusGeometry(1, 0.016, 8, 100), waveMaterial, 0, 0, 0.9);
  shock.scale.setScalar(0.001);
  return { stand, ring, bezel, stoneMaterial, realm, dustMaterial, wind, windMaterial, shock, waveMaterial };
}

// ---------- A secret ----------

const NOISE_GLSL = `float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }`;

/** A mariner's card: thirty-two points, a fleur-de-lis to the north, and the four winds. */
function compassCard() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const pen = canvas.getContext("2d")!, c = 256;
  pen.fillStyle = "#f3e9d2"; pen.beginPath(); pen.arc(c, c, 254, 0, TAU); pen.fill();
  pen.strokeStyle = "#5d4522"; pen.lineWidth = 4; pen.beginPath(); pen.arc(c, c, 244, 0, TAU); pen.stroke();
  pen.lineWidth = 2; pen.beginPath(); pen.arc(c, c, 204, 0, TAU); pen.stroke();
  for (let i = 0; i < 128; i++) {
    const a = i / 128 * TAU, long = i % 4 === 0;
    pen.lineWidth = long ? 2.6 : 1.1;
    pen.beginPath(); pen.moveTo(c + Math.cos(a) * (long ? 216 : 230), c + Math.sin(a) * (long ? 216 : 230)); pen.lineTo(c + Math.cos(a) * 243, c + Math.sin(a) * 243); pen.stroke();
  }
  // Smaller points first, so the great ones lie on top.
  for (const [count, size, width, offset, darkSide, paleSide] of [[32, 104, 0.1, 0, "#8d7345", "#d9c596"], [16, 130, 0.14, TAU / 32, "#5d4522", "#c9a866"], [8, 158, 0.2, 0, "#7d1f2a", "#e8d6ad"], [4, 198, 0.24, 0, "#1d1b1a", "#f8f1df"]] as const) {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU - Math.PI / 2 + (count === 8 ? TAU / 8 / 2 : count === 16 ? offset : count === 32 ? TAU / 64 : 0);
      for (const [half, colour] of [[-1, darkSide], [1, paleSide]] as const) {
        pen.fillStyle = colour; pen.beginPath(); pen.moveTo(c, c);
        pen.lineTo(c + Math.cos(a) * size, c + Math.sin(a) * size);
        pen.lineTo(c + Math.cos(a + half * width * 1.5) * size * 0.3, c + Math.sin(a + half * width * 1.5) * size * 0.3); pen.closePath(); pen.fill();
      }
    }
  }
  pen.fillStyle = "#1d1b1a"; pen.textAlign = "center"; pen.textBaseline = "middle"; pen.font = "700 30px Georgia, serif";
  pen.fillText("E", c + 224, c); pen.fillText("S", c, c + 224); pen.fillText("W", c - 224, c);
  // The fleur-de-lis at north.
  pen.save(); pen.translate(c, c - 224); pen.fillStyle = "#7d1f2a";
  pen.beginPath(); pen.moveTo(0, -19); pen.quadraticCurveTo(9, -5, 3, 8); pen.lineTo(-3, 8); pen.quadraticCurveTo(-9, -5, 0, -19); pen.fill();
  for (const side of [-1, 1]) { pen.beginPath(); pen.moveTo(side * 3, 6); pen.quadraticCurveTo(side * 19, -8, side * 16, -14); pen.quadraticCurveTo(side * 24, 2, side * 8, 12); pen.closePath(); pen.fill(); }
  pen.fillRect(-11, 11, 22, 4); pen.restore();
  pen.fillStyle = "#c79a4f"; pen.beginPath(); pen.arc(c, c, 13, 0, TAU); pen.fill();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
/** The brass plate inside the lid. */
function engraving() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const pen = canvas.getContext("2d")!;
  pen.fillStyle = "#c79f5a"; pen.fillRect(0, 0, 256, 256);
  pen.strokeStyle = "#7c5a2a"; pen.lineWidth = 3; pen.strokeRect(14, 14, 228, 228); pen.lineWidth = 1; pen.strokeRect(21, 21, 214, 214);
  pen.fillStyle = "#4f3714"; pen.textAlign = "center"; pen.textBaseline = "middle"; pen.font = "italic 600 34px Georgia, serif";
  pen.fillText("Hold", 128, 88); pen.fillText("your", 128, 128); pen.fillText("course.", 128, 168);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
/** The gold rose that blooms on the ground. */
function goldRose() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const pen = canvas.getContext("2d")!, c = 256;
  pen.strokeStyle = "#ffe2a0"; pen.fillStyle = "#ffd777";
  for (const r of [246, 214, 118]) { pen.lineWidth = r === 246 ? 6 : 2.5; pen.beginPath(); pen.arc(c, c, r, 0, TAU); pen.stroke(); }
  for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, inner = i % 6 ? 232 : 216; pen.lineWidth = i % 6 ? 1.5 : 3; pen.beginPath(); pen.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner); pen.lineTo(c + Math.cos(a) * 244, c + Math.sin(a) * 244); pen.stroke(); }
  for (const [count, size, width] of [[8, 150, 0.17], [4, 210, 0.2]] as const) for (let i = 0; i < count; i++) {
    const a = i / count * TAU + (count === 8 ? TAU / 16 : 0);
    pen.globalAlpha = count === 8 ? 0.55 : 0.95; pen.beginPath(); pen.moveTo(c + Math.cos(a) * size, c + Math.sin(a) * size);
    pen.lineTo(c + Math.cos(a + width) * size * 0.25, c + Math.sin(a + width) * size * 0.25); pen.lineTo(c, c); pen.lineTo(c + Math.cos(a - width) * size * 0.25, c + Math.sin(a - width) * size * 0.25); pen.closePath(); pen.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
/** A curved horn, narrowing to a point. */
function hornGeometry(side: number) {
  const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [side * 0.11, 0.1, -0.01], [side * 0.2, 0.26, -0.03], [side * 0.17, 0.44, -0.05]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const rows = 16, around = 8, geometry = new THREE.TubeGeometry(curve, rows, 0.062, around, false), at = geometry.getAttribute("position"), v = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    const centre = curve.getPointAt(j / rows), keep = (1 - j / rows) ** 0.8;
    for (let i = 0; i <= around; i++) { const index = j * (around + 1) + i; v.fromBufferAttribute(at, index).sub(centre).multiplyScalar(keep).add(centre); at.setXYZ(index, v.x, v.y, v.z); }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The True Compass in its box, and everything that happens when the shadow comes for Lemma. */
export function trueCompass(prop: THREE.Object3D, body: THREE.Object3D, shell: THREE.BufferGeometry, face: THREE.Object3D, root: THREE.Object3D) {
  const brass = metal("#c79a4f", "#5e3e12", 0.42), pale = metal("#ecd08c", "#71521f", 0.36);
  const wood = new THREE.MeshStandardMaterial({ color: "#3d1c0d", roughness: 0.62 }), woodEdge = new THREE.MeshStandardMaterial({ color: "#241007", roughness: 0.7 });
  // A ship's compass: a square wooden box with the bowl slung in brass rings.
  const compass = new THREE.Group();
  compass.position.y = 0.09;
  compass.rotation.x = 0.98;
  prop.add(compass);
  add(compass, new THREE.BoxGeometry(0.58, 0.09, 0.58), wood, 0, -0.03, 0);
  for (const [x, z, w, d] of [[0, 0.265, 0.58, 0.05], [0, -0.265, 0.58, 0.05], [0.265, 0, 0.05, 0.48], [-0.265, 0, 0.05, 0.48]]) add(compass, new THREE.BoxGeometry(w, 0.06, d), woodEdge, x, 0.04, z);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    add(compass, new THREE.BoxGeometry(0.075, 0.008, 0.075), brass, x * 0.255, 0.073, z * 0.255);
    add(compass, new THREE.SphereGeometry(0.009, 8, 6), pale, x * 0.262, 0.079, z * 0.262);
  }
  // Two rings on crossed pivots keep the bowl level on a rolling ship.
  const outerRing = add(compass, new THREE.TorusGeometry(0.218, 0.011, 8, 56), brass, 0, 0.05, 0);
  outerRing.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) add(compass, new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8), pale, side * 0.232, 0.05, 0).rotation.z = Math.PI / 2;
  const gimbal = new THREE.Group();
  gimbal.position.y = 0.05;
  compass.add(gimbal);
  const innerRing = add(gimbal, new THREE.TorusGeometry(0.197, 0.008, 8, 56), pale);
  innerRing.rotation.x = Math.PI / 2;
  add(gimbal, new THREE.CylinderGeometry(0.19, 0.15, 0.05, 40), brass, 0, -0.03, 0);
  // Built facing forward, then laid flat, so north is away from whoever holds it.
  const dial = new THREE.Group();
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = -0.003;
  gimbal.add(dial);
  add(dial, new THREE.CircleGeometry(0.186, 56), new THREE.MeshStandardMaterial({ map: compassCard(), roughness: 0.6 }));
  add(dial, new THREE.BoxGeometry(0.008, 0.024, 0.006), pale, 0, 0.176, 0.004);
  const needle = new THREE.Group();
  needle.position.z = 0.014;
  dial.add(needle);
  const north = new THREE.MeshStandardMaterial({ color: "#b42230", emissive: "#5c0c14", emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: "#23272e", metalness: 0.55, roughness: 0.3 });
  const point = (flip: number, material: THREE.Material) => {
    const shape = new THREE.Shape([new THREE.Vector2(-0.018, 0), new THREE.Vector2(0, flip * 0.162), new THREE.Vector2(0.018, 0)]);
    add(needle, new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), material);
  };
  point(1, north); point(-1, tail);
  add(dial, new THREE.SphereGeometry(0.012, 12, 8), pale, 0, 0, 0.022);
  add(dial, new THREE.CircleGeometry(0.19, 40), new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.08, roughness: 0.03, clearcoat: 1, depthWrite: false }), 0, 0, 0.034);
  // The lid, hinged at the back, with the words on a plate inside it.
  const lid = new THREE.Group();
  lid.position.set(0, 0.072, -0.29);
  compass.add(lid);
  add(lid, new THREE.BoxGeometry(0.58, 0.024, 0.58), wood, 0, 0.012, 0.29);
  add(lid, new THREE.BoxGeometry(0.5, 0.004, 0.5), woodEdge, 0, 0.025, 0.29);
  for (const side of [-1, 1]) add(lid, new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), pale, side * 0.17, 0, 0).rotation.z = Math.PI / 2;
  const plateMaterial = new THREE.MeshStandardMaterial({ map: engraving(), emissive: "#ffcf72", emissiveIntensity: 0, emissiveMap: null, roughness: 0.4, metalness: 0.2 });
  add(lid, new THREE.PlaneGeometry(0.46, 0.46), plateMaterial, 0, -0.001, 0.29).rotation.x = Math.PI / 2;

  const clock = { value: 0 };
  // The horned shadow, hidden until it's called for.
  const shadow = new THREE.Group();
  shadow.position.set(0, -0.22, -0.72);
  shadow.visible = false;
  body.add(shadow);
  const form = new THREE.Shape();
  // The same figure as in The Interview: long horns, narrow head, a wide cloak.
  const fx = (x: number) => x / 150, fy = (y: number) => 0.18 - y / 170;
  form.moveTo(fx(-158), fy(170));
  for (const [a, b, c, d, e, f] of [[-150, 92, -122, 22, -68, -8], [-52, -17, -41, -27, -37, -41], [-43, -53, -45, -66, -41, -78], [-72, -88, -116, -114, -128, -168], [-104, -130, -68, -114, -29, -107], [-17, -117, 17, -117, 29, -107], [68, -114, 104, -130, 128, -168], [116, -114, 72, -88, 41, -78], [45, -66, 43, -53, 37, -41], [41, -27, 52, -17, 68, -8], [122, 22, 150, 92, 158, 170]]) form.bezierCurveTo(fx(a), fy(b), fx(c), fy(d), fx(e), fy(f));
  form.closePath();
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#050408", transparent: true, opacity: 0, depthWrite: false });
  const figure = add(shadow, new THREE.ShapeGeometry(form, 24), shadowMaterial);
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(form.getPoints(24).map(p => new THREE.Vector3(p.x, p.y, 0.01))), new THREE.LineBasicMaterial({ color: "#a23244", transparent: true, opacity: 0 }));
  shadow.add(outline);
  const emberMaterial = new THREE.MeshBasicMaterial({ color: "#ff5a22", transparent: true, opacity: 0 });
  for (const side of [-1, 1]) { const eye = add(shadow, new THREE.SphereGeometry(0.038, 10, 8), emberMaterial, side * 0.135, 0.57, 0.02); eye.scale.set(1.5, 0.5, 0.4); eye.rotation.z = side * 0.55; }
  const shardMaterial = new THREE.MeshBasicMaterial({ color: "#07050a" }), shardGeometry = new THREE.TetrahedronGeometry(0.085);
  const shards = Array.from({ length: 26 }, (_, i) => add(shadow, shardGeometry, shardMaterial, Math.sin(i * 2.4) * (0.14 + i * 0.03), 0.2 + Math.cos(i * 1.7) * 0.62, 0.05));
  shards.forEach(piece => { piece.userData.home = piece.position.clone(); piece.visible = false; });

  // What spreads over Lemma: black from the feet up, and later gold the same way.
  shell.computeBoundingBox();
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: { time: clock, dark: { value: 0 }, gold: { value: 0 }, lo: { value: shell.boundingBox!.min.y }, hi: { value: shell.boundingBox!.max.y } },
    vertexShader: "varying vec3 vP; varying vec3 vN; varying vec3 vV; void main() { vP = position; vN = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position, 1.0); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }",
    fragmentShader: `uniform float time; uniform float dark; uniform float gold; uniform float lo; uniform float hi; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE_GLSL}
      void main() {
        float y = (vP.y - lo) / (hi - lo), wob = n(vec2(atan(vP.x, vP.z) * 2.5, vP.y * 3.0 + time * 0.4)) * 0.16;
        float darkEdge = dark * 1.3 - 0.1 - (y + wob), goldEdge = gold * 1.3 - 0.1 - (y + wob);
        if (darkEdge < 0.0 && goldEdge < 0.0) discard;
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        if (goldEdge >= 0.0) {
          float streak = 0.5 + 0.5 * sin(atan(vP.x, vP.z) * 9.0 + vP.y * 7.0 - time * 3.0);
          vec3 c = mix(vec3(0.86, 0.58, 0.16), vec3(1.0, 0.95, 0.74), rim * 0.8 + streak * 0.25);
          gl_FragColor = vec4(c + vec3(0.5, 0.42, 0.2) * smoothstep(0.07, 0.0, goldEdge), 1.0); return; }
        float crack = pow(1.0 - abs(n(vP.xy * 6.0 + vP.z * 4.0 + time * 0.05) * 2.0 - 1.0), 14.0);
        vec3 c = vec3(0.016, 0.01, 0.022) + vec3(0.1, 0.02, 0.09) * rim + vec3(1.0, 0.24, 0.05) * crack * (0.65 + 0.35 * sin(time * 5.0 + vP.y * 4.0));
        gl_FragColor = vec4(c + vec3(0.9, 0.2, 0.05) * smoothstep(0.05, 0.0, darkEdge), 1.0); }`,
  });
  const veil = add(body, shell, veilMaterial);
  veil.scale.setScalar(1.016);
  veil.visible = false;
  const hornMaterial = new THREE.MeshStandardMaterial({ color: "#0d0a10", emissive: "#3a0a08", emissiveIntensity: 0.7, roughness: 0.34, metalness: 0.2 });
  const horns = [-1, 1].map(side => { const horn = add(face, hornGeometry(side), hornMaterial, side * 0.36, 0.25, -0.08); horn.scale.setScalar(0.001); return horn; });

  // On the ground, out from under Lemma.
  const under = new THREE.Group();
  under.position.y = -1.2;
  under.visible = false;
  root.add(under);
  const poolMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { time: clock, spread: { value: 0 }, gold: { value: 0 } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float time; uniform float spread; uniform float gold; varying vec2 vP; ${NOISE_GLSL}
      void main() { float r = length(vP) / 1.5, a = atan(vP.y, vP.x), edge = spread * (0.8 + 0.2 * n(vec2(a * 3.0, time * 0.5)));
        float body_ = smoothstep(edge, edge - 0.05, r); if (body_ <= 0.0) discard;
        vec3 c = vec3(0.012, 0.006, 0.016) + vec3(0.42, 0.05, 0.07) * smoothstep(edge - 0.13, edge, r);
        float crack = pow(1.0 - abs(n(vP * 5.0 + time * 0.08) * 2.0 - 1.0), 10.0) * smoothstep(gold * 1.2, gold * 1.2 - 0.3, r) * step(0.001, gold);
        c += vec3(1.0, 0.76, 0.32) * (crack * 1.4 + gold * 0.28 * (1.0 - r));
        gl_FragColor = vec4(c, body_); }`,
  });
  const pool = add(under, new THREE.CircleGeometry(1.5, 72), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  // Black hands of it, reaching up around the body.
  const grip = new THREE.Group();
  under.add(grip);
  const caster = new THREE.Raycaster(), probe = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld();
  const reach = (a: number, y: number) => { caster.set(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); return caster.intersectObject(probe)[0]?.distance ?? 0.4; };
  const tendrilMaterial = new THREE.MeshBasicMaterial({ color: "#07040a" });
  const tendrils = Array.from({ length: 9 }, (_, i) => {
    const start = i / 9 * TAU, climb = 1.0 + (i % 3) * 0.28, points: THREE.Vector3[] = [new THREE.Vector3(Math.cos(start) * 1.0, 0, Math.sin(start) * 1.0)];
    for (let j = 1; j <= 9; j++) { const t = j / 9, y = t * climb + 0.25, a = start + t * (i % 2 ? 1.5 : -1.5), r = reach(a, y - 1.2) + 0.03; points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 44, 0.026 + (i % 3) * 0.005, 6, false);
    add(grip, geometry, tendrilMaterial);
    return { geometry, length: geometry.index!.count, delay: (i % 4) * 0.12 };
  });
  const roseMaterial = new THREE.MeshBasicMaterial({ map: goldRose(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rose = add(under, new THREE.PlaneGeometry(3, 3), roseMaterial, 0, 0.012, 0);
  rose.rotation.x = -Math.PI / 2;
  const columnMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { time: clock, strength: { value: 0 } },
    vertexShader: "varying vec2 vU; varying vec3 vN; varying vec3 vV; void main() { vU = uv; vN = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position, 1.0); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }",
    fragmentShader: "uniform float time; uniform float strength; varying vec2 vU; varying vec3 vN; varying vec3 vV; void main() { float s = 0.45 + 0.55 * sin(vU.x * 75.0 + time) * sin(vU.x * 31.0 - time * 1.7), soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); gl_FragColor = vec4(1.0, 0.82, 0.46, strength * soft * (0.2 + 0.3 * max(s, 0.0)) * smoothstep(1.0, 0.0, vU.y) * smoothstep(1.0, 0.25, vU.y)); }",
  });
  add(under, new THREE.CylinderGeometry(1.0, 1.08, 3.6, 56, 1, true), columnMaterial, 0, 1.8, 0);
  const sparkSeeds = new Float32Array(150);
  for (let i = 0; i < 150; i++) sparkSeeds[i] = (i * 0.6180339) % 1;
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkSeeds, 3));
  const sparkMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { rise: { value: 0 }, strength: { value: 0 } },
    vertexShader: `uniform float rise; varying float vA; void main() { float t = fract(position.x + rise * (0.7 + position.y)), a = position.z * 6.2832, r = 0.5 + position.y * 0.6;
      vec4 p = modelViewMatrix * vec4(cos(a + t) * r, t * 3.0, sin(a + t) * r, 1.0); vA = 1.0 - t; gl_PointSize = (3.0 + position.y * 5.0) * 16.0 / -p.z; gl_Position = projectionMatrix * p; }`,
    fragmentShader: "uniform float strength; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.86, 0.52, strength * vA * (1.0 - d * 2.0)); }",
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  under.add(sparks);
  // The light from the compass, reaching down into the dark.
  const beamMaterial = shine("#ffe2a0");
  const beamGeometry = new THREE.ConeGeometry(0.26, 1, 28, 1, true);
  beamGeometry.translate(0, -0.5, 0);
  const beam = add(body, beamGeometry, beamMaterial);
  beamMaterial.side = THREE.DoubleSide;
  beam.visible = false;

  const part = {
    lid, needle, gimbal, shadow, figure, shadowMaterial, outline, emberMaterial, shards, beam, beamMaterial, north, compass, plateMaterial,
    veil, veilMaterial, horns, hornMaterial, under, poolMaterial, grip, tendrils, rose, roseMaterial, columnMaterial, sparkMaterial,
    /** Extra turns while the shadow is near, and whether the animation forces the needle still. */
    spin: 0, held: false, steady: false,
    /** Lemma's own face colour, kept while the animation changes it. */
    faceColour: null as THREE.Color | null,
  };
  const gold = new THREE.Color("#f1c35c"), red = new THREE.Color("#b42230");
  let settled = 0, drift = 0;
  const tick: Ticker = (t, dt) => {
    clock.value = t;
    // It wanders until you've done something today, then locks and turns gold.
    const target = part.steady || part.held ? 1 : 0;
    settled += (target - settled) * Math.min(1, dt * 3.2);
    drift = Math.sin(t * 0.73) * 0.85 + Math.sin(t * 1.9 + 1.3) * 0.34 + Math.sin(t * 4.7) * 0.06;
    needle.rotation.z = drift * (1 - settled) + part.spin;
    north.color.copy(red).lerp(gold, settled);
    north.emissive.copy(north.color).multiplyScalar(0.5);
    // The bowl stays level in its rings as the box moves.
    gimbal.rotation.set(Math.sin(t * 1.1) * 0.05, 0, Math.sin(t * 0.83) * 0.05);
  };
  return { ...part, part, tick };
}
