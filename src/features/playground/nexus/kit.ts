// The pieces Nexus's districts are built from: materials, lit windows and
// holographic signs (drawn once on canvases), glowing outlines, arches,
// columns of falling data light and floating holo cubes. Night neon throughout:
// dark stone, bright edges, light that glows.
//
// Anything that moves says how in its `userData` (see `Motion`); the engine
// collects those once when a district's built and moves only them.
import * as THREE from "three";

/** How a piece moves: spins, floats, pulses its glow, or scrolls its texture. */
export interface Motion {
  spin?: number;
  /** Phase of a gentle up-and-down float. */
  float?: number;
  /** Speed of a glow pulse (on its material's opacity or emissive). */
  pulse?: number;
  /** A texture to scroll, and how fast. */
  scroll?: { texture: THREE.Texture; speed: number };
}

export const tag = <T extends THREE.Object3D>(object: T, motion: Motion): T => {
  Object.assign(object.userData, motion);
  return object;
};

/** A seeded random source, so a district looks the same each time it's built. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 100000) / 100000;
}

// ---------- Materials ----------

/** Dark stone, with a faint glow of its district from within. */
export const stone = (tint: THREE.Color) =>
  new THREE.MeshStandardMaterial({ color: "#0b1226", emissive: tint.clone().multiplyScalar(0.3), emissiveIntensity: 0.25, roughness: 0.7, metalness: 0.35 });

/** Darker, for roofs and plinths. */
export const shadow = () => new THREE.MeshStandardMaterial({ color: "#060914", roughness: 0.85, metalness: 0.2 });

/** Glass that catches its district's colour. */
export const glass = (tint: THREE.Color, opacity = 0.22) =>
  new THREE.MeshPhysicalMaterial({ color: tint, transparent: true, opacity, roughness: 0.08, metalness: 0, transmission: 0, side: THREE.DoubleSide, depthWrite: false });

/** Pure light: glows under the bloom. */
export const glow = (color: THREE.Color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: opacity < 1, opacity });

/** A shape's glowing edges. */
export function edges(geometry: THREE.BufferGeometry, color: THREE.Color, opacity = 0.95): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.8), transparent: true, opacity }));
}

/** A solid in dark stone with glowing edges, placed with its base at `y`. */
export function block(geometry: THREE.BufferGeometry, material: THREE.Material, color: THREE.Color, x: number, y: number, z: number): THREE.Group {
  geometry.computeBoundingBox();
  const lift = -geometry.boundingBox!.min.y;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  const line = edges(geometry, color);
  mesh.position.y = line.position.y = lift;
  group.add(mesh, line);
  group.position.set(x, y, z);
  return group;
}

// ---------- Canvas textures ----------

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Rows of windows, some lit; `arched` for the library's tall arched ones. */
export function windows(color: string, columns: number, rows: number, arched = false, seed = "w"): THREE.CanvasTexture {
  const rand = seeded(seed);
  return canvasTexture(columns * 32, rows * 48, (g) => {
    g.fillStyle = "#070b18";
    g.fillRect(0, 0, columns * 32, rows * 48);
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
      const lit = rand() < 0.72;
      g.fillStyle = lit ? color : "#121a33";
      g.globalAlpha = lit ? 0.55 + rand() * 0.45 : 1;
      const x = c * 32 + 8, y = r * 48 + 8, w = 16, h = 32;
      g.beginPath();
      if (arched) {
        g.moveTo(x, y + h);
        g.lineTo(x, y + 8);
        g.arc(x + w / 2, y + 8, w / 2, Math.PI, 0);
        g.lineTo(x + w, y + h);
      } else g.rect(x, y + 6, w, h - 12);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  });
}

/** A holographic sign: a name in big letters and a line beneath, like the city's district gates. */
export function signTexture(title: string, subtitle: string, color: string): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (g) => {
    g.fillStyle = "rgba(4, 7, 18, 0.82)";
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(10, 10, 1004, 236);
    g.lineWidth = 2;
    g.strokeRect(24, 24, 976, 208);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.font = "600 92px Georgia, 'Times New Roman', serif";
    g.fillText(title.toUpperCase(), 512, 132);
    g.shadowBlur = 10;
    g.fillStyle = color;
    g.font = "500 34px Georgia, serif";
    g.fillText(`·  ${subtitle.toUpperCase()}  ·`, 512, 196);
  });
}

/** Falling data: streaks of light running down, to scroll. */
export function rainTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(32, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.5;
    g.fillStyle = grad;
    g.fillRect(12, 0, 8, 256);
    g.globalAlpha = 1;
    for (let y = 0; y < 256; y += 40) {
      g.fillStyle = "#ffffff";
      g.fillRect(14, y, 4, 14);
    }
  }, true);
}

let soft: THREE.CanvasTexture | null = null;
/** A soft round dot, so points of light (stars, specks) aren't squares up close. Shared: don't dispose it per use. */
export function dotTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  soft = canvasTexture(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  });
  soft.userData.shared = true;
  return soft;
}

/** Concentric glowing rings and spokes, for a plaza floor. */
export function plazaTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 12;
    for (let r = 60; r < 512; r += 56) {
      g.globalAlpha = 0.25 + (r % 112 ? 0.15 : 0.45);
      g.lineWidth = r % 112 ? 2 : 5;
      g.beginPath();
      g.arc(512, 512, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 0.3;
    g.lineWidth = 2;
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(512 + Math.cos(t) * 60, 512 + Math.sin(t) * 60);
      g.lineTo(512 + Math.cos(t) * 504, 512 + Math.sin(t) * 504);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

// ---------- Pieces ----------

/** A sign floating on two posts, facing +z unless turned. */
export function sign(title: string, subtitle: string, color: THREE.Color, width = 22): THREE.Group {
  const group = new THREE.Group();
  const height = width / 4;
  // Two faces back to back, so it reads the right way round from either side.
  const face = new THREE.MeshBasicMaterial({ map: signTexture(title, subtitle, `#${color.getHexString()}`), transparent: true, fog: false });
  for (const turn of [0, Math.PI]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), face);
    board.position.y = 6 + height / 2;
    board.rotation.y = turn;
    group.add(board);
  }
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6 + height, 0.5), stone(color));
    post.position.set(side * (width / 2 - 0.4), (6 + height) / 2, 0);
    group.add(post, tag(glowCap(color, side * (width / 2 - 0.4), 6 + height + 0.4), { pulse: 1.5 }));
  }
  return group;
}

function glowCap(color: THREE.Color, x: number, y: number) {
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), glow(color, 0.95));
  cap.position.set(x, y, 0);
  return cap;
}

/** A gateway arch: two pillars and a curved top, glowing along its edge. */
export function arch(color: THREE.Color, span = 10, height = 12): THREE.Group {
  const group = new THREE.Group();
  const mat = stone(color);
  for (const side of [-1, 1]) {
    const pillar = block(new THREE.BoxGeometry(1.4, height - span / 2, 1.4), mat, color, side * span / 2, 0, 0);
    group.add(pillar);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.7, 8, 32, Math.PI), mat);
  top.position.y = height - span / 2;
  const line = new THREE.Mesh(new THREE.TorusGeometry(span / 2 + 0.75, 0.08, 6, 48, Math.PI), glow(color));
  line.position.y = top.position.y;
  group.add(top, line);
  return group;
}

/** A column of falling data light. */
export function dataRain(color: THREE.Color, height = 40): THREE.Mesh {
  const texture = rainTexture(`#${color.getHexString()}`);
  texture.repeat.set(1, height / 16);
  const column = new THREE.Mesh(new THREE.PlaneGeometry(1.4, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  column.position.y = height / 2;
  return tag(column, { scroll: { texture, speed: 0.5 + Math.random() * 0.6 } });
}

/** A floating holographic cube with a bright core. */
export function holoCube(color: THREE.Color, size: number, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.add(edges(new THREE.BoxGeometry(size, size, size), color, 0.85));
  const core = new THREE.Mesh(new THREE.BoxGeometry(size * 0.3, size * 0.3, size * 0.3), glow(color, 0.9));
  group.add(tag(core, { spin: -0.8, pulse: 2 }));
  return tag(group, { spin: 0.2 + rand() * 0.4, float: rand() * Math.PI * 2 });
}

/** A crystal spire: a tall thin prism with a glowing tip. */
export function crystal(color: THREE.Color, radius: number, height: number): THREE.Group {
  const group = new THREE.Group();
  group.add(block(new THREE.CylinderGeometry(radius * 0.08, radius, height, 6), stone(color), color, 0, 0, 0));
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.35), glow(color));
  tip.position.y = height + radius * 0.3;
  group.add(tag(tip, { spin: 0.9, pulse: 1.2 }));
  return group;
}

/** Disposes everything a group holds (geometries, materials, textures). */
export function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture && !value.userData.shared) value.dispose();
      mat.dispose();
    }
  });
}
