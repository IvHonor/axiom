// Drawing Nexus's levels (levels.ts has the maths): raised terraces with
// arched niches along their sides, flights of stone steps with glowing edges,
// and balustrades round the terraces and down the stairs, standing exactly
// where the edges are solid.
import * as THREE from "three";
import { edges as outline, glow, stone, windows } from "./kit";
import { edges, fromStair, heightAt, type Stair, type Terrace } from "./levels";

/** Lit arches, for a terrace's sides. */
function niches(color: string, seed: string): THREE.MeshStandardMaterial {
  const t = windows(color, 8, 1, true, seed);
  t.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map: t, emissive: new THREE.Color(color), emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.7 });
}

/** A raised terrace: its body, glowing edges along the top, and its top as a surface to stand on. */
export function terrace(t: Terrace, color: THREE.Color, offset = 0): THREE.Group {
  const group = new THREE.Group();
  const hex = `#${color.getHexString()}`;
  const side = niches(hex, `terrace-${t.id}`);
  const top = new THREE.MeshStandardMaterial({ color: "#0d1428", emissive: color.clone().multiplyScalar(0.08), roughness: 0.8, metalness: 0.3 });
  let geo: THREE.BufferGeometry;
  if (t.kind === "box") {
    geo = new THREE.BoxGeometry(t.w, t.h - t.base, t.d);
    (side.map as THREE.Texture).repeat.set(t.w / 6, 1);
    const sides = side.clone();
    (sides.map as THREE.Texture) = side.map!.clone();
    sides.map!.repeat.set(t.d / 6, 1);
    sides.map!.needsUpdate = true;
    sides.emissiveMap = sides.map;
    const body = new THREE.Mesh(geo, [sides, sides, top, top, side, side]);
    body.position.set(t.x, (t.base + t.h) / 2 - offset, t.z);
    group.add(body);
  } else {
    geo = new THREE.CylinderGeometry(t.r, t.r + 0.8, t.h - t.base, 96);
    (side.map as THREE.Texture).repeat.set(Math.round((Math.PI * 2 * t.r) / 6), 1);
    const body = new THREE.Mesh(geo, [side, top, top]);
    body.position.set(t.x, (t.base + t.h) / 2 - offset, t.z);
    group.add(body);
  }
  const line = outline(geo, color, 0.8);
  line.position.set(t.x, (t.base + t.h) / 2 - offset, t.z);
  group.add(line);
  return group;
}

/** A flight of steps, each with a glowing edge. */
export function stairs(s: Stair, color: THREE.Color, offset = 0): THREE.Group {
  const group = new THREE.Group();
  const count = Math.max(2, Math.round(s.length / 0.45)), depth = s.length / count;
  const step = new THREE.BoxGeometry(s.width, 1, depth);
  const steps = new THREE.InstancedMesh(step, stone(color), count);
  const turn = Math.atan2(s.dir.x, s.dir.z);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
  const nosing: number[] = [];
  for (let i = 0; i < count; i++) {
    // Each step's top sits halfway down its stretch of the slope you walk.
    const top = s.high + (s.low - s.high) * ((i + 0.5) / count);
    const middle = fromStair(s, (i + 0.5) * depth, 0);
    m.compose(new THREE.Vector3(middle.x, (s.low + top) / 2 - offset, middle.z), q, new THREE.Vector3(1, Math.max(0.05, top - s.low), 1));
    steps.setMatrixAt(i, m);
    // A glowing edge on every other step.
    if (i % 2 === 0) {
      const a = fromStair(s, (i + 1) * depth, -s.width / 2), b = fromStair(s, (i + 1) * depth, s.width / 2);
      nosing.push(a.x, top + 0.02 - offset, a.z, b.x, top + 0.02 - offset, b.z);
    }
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.Float32BufferAttribute(nosing, 3));
  group.add(steps, new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.45 })));
  return group;
}

/** Balustrades: a post wherever the edge is solid, a glowing rail joining them. */
export function railings(terraces: Terrace[], flights: Stair[], color: THREE.Color, offset = 0): THREE.Group {
  const group = new THREE.Group();
  const posts = edges(terraces, flights).filter((p) => p.kind === "circle");
  // Rails stand just beside the stairs, so read the stairs a little wider for their height.
  const wide = flights.map((s) => ({ ...s, width: s.width + 2.5 }));
  const base = posts.map((p) => heightAt(terraces, wide, p) - offset);
  const post = new THREE.CylinderGeometry(0.16, 0.2, 1.1, 6);
  const mesh = new THREE.InstancedMesh(post, stone(color), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m.makeTranslation(p.x, base[i] + 0.55, p.z);
    mesh.setMatrixAt(i, m);
  });
  const rail: number[] = [];
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1], b = posts[i];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1.3) rail.push(a.x, base[i - 1] + 1.12, a.z, b.x, base[i] + 1.12, b.z);
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.Float32BufferAttribute(rail, 3));
  group.add(mesh, new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.7), transparent: true, opacity: 0.9 })));
  return group;
}

/** A tall beam of light, brightest at its foot. */
export function beam(color: THREE.Color, height: number, radius = 0.7): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.35, radius, height, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.2), map: t, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  mesh.position.y = height / 2;
  return mesh;
}

export { glow };
