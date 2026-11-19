// Everyday clothes: the common pieces earned through Axiom's own achievements.
// All local geometry, shaped to sit on every body.
import * as THREE from "three";
import { add, lathe, matte, metal, tubeOf, type Point } from "./greatLibrary";
import type { EverydayFacewear, EverydayHeadwear, EverydayNeckwear, Shell } from "./look";

const TAU = Math.PI * 2;

/** Each piece's own colour, until someone picks another. */
export const HEADWEAR_COLOURS: Record<EverydayHeadwear, string> = { "bucket-hat": "#7f8c69", beret: "#2c3a56", "flat-cap": "#6e5c47", headband: "#ece7dc", "sun-hat": "#e2cc98" };
export const NECKWEAR_COLOURS: Record<EverydayNeckwear, string> = { scarf: "#b4493c", bandana: "#b5362f", "chain-necklace": "#d8b25c", lanyard: "#2f6fb0", "bead-necklace": "#e6dfd0" };
export const FACEWEAR_COLOURS: Record<EverydayFacewear, string> = { "round-glasses": "#b58a4c", aviators: "#c9ccd2", "cat-eye": "#b3344f", "tinted-glasses": "#23262c" };

// ---------- Headwear ----------

/** A short curved peak over the brow. */
function peak(hat: THREE.Object3D, cloth: THREE.Material, edge: THREE.Material, spread: number, reach: number, droop: number, y: number, from: number) {
  const rows = 6, columns = 30, positions: number[] = [], faces: number[] = [], rim: Point[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const out = j / rows, a = -spread + 2 * spread * i / columns, middle = Math.cos(a / spread * Math.PI / 2) ** 0.7;
    const r = from + out * reach * middle, py = y - out * out * droop * (0.3 + 0.7 * middle), point: Point = [Math.sin(a) * r, py, Math.cos(a) * r];
    positions.push(...point);
    if (j === rows) rim.push(point);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    faces.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  add(hat, geometry, cloth);
  add(hat, tubeOf(rim, 0.007, 50), edge);
}

const flatRing = (parent: THREE.Object3D, radius: number, y: number, thickness: number, material: THREE.Material) => {
  const ring = add(parent, new THREE.TorusGeometry(radius, thickness, 6, 72), material, 0, y, 0);
  ring.rotation.x = Math.PI / 2;
  return ring;
};

function bucketHat(hat: THREE.Object3D, cloth: THREE.Material) {
  const stitch = matte("#4e5742");
  add(hat, lathe([[0, 0.47], [0.26, 0.465], [0.46, 0.41], [0.56, 0.26], [0.6, 0.06], [0.7, -0.03], [0.84, -0.12], [0.87, -0.145]]), cloth);
  flatRing(hat, 0.87, -0.145, 0.009, cloth);
  // Rows of stitching round the brim and crown.
  for (const [radius, y] of [[0.665, 0.0], [0.725, -0.05], [0.785, -0.095], [0.845, -0.132], [0.57, 0.22], [0.59, 0.11]]) flatRing(hat, radius, y + 0.004, 0.0032, stitch);
  // Little vents either side.
  for (const side of [-1, 1]) for (const z of [-0.07, 0.07]) {
    const vent = add(hat, new THREE.TorusGeometry(0.015, 0.004, 5, 14), metal("#c9c4b4", "#3a382f", 0.1), side * 0.525, 0.31, z);
    vent.rotation.y = side * 1.1;
  }
}

function beret(hat: THREE.Object3D, cloth: THREE.Material) {
  const tilted = new THREE.Group();
  tilted.position.set(0.05, 0.02, 0);
  tilted.rotation.set(-0.05, 0, -0.17);
  hat.add(tilted);
  add(tilted, lathe([[0, 0.33], [0.22, 0.33], [0.5, 0.29], [0.72, 0.2], [0.78, 0.12], [0.7, 0.055], [0.6, 0.03]]), cloth);
  flatRing(tilted, 0.6, 0.025, 0.028, matte("#1b2438"));
  add(tilted, new THREE.CylinderGeometry(0.011, 0.02, 0.07, 8), cloth, 0, 0.36, 0);
}

function flatCap(hat: THREE.Object3D, cloth: THREE.Material) {
  const seam = matte("#463a2c");
  const lean = (y: number) => 0.13 * y / 0.34;
  const dome = lathe([[0.6, 0.03], [0.62, 0.14], [0.56, 0.24], [0.38, 0.31], [0.16, 0.335], [0, 0.34]]);
  const at = dome.getAttribute("position");
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i), z = at.getZ(i);
    at.setXYZ(i, at.getX(i), y - Math.max(0, z) * 0.08 * Math.min(1, y / 0.2), z + lean(y));
  }
  dome.computeVertexNormals();
  add(hat, dome, cloth);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, line: Point[] = [[0.6, 0.05], [0.615, 0.14], [0.56, 0.245], [0.38, 0.315], [0.16, 0.34], [0, 0.345]].map(([r, y]) => {
      const z = Math.cos(a) * r;
      return [Math.sin(a) * r, y - Math.max(0, z) * 0.08 * Math.min(1, y / 0.2) + 0.002, z + lean(y)];
    });
    add(hat, tubeOf(line, 0.0035, 16), seam);
  }
  add(hat, new THREE.SphereGeometry(0.028, 10, 8), cloth, 0, 0.345, lean(0.34)).scale.y = 0.55;
  flatRing(hat, 0.6, 0.035, 0.007, seam);
  peak(hat, cloth, seam, 0.82, 0.27, 0.075, 0.05, 0.58);
}

function headband(hat: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const stripe = matte("#c8452f");
  // On the orb it follows the curve of the head; elsewhere it sits round the top.
  const [top, bottom, y] = shape === "orb" ? [0.55, 0.715, -0.1] : [0.53, 0.61, 0.02], height = 0.17, middle = (top + bottom) / 2;
  add(hat, new THREE.CylinderGeometry(top, bottom, height, 64, 1, true), cloth, 0, y, 0);
  add(hat, new THREE.CylinderGeometry(middle - (bottom - top) * 0.15 + 0.004, middle + (bottom - top) * 0.15 + 0.004, 0.05, 64, 1, true), stripe, 0, y, 0);
  flatRing(hat, top, y + height / 2, 0.009, cloth);
  flatRing(hat, bottom, y - height / 2, 0.009, cloth);
  // Tied at the back, with two loose ends.
  add(hat, new THREE.SphereGeometry(0.052, 12, 8), cloth, 0, y, -middle - 0.012).scale.set(1.15, 0.85, 0.7);
  for (const side of [-1, 1]) add(hat, tubeOf([[side * 0.02, y - 0.01, -middle - 0.035], [side * 0.08, y - 0.1, -middle - 0.07], [side * 0.11, y - 0.22, -middle - 0.06]], 0.018, 10), cloth);
}

function sunHat(hat: THREE.Object3D, cloth: THREE.Material) {
  const ribbon = matte("#b5473c"), weave = matte("#bfa66f");
  add(hat, lathe([[0, 0.36], [0.24, 0.36], [0.42, 0.32], [0.5, 0.2], [0.54, 0.05]]), cloth);
  // A wide brim with a soft, uneven droop.
  const rows = 10, columns = 96, positions: number[] = [], faces: number[] = [], rim: Point[] = [];
  const brim = (s: number, a: number): Point => { const r = 0.52 + s * 0.5, y = 0.045 - s * 0.05 + Math.sin(a * 5 + 1) * 0.038 * s * s; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) positions.push(...brim(j / rows, i / columns * TAU));
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    faces.push(a, a + 1, b + 1, a, b + 1, b);
  }
  for (let i = 0; i < columns; i++) rim.push(brim(1, i / columns * TAU));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  add(hat, geometry, cloth);
  add(hat, tubeOf(rim, 0.009, 120, true), cloth);
  // Rings of straw, and the ribbon with its bow at the side.
  for (const s of [0.2, 0.4, 0.6, 0.8]) add(hat, tubeOf(Array.from({ length: 48 }, (_, i) => { const [x, y, z] = brim(s, i / 48 * TAU); return [x, y + 0.004, z] as const; }), 0.0032, 96, true), weave);
  for (const [r, y] of [[0.3, 0.348], [0.43, 0.3]]) flatRing(hat, r, y, 0.0032, weave);
  add(hat, new THREE.CylinderGeometry(0.522, 0.546, 0.09, 56, 1, true), ribbon, 0, 0.1, 0);
  const bow = new THREE.Group();
  bow.position.set(0.5, 0.1, 0.17);
  bow.rotation.y = 1.25;
  hat.add(bow);
  for (const side of [-1, 1]) {
    add(bow, new THREE.TorusGeometry(0.05, 0.016, 6, 16), ribbon, side * 0.058, 0, 0).scale.y = 0.62;
    add(bow, tubeOf([[side * 0.01, -0.01, 0], [side * 0.05, -0.09, 0.005], [side * 0.075, -0.15, 0]], 0.014, 8), ribbon);
  }
  add(bow, new THREE.SphereGeometry(0.024, 10, 8), ribbon);
}

export function everydayHat(id: EverydayHeadwear, hat: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  if (id === "headband") headband(hat, cloth, shape);
  else ({ "bucket-hat": bucketHat, beret, "flat-cap": flatCap, "sun-hat": sunHat })[id](hat, cloth);
}

// ---------- Neckwear ----------

/** How far forward each body's surface is at a point, measured from where neckwear hangs. */
const surfaceOf = (shape: Shell) => (x: number, y: number) => {
  if (shape === "prism") return -0.065;
  if (shape === "pyramid") return (0.925 - Math.max(-0.925, y - 0.72)) * 0.451 - 0.83;
  if (shape === "drop") {
    const t = Math.min(1, Math.max(0, (y - 0.48 + 1) / 1.95)), r = Math.sin(Math.PI * t) * (0.42 + 0.42 * t);
    return Math.sqrt(Math.max(0.01, r * r - x * x)) - 0.52;
  }
  const down = y - 0.64;
  return Math.sqrt(Math.max(0.01, 0.7744 - x * x - down * down)) - 0.68;
};
/** Points along a curve lying on the body: `rise` is how far its ends climb. */
const across = (shape: Shell, width: number, low: number, rise: number, lift: number, count = 25) => {
  const surface = surfaceOf(shape);
  return Array.from({ length: count }, (_, i): Point => {
    const t = i / (count - 1) * 2 - 1, x = t * width, y = low + rise * t * t;
    return [x, y, surface(x, y) + lift];
  });
};
/** How far forward something hanging straight down must sit to clear the body all the way. */
const hangingAt = (shape: Shell, x: number, top: number, bottom: number) => { const surface = surfaceOf(shape); return Math.max(surface(x, top), surface(x, bottom)); };
/** A soft rolled length of cloth, rounded off at both ends. */
function roll(neck: THREE.Object3D, points: Point[], radius: number, cloth: THREE.Material) {
  add(neck, tubeOf(points, radius, 60), cloth);
  for (const end of [points[0], points[points.length - 1]]) add(neck, new THREE.SphereGeometry(radius, 12, 8), cloth, ...end);
}
function strap(parent: THREE.Object3D, a: Point, b: Point, width: number, material: THREE.Material) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), along = to.clone().sub(from);
  const part = add(parent, new THREE.BoxGeometry(width, along.length(), 0.006), material);
  part.position.copy(from).addScaledVector(along, 0.5);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
  return part;
}

function scarf(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const cream = matte("#efe6d4");
  roll(neck, across(shape, 0.62, 0.02, 0.2, 0.05), 0.074, cloth);
  roll(neck, across(shape, 0.58, -0.07, 0.2, 0.06), 0.066, cloth);
  const front = hangingAt(shape, 0.15, -0.06, -0.45) + 0.115;
  add(neck, new THREE.SphereGeometry(0.08, 14, 10), cloth, 0.15, -0.06, front).scale.set(1.05, 0.95, 0.7);
  // The loose end, striped and fringed.
  const tail = new THREE.Group();
  tail.position.set(0.16, -0.09, front);
  tail.rotation.z = 0.06;
  neck.add(tail);
  add(tail, new THREE.BoxGeometry(0.17, 0.34, 0.022), cloth, 0, -0.17, 0);
  for (const y of [-0.235, -0.285]) add(tail, new THREE.BoxGeometry(0.172, 0.022, 0.024), cream, 0, y, 0);
  for (let i = 0; i < 8; i++) add(tail, new THREE.CylinderGeometry(0.0045, 0.003, 0.05, 4), cloth, -0.075 + i * 0.0214, -0.363, 0);
}

function bandana(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const white = new THREE.MeshBasicMaterial({ color: "#f4efe6", side: THREE.DoubleSide });
  roll(neck, across(shape, 0.56, 0.05, 0.22, 0.03), 0.03, cloth);
  const z = hangingAt(shape, 0, 0.04, -0.27) + 0.035;
  const fold = new THREE.Shape();
  fold.moveTo(-0.27, 0.05); fold.quadraticCurveTo(0, 0.0, 0.27, 0.05); fold.quadraticCurveTo(0.1, -0.13, 0.015, -0.255); fold.quadraticCurveTo(0, -0.27, -0.015, -0.255); fold.quadraticCurveTo(-0.1, -0.13, -0.27, 0.05);
  add(neck, new THREE.ExtrudeGeometry(fold, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 12 }), cloth, 0, 0, z);
  // A printed edge of dots and small rings.
  const dot = new THREE.CircleGeometry(0.0075, 10), loop = new THREE.RingGeometry(0.012, 0.018, 12);
  for (let i = 0; i <= 8; i++) for (const side of [-1, 1]) {
    const t = i / 8;
    add(neck, dot, white, side * (0.235 - t * 0.22), 0.032 - t * 0.262, z + 0.018);
    if (i % 2 === 0 && i < 8) add(neck, loop, white, side * (0.16 - t * 0.16), 0.0 - t * 0.17, z + 0.018);
  }
  add(neck, new THREE.CircleGeometry(0.018, 12), white, 0, -0.105, z + 0.018);
}

function chainNecklace(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const points = across(shape, 0.5, -0.1, 0.27, 0.014, 45), link = new THREE.TorusGeometry(0.0165, 0.0046, 6, 12);
  points.forEach(([x, y, z], i) => {
    const piece = add(neck, link, cloth, x, y, z);
    piece.scale.x = 1.35;
    piece.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, Math.atan2(2 * 0.27 * x / 0.25, 1));
  });
  const z = hangingAt(shape, 0, -0.1, -0.23) + 0.022;
  add(neck, new THREE.TorusGeometry(0.014, 0.0045, 6, 12), cloth, 0, -0.125, z);
  const medal = add(neck, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 24), cloth, 0, -0.18, z);
  medal.rotation.x = Math.PI / 2;
  add(neck, new THREE.TorusGeometry(0.033, 0.0035, 6, 24), cloth, 0, -0.18, z + 0.006);
}

function lanyard(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const surface = surfaceOf(shape), clip = metal("#c8ccd2", "#35383d", 0.12);
  const white = matte("#f4f3ef", 0.55), ink = matte("#50565f"), photo = matte("#9fb2c2");
  for (const side of [-1, 1]) {
    const line = [0, 1, 2, 3, 4, 5, 6].map((i): Point => { const t = i / 6, x = side * (0.015 + t * 0.42), y = -0.09 + t * t * 0.3 + t * 0.03; return [x, y, surface(x, y) + 0.014]; });
    line.slice(1).forEach((point, i) => strap(neck, line[i], point, 0.042, cloth));
  }
  const z = hangingAt(shape, 0, -0.09, -0.44) + 0.022;
  add(neck, new THREE.BoxGeometry(0.034, 0.05, 0.016), clip, 0, -0.112, z);
  add(neck, new THREE.TorusGeometry(0.014, 0.004, 6, 12), clip, 0, -0.148, z);
  const card = new THREE.Group();
  card.position.set(0, -0.3, z);
  neck.add(card);
  add(card, new THREE.BoxGeometry(0.2, 0.27, 0.012), white);
  add(card, new THREE.BoxGeometry(0.2, 0.048, 0.014), cloth, 0, 0.111, 0);
  add(card, new THREE.BoxGeometry(0.075, 0.09, 0.003), photo, -0.05, 0.022, 0.0075);
  for (const [x, y, w] of [[0.05, 0.05, 0.075], [0.05, 0.022, 0.075], [0.05, -0.006, 0.05], [0, -0.058, 0.165], [-0.02, -0.088, 0.125]]) add(card, new THREE.BoxGeometry(w, 0.009, 0.002), ink, x, y, 0.0072);
}

function beadNecklace(neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  const painted = ["#d94f4f", "#f2b544", "#3fa7a0", "#5b6fd6"].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.32 }));
  const wood = matte("#8d6a45", 0.6), big = new THREE.SphereGeometry(0.034, 14, 10), small = new THREE.SphereGeometry(0.016, 10, 8);
  across(shape, 0.5, -0.08, 0.25, 0.026, 41).forEach(([x, y, z], i) => {
    if (i % 2) { add(neck, small, wood, x, y, z); return; }
    add(neck, big, i % 8 === 0 ? cloth : painted[(i / 2) % 4], x, y, z);
  });
}

export function everydayNeckwear(id: EverydayNeckwear, neck: THREE.Object3D, cloth: THREE.Material, shape: Shell) {
  ({ scarf, bandana, "chain-necklace": chainNecklace, lanyard, "bead-necklace": beadNecklace })[id](neck, cloth, shape);
}

// ---------- Facewear ----------

type Outline = (pen: THREE.Shape, k: number) => void;
const glass = (color: string, opacity: number) => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });

/** A pair of frames from one lens shape, drawn for the right eye and mirrored for the left. */
function frames(face: THREE.Object3D, frame: THREE.Material, lens: THREE.Material, outline: Outline, rim: number, thick = 0.024, templeY = 0.08) {
  const shapeOf = (k: number) => { const pen = new THREE.Shape(); outline(pen, k); return pen; };
  const front = shapeOf(1);
  front.holes.push(shapeOf(rim));
  const geometry = new THREE.ExtrudeGeometry(front, { depth: thick, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 18 });
  const pane = new THREE.ShapeGeometry(shapeOf(rim), 18);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.22, 0.035, 0);
    eye.scale.x = side;
    face.add(eye);
    add(eye, geometry, frame);
    add(eye, pane, lens, 0, 0, 0.012);
    add(face, tubeOf([[side * 0.39, templeY, 0.008], [side * 0.5, templeY + 0.015, -0.07], [side * 0.54, templeY - 0.03, -0.19]], 0.012, 12), frame);
  }
}

function roundGlasses(face: THREE.Object3D, frame: THREE.Material) {
  const lens = glass("#dff0f2", 0.14);
  frames(face, frame, lens, (pen, k) => pen.absarc(0, 0, 0.142 * k, 0, TAU, false), 0.88, 0.012, 0.05);
  add(face, tubeOf([[-0.082, 0.07, 0.012], [-0.04, 0.1, 0.018], [0, 0.108, 0.02], [0.04, 0.1, 0.018], [0.082, 0.07, 0.012]], 0.0085, 16), frame);
  const pad = metal("#e6e3db", "#3a382f", 0.1);
  for (const side of [-1, 1]) add(face, new THREE.SphereGeometry(0.012, 8, 6), pad, side * 0.075, -0.015, 0.012).scale.y = 1.5;
}

function aviators(face: THREE.Object3D, frame: THREE.Material) {
  const lens = glass("#24313a", 0.84);
  frames(face, frame, lens, (pen, k) => {
    pen.moveTo(-0.125 * k, 0.1 * k); pen.lineTo(0.12 * k, 0.116 * k); pen.quadraticCurveTo(0.192 * k, 0.1 * k, 0.186 * k, 0.015 * k);
    pen.quadraticCurveTo(0.175 * k, -0.125 * k, 0.05 * k, -0.142 * k); pen.quadraticCurveTo(-0.1 * k, -0.15 * k, -0.138 * k, -0.02 * k); pen.quadraticCurveTo(-0.155 * k, 0.08 * k, -0.125 * k, 0.1 * k);
  }, 0.92, 0.01, 0.13);
  // The double bridge, and a streak of reflected light.
  add(face, tubeOf([[-0.1, 0.135, 0.012], [0, 0.15, 0.022], [0.1, 0.135, 0.012]], 0.0075, 12), frame);
  add(face, tubeOf([[-0.088, 0.075, 0.012], [0, 0.092, 0.022], [0.088, 0.075, 0.012]], 0.0075, 12), frame);
  const gleam = new THREE.MeshBasicMaterial({ color: "#d9ecf5", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  for (const side of [-1, 1]) add(face, new THREE.PlaneGeometry(0.018, 0.13), gleam, side * 0.26, 0.04, 0.02).rotation.z = -0.5;
}

function catEye(face: THREE.Object3D, frame: THREE.Material) {
  const lens = glass("#f3dfe2", 0.16), stud = metal("#f2d68e", "#7a5a1e", 0.35);
  frames(face, frame, lens, (pen, k) => {
    pen.moveTo(-0.158 * k, 0.025 * k); pen.quadraticCurveTo(-0.125 * k, 0.098 * k, 0.025 * k, 0.096 * k); pen.lineTo(0.178 * k, 0.165 * k);
    pen.quadraticCurveTo(0.197 * k, 0.04 * k, 0.125 * k, -0.052 * k); pen.quadraticCurveTo(0.03 * k, -0.125 * k, -0.082 * k, -0.092 * k); pen.quadraticCurveTo(-0.158 * k, -0.062 * k, -0.158 * k, 0.025 * k);
  }, 0.8, 0.018, 0.13);
  add(face, tubeOf([[-0.075, 0.075, 0.012], [0, 0.09, 0.02], [0.075, 0.075, 0.012]], 0.012, 10), frame);
  for (const side of [-1, 1]) for (const [x, y] of [[0.36, 0.17], [0.335, 0.15]]) add(face, new THREE.OctahedronGeometry(0.0085), stud, side * x, y, 0.036);
}

/** Its lenses take the hologram colour, so they follow the theme. */
function tintedGlasses(face: THREE.Object3D, frame: THREE.Material, tint: THREE.Color) {
  const lens = glass(`#${tint.getHexString()}`, 0.5);
  frames(face, frame, lens, (pen, k) => {
    const w = 0.158 * k, h = 0.118 * k, r = 0.05 * k;
    pen.moveTo(-w + r, h); pen.lineTo(w - r, h); pen.quadraticCurveTo(w, h, w, h - r); pen.lineTo(w, -h + r); pen.quadraticCurveTo(w, -h, w - r, -h); pen.lineTo(-w + r, -h); pen.quadraticCurveTo(-w, -h, -w, -h + r); pen.lineTo(-w, h - r); pen.quadraticCurveTo(-w, h, -w + r, h);
  }, 0.84, 0.018, 0.1);
  add(face, tubeOf([[-0.066, 0.06, 0.012], [0, 0.078, 0.02], [0.066, 0.06, 0.012]], 0.0105, 10), frame);
  return lens;
}

/** Builds the piece; tinted glasses hand back their lens so it can follow the hologram colour. */
export function everydayFacewear(id: EverydayFacewear, face: THREE.Object3D, frame: THREE.Material, tint: THREE.Color) {
  if (id === "round-glasses") roundGlasses(face, frame);
  else if (id === "aviators") aviators(face, frame);
  else if (id === "cat-eye") catEye(face, frame);
  else return tintedGlasses(face, frame, tint);
  return null;
}
