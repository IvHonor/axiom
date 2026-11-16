// Draws Nexus, the city of AIs, and walks your AI through it: one 3D scene, a
// city-map camera that follows you (drag to turn, scroll to zoom), click to
// walk (the way round buildings is found for you) or WASD and the arrow keys.
// Districts are built as you near them and taken down once you're far away,
// so only what's around you costs anything. world.ts has the map itself.
//
// Everyone else near you is drawn too: their own AI, a name tag you can click
// for their profile, and a bubble for what they're saying. They arrive about
// once a second (see useLive) and glide between, so they move smoothly.
//
// Some buildings can be gone into (interiors.ts): step on the ring at the
// door and, behind a loading screen, the city's put away and the room's built
// in its place, with its own map to walk; step on the ring inside to come back
// out. Whoever's inside with you is who you see.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildCompanion, disposeModel } from "../../lemma/model";
import type { Look } from "../../lemma/look";
import { BUILDERS, overhead, skyline } from "./districts";
import { bridges, islands, lifts, rivers } from "./bridges";
import { LIFTS, PAD_REACH, islandOf, liftAt, spanAt, type Lift, type Span } from "./routes";
import { DOOR_REACH, INTERIORS, spotAt, type Interior, type Spot } from "./interiors";
import { AIR, INSIDES } from "./insides";
import type { WalkMap } from "./walkmap";
import { dispose as disposeGroup, edges as outline, type Motion } from "./kit";
import { CITY, DISTRICTS, HALF, SPAWN, WALK, districtAt, nearestOpen, planTrip, type District, type DistrictId, type Point } from "./world";

export interface NexusLook {
  look: Look;
  glow: string;
  shell: string;
  admin: boolean;
  firstLight: boolean;
  /** The AI's name, on its tag. */
  name: string;
}

/** What someone's saying or doing, over their head. */
export interface Bubble {
  emoji?: string;
  text?: string;
  /** Meant for you. */
  aimed?: boolean;
  /** Dancing along. */
  dance?: boolean;
}

/** Someone else near you. */
export interface Peer extends NexusLook {
  id: string;
  handle: string;
  friend: boolean;
  x: number;
  z: number;
  bubble: Bubble | null;
}

export interface NexusEvents {
  /** You walked into a district (or out of them all). */
  onDistrict?: (district: District | null) => void;
  /** A district near you is being built: show it loading. Null once it's ready. */
  onLoading?: (district: District | null) => void;
  /** Someone's AI (or tag) was clicked. */
  onPick?: (id: string) => void;
  /** Your own AI was clicked. */
  onPickMe?: () => void;
  /** Going through a door: show it loading. Null once you're through. */
  onTravel?: (going: { room: Interior; entering: boolean } | null) => void;
  /** You're inside a building now, or back out in the city (null). */
  onPlace?: (room: Interior | null) => void;
  /** You stepped onto a spot (the dance floor, a nook, the telescope), or off it (null). */
  onSpot?: (spot: Spot | null) => void;
  /** You stepped onto a named route (a bridge, the wall, the lift), or off it (null). */
  onRoute?: (route: { id: string; name: string; blurb: string; color: string } | null) => void;
  /** You started (a lift) or finished (null) riding a lift. */
  onRide?: (lift: Lift | null) => void;
  /** The computer was struggling, so the picture got simpler. */
  onQuality?: (level: "full" | "lighter" | "lightest") => void;
}

export interface NexusHandle {
  walkTo: (p: Point) => void;
  keys: Set<string>;
  /** Where you are: in the city, or `inside` a building (x and z then from its middle). */
  me: () => { x: number; z: number; heading: number; moving: boolean; inside: string | null };
  /** The building you're inside, if any. */
  place: () => Interior | null;
  /** Out of the building you're in, then (if given) walk to `then` in the city. */
  leaveBuilding: (then?: Point) => void;
  view: () => { yaw: number };
  loaded: () => DistrictId[];
  /** Everyone near, as last heard: who's new appears, who's missing goes. */
  setPeople: (people: Peer[]) => void;
  /** What you're saying, over your own head. */
  setMine: (bubble: Bubble | null) => void;
  /** Where everyone's drawn now, for the minimap. */
  peers: () => { id: string; x: number; z: number; friend: boolean }[];
  dispose: () => void;
}

/** How long someone takes to glide to where they were last heard. */
const GLIDE = 1050;
/** Others' AIs are drawn within this many metres of the camera, and their tags within `TAGS`. */
const DRAW = 160;
const TAGS = 95;
/** Everyone's AI is this tall. */
const TALL = 4.2;

/** Districts are built this far out from their edge, and taken down past `UNLOAD`. */
const LOAD = 150;
const UNLOAD = 230;

/** Any CSS colour (a variable too) as a colour 3D understands. */
function cssColor(value: string, host: HTMLElement): THREE.Color {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  host.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [46, 196, 255];
  probe.remove();
  return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

/** Someone's AI, scaled to `TALL` and standing on the ground. Others' carry no lights of their own. */
function companion(who: NexusLook, host: HTMLElement, own: boolean) {
  const glow = cssColor(who.glow === "theme" ? "var(--accent)" : who.glow, host);
  const shell = cssColor(who.shell === "theme" ? "color-mix(in srgb, var(--surface) 88%, var(--text))" : who.shell, host);
  const model = buildCompanion(who.look, glow, shell, who.admin, who.firstLight);
  // A light per person would change every material's shader as people come and go.
  if (!own) {
    const lights: THREE.Object3D[] = [];
    model.root.traverse((o) => { if (o instanceof THREE.Light) lights.push(o); });
    lights.forEach((l) => l.removeFromParent());
  }
  const box = new THREE.Box3().setFromObject(model.root);
  const height = Math.max(0.5, box.max.y - box.min.y);
  model.root.scale.setScalar(TALL / height);
  model.root.position.y = -box.min.y * (TALL / height) + 0.4;
  return { model, glow };
}

/** A name tag with a bubble above it, floating over someone's head. */
function label(name: string, handle: string | null, friend: boolean, onClick: () => void) {
  const el = document.createElement("div");
  el.className = "nx-label";
  const bubble = document.createElement("div");
  bubble.className = "nx-bubble";
  bubble.hidden = true;
  const tag = document.createElement("button");
  tag.className = "nx-tag";
  tag.type = "button";
  const strong = document.createElement("strong");
  strong.textContent = name;
  tag.append(strong);
  if (handle === null) {
    const you = document.createElement("em");
    you.textContent = "you";
    tag.append(you);
  } else {
    const small = document.createElement("small");
    small.textContent = `@${handle}`;
    tag.append(small);
    tag.setAttribute("aria-label", `${name}, @${handle}'s AI${friend ? " (a friend)" : ""}. Open their profile.`);
  }
  tag.dataset.friend = friend ? "1" : "";
  tag.addEventListener("pointerdown", (e) => e.stopPropagation());
  tag.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  el.append(bubble, tag);
  const object = new CSS2DObject(el);
  object.position.y = TALL + 1.6;
  object.center.set(0.5, 1);
  return { object, bubble, tag };
}

function showBubble(el: HTMLElement, bubble: Bubble | null) {
  const key = bubble ? `${bubble.emoji ?? ""}|${bubble.text ?? ""}|${bubble.aimed ? 1 : 0}` : "";
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.hidden = !bubble;
  el.replaceChildren();
  if (!bubble) return;
  el.dataset.aimed = bubble.aimed ? "1" : "";
  if (bubble.emoji) {
    const emoji = document.createElement("span");
    emoji.className = "nx-bubble-emoji";
    emoji.textContent = bubble.emoji;
    el.append(emoji);
  }
  if (bubble.text) {
    const text = document.createElement("span");
    text.textContent = bubble.text;
    el.append(text);
  }
  // Pop in again for something new.
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

/** Things that move, gathered once when they're built so each frame touches only them. */
interface Mover {
  o: THREE.Object3D;
  m: Motion;
  baseY: number;
  /** For a pulse: the material and its colour (or glow) at rest. */
  mat?: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
  rest?: THREE.Color | number;
}

function movers(root: THREE.Object3D): Mover[] {
  const found: Mover[] = [];
  root.traverse((o) => {
    const m = o.userData as Motion;
    if (m.spin === undefined && m.float === undefined && m.pulse === undefined && !m.scroll) return;
    const mover: Mover = { o, m, baseY: o.position.y };
    const mat = (o as THREE.Mesh).material;
    if (m.pulse && mat && !Array.isArray(mat)) {
      if (mat instanceof THREE.MeshBasicMaterial) { mover.mat = mat; mover.rest = mat.color.clone(); }
      else if (mat instanceof THREE.MeshStandardMaterial) { mover.mat = mat; mover.rest = mat.emissiveIntensity; }
    }
    found.push(mover);
  });
  return found;
}

function animate(list: Mover[], dt: number, clock: number) {
  for (const { o, m, baseY, mat, rest } of list) {
    if (m.spin) o.rotation.y += dt * m.spin;
    if (m.float !== undefined) o.position.y = baseY + Math.sin(clock * 0.9 + m.float) * 0.7;
    if (m.scroll) m.scroll.texture.offset.y += dt * m.scroll.speed;
    if (m.pulse && mat) {
      const k = 0.7 + 0.3 * Math.sin(clock * m.pulse * 2 + baseY);
      if (mat instanceof THREE.MeshBasicMaterial) mat.color.copy(rest as THREE.Color).multiplyScalar(k);
      else mat.emissiveIntensity = (rest as number) * k;
    }
  }
}

export function createNexus(host: HTMLElement, who: NexusLook, events: NexusEvents = {}): NexusHandle {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);
  renderer.domElement.className = "nx-canvas";
  // Name tags and bubbles: real text, laid over the 3D.
  const labels = new CSS2DRenderer();
  labels.domElement.className = "nx-labels";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#03050c");
  scene.fog = new THREE.FogExp2("#060b1c", 0.0055);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1200);
  // The glow: bright edges and lights bleed light, as neon does.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Only what's bright (edges, lights, roads) glows; the ground stays dark.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 0.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  scene.add(new THREE.HemisphereLight("#5b78ff", "#020308", 0.32));
  const moon = new THREE.DirectionalLight("#a9c1ff", 0.8);
  moon.position.set(60, 140, 40);
  scene.add(moon);

  // ---------- Always there: ground, sky, roads, district borders, the Nexus landmarks ----------

  // The whole city, put away while you're inside a building.
  const city = new THREE.Group();
  scene.add(city);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ color: "#060a16", roughness: 0.95, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2;
  city.add(ground);
  const grid = new THREE.GridHelper(HALF * 2, 115, "#3a6fe0", "#16305e");
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = 0.02;
  city.add(grid);

  const starGeo = new THREE.BufferGeometry();
  const stars = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) {
    const a = Math.random() * Math.PI * 2, up = 0.15 + Math.random() * 0.85;
    stars.set([Math.cos(a) * Math.sqrt(1 - up * up) * 700, up * 700, Math.sin(a) * Math.sqrt(1 - up * up) * 700], i * 3);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  const sky = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#a9c1ff", size: 1.6, sizeAttenuation: false, fog: false }));
  city.add(sky);

  // The great spire and the rings over it: seen from anywhere in the city.
  const spireColor = new THREE.Color("#8fc4ff");
  const spireGeo = new THREE.CylinderGeometry(1.5, 10, 70, 8);
  const spire = new THREE.Mesh(spireGeo, new THREE.MeshStandardMaterial({ color: "#0d1630", emissive: "#1d4bb0", emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.7 }));
  spire.position.y = 35;
  const spireEdges = outline(spireGeo, spireColor);
  spireEdges.position.y = 35;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(4.5), new THREE.MeshBasicMaterial({ color: "#d8ecff" }));
  crystal.position.y = 76;
  const crystalLight = new THREE.PointLight("#8fc4ff", 24, 160, 1.7);
  crystalLight.position.y = 70;
  const rings: THREE.Mesh[] = [26, 38, 52].map((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 8, 160), new THREE.MeshBasicMaterial({ color: spireColor, transparent: true, opacity: 0.75 - i * 0.15 }));
    ring.position.y = 40 + i * 9;
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.25;
    return ring;
  });
  // All standing on the Nexus's island.
  const landmark = new THREE.Group();
  landmark.position.y = islandOf("nexus").h;
  landmark.add(spire, spireEdges, crystal, crystalLight, ...rings);
  city.add(landmark);
  // The islands, the river below, the routes between, the lift; far-off towers, and the sky.
  city.add(islands(), rivers(), bridges(), lifts(), skyline(), overhead());
  // Everything always there that moves (roads, arches, skyline lights).
  const always = movers(city);
  const cityAir = { background: "#03050c", fog: "#060b1c", density: 0.0055 };
  const air = (a: { background: string; fog: string; density: number }) => {
    (scene.background as THREE.Color).set(a.background);
    const fog = scene.fog as THREE.FogExp2;
    fog.color.set(a.fog);
    fog.density = a.density;
  };

  // ---------- Your AI ----------

  const { model, glow } = companion(who, host, true);
  const player = new THREE.Group();
  player.add(model.root);
  const halo = new THREE.Mesh(new THREE.RingGeometry(2, 2.4, 48), new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(1.3), transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  const aura = new THREE.PointLight(glow, 22, 26, 1.7);
  aura.position.y = 4;
  player.add(halo, aura);
  const myLabel = label(who.name, null, false, () => events.onPickMe?.());
  player.add(myLabel.object);
  // Everyone arrives near the same spot; spread out a little.
  const start = nearestOpen({ x: SPAWN.x + (Math.random() - 0.5) * 16, z: SPAWN.z + (Math.random() - 0.5) * 8 });
  player.position.set(start.x, CITY.height(start), start.z);
  player.rotation.y = Math.PI;
  scene.add(player);

  // Where a click sent you.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 32), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.09;
  scene.add(marker);

  // The way you're walking, drawn on the ground ahead of you.
  const TRAIL = 64;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineDashedMaterial({ color: glow.clone().multiplyScalar(1.4), dashSize: 0.7, gapSize: 0.55, transparent: true, opacity: 0.75, depthWrite: false }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
  const drawTrail = () => {
    trail.visible = path.length > 0;
    if (!trail.visible) return;
    const at = trailGeo.getAttribute("position") as THREE.BufferAttribute;
    const points = [{ x: player.position.x, z: player.position.z }, ...path].slice(0, TRAIL);
    points.forEach((p, i) => at.setXYZ(i, p.x, map.height(p) + 0.12, p.z));
    at.needsUpdate = true;
    trailGeo.setDrawRange(0, points.length);
    trail.computeLineDistances();
  };
  /** Where your AI stands normally; sitting lowers it. */
  const restY = model.root.position.y;

  // ---------- Everyone else ----------

  interface Remote {
    peer: Peer;
    group: THREE.Group;
    model: ReturnType<typeof buildCompanion>;
    tag: ReturnType<typeof label>;
    ring: THREE.Mesh;
    from: Point;
    to: Point;
    /** Heights at either end of the glide. */
    fromY: number;
    toY: number;
    at: number;
    heading: number;
    moving: boolean;
    phase: number;
  }
  const remotes = new Map<string, Remote>();
  const lookKey = (p: NexusLook) => JSON.stringify([p.look, p.glow, p.shell, p.admin, p.firstLight]);
  const glideAt = (r: Remote, now: number): Point => {
    const t = Math.min(1, (now - r.at) / GLIDE), ease = t * (2 - t);
    return { x: r.from.x + (r.to.x - r.from.x) * ease, z: r.from.z + (r.to.z - r.from.z) * ease };
  };
  const drop = (r: Remote) => {
    // Its tag's on the page, not in the 3D: take it off too.
    r.tag.object.removeFromParent();
    r.tag.object.element.remove();
    scene.remove(r.group);
    disposeModel(r.model.root);
    r.ring.geometry.dispose();
    (r.ring.material as THREE.Material).dispose();
    remotes.delete(r.peer.id);
  };
  /** How high someone stands: on the ground, or up on the lift's arc if they're riding it. */
  const heightFor = (p: Point): number => (!place && map.blocked(p, 0) ? rideHeight(p) ?? map.height(p) : map.height(p));
  const setPeople = (people: Peer[]) => {
    const now = performance.now();
    const seen = new Set<string>();
    for (const peer of people) {
      seen.add(peer.id);
      let r = remotes.get(peer.id);
      // A new face, or someone whose look changed: build their AI afresh.
      if (r && lookKey(r.peer) !== lookKey(peer)) {
        drop(r);
        r = undefined;
      }
      if (!r) {
        const { model, glow: theirs } = companion(peer, host, false);
        const group = new THREE.Group();
        group.userData.peer = peer.id;
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2, 40), new THREE.MeshBasicMaterial({ color: theirs.clone().multiplyScalar(peer.friend ? 1.3 : 0.8), transparent: true, opacity: peer.friend ? 0.85 : 0.45, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        const tag = label(peer.name, peer.handle, peer.friend, () => events.onPick?.(peer.id));
        group.add(model.root, ring, tag.object);
        group.position.set(peer.x, 0, peer.z);
        scene.add(group);
        const y = heightFor(peer);
        group.position.y = y;
        r = { peer, group, model, tag, ring, from: { x: peer.x, z: peer.z }, to: { x: peer.x, z: peer.z }, fromY: y, toY: y, at: now, heading: 0, moving: false, phase: Math.random() * 6 };
        remotes.set(peer.id, r);
      } else {
        const here = glideAt(r, now);
        // Far from where we last saw them (they went out of sight and came back): just be there.
        const jump = Math.hypot(peer.x - here.x, peer.z - here.z) > 40;
        r.from = jump ? { x: peer.x, z: peer.z } : here;
        r.fromY = jump ? heightFor(peer) : r.group.position.y;
        r.to = { x: peer.x, z: peer.z };
        r.toY = heightFor(peer);
        r.at = now;
        if (r.peer.friend !== peer.friend) r.tag.tag.dataset.friend = peer.friend ? "1" : "";
        r.peer = peer;
      }
      showBubble(r.tag.bubble, peer.bubble);
    }
    for (const r of [...remotes.values()]) if (!seen.has(r.peer.id)) drop(r);
  };
  let myBubble: Bubble | null = null;
  const setMine = (bubble: Bubble | null) => {
    myBubble = bubble;
    showBubble(myLabel.bubble, bubble);
  };

  const moveRemotes = (now: number, dt: number) => {
    for (const r of remotes.values()) {
      const at = glideAt(r, now);
      const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
      r.moving = now - r.at < GLIDE && Math.hypot(dx, dz) > 0.3;
      if (r.moving) r.heading = Math.atan2(dx, dz);
      const t = Math.min(1, (now - r.at) / GLIDE), ease = t * (2 - t);
      r.group.position.set(at.x, r.fromY + (r.toY - r.fromY) * ease, at.z);
      const far = Math.hypot(at.x - target.x, at.z - target.z);
      r.group.visible = far < DRAW;
      r.tag.object.visible = far < TAGS;
      if (!r.group.visible) continue;
      let turn = r.heading - r.group.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      r.group.rotation.y += turn * Math.min(1, dt * 8);
      const body = r.model.body;
      if (still) continue;
      const dancing = !!r.peer.bubble?.dance;
      body.position.y = r.moving ? Math.abs(Math.sin(clock * 11 + r.phase)) * 0.35 : dancing ? Math.abs(Math.sin(clock * 7)) * 0.5 : Math.sin(clock * 2 + r.phase) * 0.12;
      body.rotation.y = dancing ? body.rotation.y + dt * 5 : 0;
      body.rotation.z = r.moving ? Math.sin(clock * 11 + r.phase) * 0.06 : 0;
    }
  };

  // ---------- Streaming districts ----------

  const built = new Map<DistrictId, { group: THREE.Group; moving: Mover[] }>();
  let loadingShown: DistrictId | null = null;
  const stream = (initial = false) => {
    const here = { x: player.position.x, z: player.position.z };
    for (const d of DISTRICTS) {
      const far = Math.hypot(here.x - d.center.x, here.z - d.center.z) - d.radius;
      if (far < LOAD && !built.has(d.id)) {
        // Close enough to see: say so while it's built (a game would stream it in).
        const near = far < 40 || initial;
        if (near && loadingShown !== d.id) {
          loadingShown = d.id;
          events.onLoading?.(d);
        }
        const group = BUILDERS[d.id](d);
        built.set(d.id, { group, moving: movers(group) });
        city.add(group);
        if (near) window.setTimeout(() => { if (loadingShown === d.id) { loadingShown = null; events.onLoading?.(null); } }, initial ? 900 : 650);
        return; // one a frame, so walking never stutters
      }
      if (far > UNLOAD && built.has(d.id)) {
        const { group } = built.get(d.id)!;
        city.remove(group);
        disposeGroup(group);
        built.delete(d.id);
      }
    }
  };

  // ---------- Walking ----------

  let path: Point[] = [];
  let moving = false;
  let heading = Math.PI;
  const keys = new Set<string>();
  /** The map you're walking: the city's, or the room's you're in. */
  let map: WalkMap = CITY;
  /** Near enough to a door counts as the door, so a click (or the map's rough aim) takes you through. */
  const snap = (p: Point): Point => {
    const doors = place ? [place.door] : INTERIORS.map((r) => r.outside.door);
    return doors.find((d) => Math.hypot(d.x - p.x, d.z - p.z) < 4) ?? p;
  };
  /** A lift to ride once the walk reaches its pad, and where to go after. */
  let trip: { lift: Lift; forward: boolean; then: Point } | null = null;
  const walkTo = (p: Point) => {
    if (transit || riding) return void (pendingWalk = p);
    const here = { x: player.position.x, z: player.position.z };
    trip = null;
    if (place) path = map.findPath(here, snap(p));
    else {
      // Out in the city: walk, or walk to the lift, ride it and walk on, whichever's quicker.
      const plan = planTrip(here, snap(p));
      path = plan.path;
      const lift = plan.lift && LIFTS.find((l) => l.id === plan.lift!.id);
      if (lift && plan.then) trip = { lift, forward: plan.lift!.forward, then: plan.then };
    }
    if (path.length) {
      const end = path[path.length - 1];
      marker.position.set(end.x, map.height(end) + 0.09, end.z);
      (marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
      marker.scale.setScalar(1);
    }
  };

  // ---------- Riding the lift ----------

  let riding: { lift: Lift; forward: boolean; t: number } | null = null;
  let liftArmed = true;
  const ride = (lift: Lift, forward: boolean) => {
    riding = { lift, forward, t: 0 };
    path = [];
    view.distance = 55;
    events.onRide?.(lift);
  };
  /** Stepping on a lift's pad rides it (once you've stepped off since). */
  const pads = () => {
    if (riding || transit || place) return;
    const here = { x: player.position.x, z: player.position.z };
    let nearest = Infinity;
    for (const lift of LIFTS) {
      for (const [pad, forward] of [[lift.a, true], [lift.b, false]] as const) {
        const far = Math.hypot(here.x - pad.x, here.z - pad.z);
        nearest = Math.min(nearest, far);
        if (liftArmed && far < PAD_REACH) {
          // Riding as planned, or just stepped on: either way, up (or down) you go.
          if (trip && trip.lift.id !== lift.id) trip = null;
          return ride(lift, forward);
        }
      }
    }
    if (nearest > PAD_REACH + 1.5) liftArmed = true;
  };
  const rideOn = (dt: number) => {
    if (!riding) return;
    riding.t = Math.min(1, riding.t + dt / riding.lift.ride);
    const p = liftAt(riding.lift, riding.t, riding.forward);
    const ahead = liftAt(riding.lift, Math.min(1, riding.t + 0.02), riding.forward);
    if (Math.hypot(ahead.x - p.x, ahead.z - p.z) > 0.01) heading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    player.position.set(p.x, p.y, p.z);
    if (riding.t < 1) return;
    riding = null;
    liftArmed = false;
    view.distance = null;
    events.onRide?.(null);
    const next = trip?.then ?? pendingWalk;
    trip = null;
    pendingWalk = null;
    if (next) walkTo(next);
  };
  /** Where someone mid-ride is, from where they are on the map: on the lift's arc. */
  const rideHeight = (p: Point): number | null => {
    for (const lift of LIFTS) {
      let best = Infinity, y = 0;
      for (let k = 0; k <= 40; k++) {
        const q = liftAt(lift, k / 40, true), far = Math.hypot(q.x - p.x, q.z - p.z);
        if (far < best) { best = far; y = q.y; }
      }
      if (best < 4) return y;
    }
    return null;
  };

  // ---------- Going inside ----------

  /** A room's wall, which way it faces, and its materials (to fade it when it's in the way). */
  interface Wall { face: Point; materials: { m: THREE.Material; base: number }[]; faded: boolean }
  const wallsOf = (group: THREE.Group): Wall[] => {
    const found: Wall[] = [];
    group.traverse((o) => {
      if (!o.userData.face) return;
      const materials: Wall["materials"] = [];
      o.traverse((c) => {
        const mat = (c as THREE.Mesh).material;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          m.transparent = true;
          materials.push({ m, base: m.opacity });
        }
      });
      found.push({ face: o.userData.face as Point, materials, faded: false });
    });
    return found;
  };
  /** Walls on the camera's side fade, so you can see yourself and the room. */
  const fadeWalls = () => {
    if (!room) return;
    const toCamera = { x: Math.sin(yaw), z: Math.cos(yaw) };
    for (const w of room.walls) {
      const faded = w.face.x * toCamera.x + w.face.z * toCamera.z > 0.35;
      if (faded === w.faded) continue;
      w.faded = faded;
      for (const { m, base } of w.materials) m.opacity = faded ? base * 0.12 : base;
    }
  };

  let place: Interior | null = null;
  let room: { group: THREE.Group; moving: Mover[]; walls: Wall[] } | null = null;
  let transit = false, armed = true, gone = false;
  let pendingWalk: Point | null = null;
  const swap = (to: Interior | null) => {
    const from = place;
    // Whoever was around you stays where you were.
    for (const r of [...remotes.values()]) drop(r);
    path = [];
    if (to) {
      city.visible = false;
      const group = INSIDES[to.id](to);
      scene.add(group);
      room = { group, moving: movers(group), walls: wallsOf(group) };
      map = to.map;
      player.position.set(to.spawn.x, to.map.height(to.spawn), to.spawn.z);
      heading = Math.PI;
      yaw = 0;
      distance = zoom = 26;
      air(AIR[to.id]);
    } else if (from) {
      if (room) {
        scene.remove(room.group);
        disposeGroup(room.group);
        room = null;
      }
      city.visible = true;
      map = CITY;
      player.position.set(from.outside.out.x, CITY.height(from.outside.out), from.outside.out.z);
      heading = from.outside.heading;
      // The camera out front, looking back at the building as you step out of it.
      yaw = heading;
      distance = zoom = 40;
      air(cityAir);
    }
    player.rotation.y = heading;
    place = to;
    armed = false;
    placeCamera(true);
    events.onPlace?.(to);
    if (!to) {
      district = districtAt({ x: player.position.x, z: player.position.z });
      events.onDistrict?.(district);
    }
  };
  /** Through a door, behind a loading screen. */
  const go = (to: Interior | null) => {
    if (transit || (!to && !place)) return;
    transit = true;
    path = [];
    events.onTravel?.({ room: (to ?? place)!, entering: !!to });
    // A moment for the loading screen to come up before the work.
    window.setTimeout(() => {
      if (gone) return;
      swap(to);
      window.setTimeout(() => {
        if (gone) return;
        transit = false;
        events.onTravel?.(null);
        const next = pendingWalk;
        pendingWalk = null;
        if (next) walkTo(next);
      }, 700);
    }, 160);
  };
  /** Stepping on a door's ring takes you through it (once you've stepped off it since). */
  const doors = () => {
    if (transit) return;
    const here = { x: player.position.x, z: player.position.z };
    if (place) {
      const far = Math.hypot(here.x - place.door.x, here.z - place.door.z);
      if (far > DOOR_REACH + 1.5) armed = true;
      else if (armed && far < DOOR_REACH) go(null);
      return;
    }
    let nearest = Infinity;
    for (const r of INTERIORS) {
      const far = Math.hypot(here.x - r.outside.door.x, here.z - r.outside.door.z);
      nearest = Math.min(nearest, far);
      if (armed && far < DOOR_REACH && built.has(r.district)) return go(r);
    }
    if (nearest > DOOR_REACH + 1.5) armed = true;
  };

  // ---------- Camera ----------

  // Zoom, tilt and where the camera looks ease towards where they're asked to be.
  let yaw = 0, distance = 40, zoom = 40;
  let pitch = 0.9, lookY = 2;
  const view = { pitch: 0.9, lookY: 2, distance: null as number | null };
  const target = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
  const placeCamera = (snap = false, dt = 1) => {
    target.lerp(new THREE.Vector3(player.position.x, player.position.y, player.position.z), snap ? 1 : 0.12);
    const k = snap ? 1 : Math.min(1, dt * 5);
    distance += ((view.distance ?? zoom) - distance) * k;
    pitch += (view.pitch - pitch) * k;
    lookY += (view.lookY - lookY) * k;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(target.x, target.y + lookY, target.z);
  };

  // ---------- Input: click to walk, drag to turn, scroll to zoom ----------

  const canvas = renderer.domElement;
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag: { x: number; moved: number; button: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, moved: 0, button: e.button };
    canvas.setPointerCapture(e.pointerId);
  };
  /** Where a ray from the camera first meets the ground, terraces and stairs included. */
  const groundHit = (r: THREE.Ray): Point | null => {
    const p = new THREE.Vector3();
    let before = 0;
    for (let t = 0; t < 700; t += 0.75) {
      r.at(t, p);
      if (p.y > map.height(p) + 0.01) { before = t; continue; }
      // Close in on where it crossed.
      let lo = before, hi = t;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        r.at(mid, p);
        if (p.y > map.height(p)) lo = mid;
        else hi = mid;
      }
      r.at(hi, p);
      return { x: p.x, z: p.z };
    }
    return null;
  };

  /** What's under the pointer: someone (or you), a door, or just ground. */
  const under = (e: PointerEvent | MouseEvent): { person: string | null | undefined; ground: Point | null } => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const people = [...remotes.values()].filter((p) => p.group.visible).map((p) => p.model.root);
    const struck = ray.intersectObjects([model.root, ...people], true)[0];
    let person: string | null | undefined;
    for (let o: THREE.Object3D | null = struck?.object ?? null; o; o = o.parent) {
      if (o === model.root) { person = null; break; }
      if (o.userData.peer) { person = o.userData.peer as string; break; }
    }
    const hit = new THREE.Vector3();
    return { person, ground: place ? (ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null) : groundHit(ray.ray) };
  };
  let hovered = 0;
  const move = (e: PointerEvent) => {
    if (!drag) {
      // A hand over someone or a door, now and then (not every pixel).
      if (performance.now() - hovered < 80) return;
      hovered = performance.now();
      const { person, ground } = under(e);
      const door = ground && (place ? [place.door] : INTERIORS.map((r) => r.outside.door)).some((d) => Math.hypot(d.x - ground.x, d.z - ground.z) < 3);
      canvas.style.cursor = person !== undefined || door ? "pointer" : "";
      return;
    }
    const dx = e.clientX - drag.x;
    drag.moved += Math.abs(dx);
    drag.x = e.clientX;
    if (drag.moved > 4) yaw -= dx * 0.006;
  };
  const up = (e: PointerEvent) => {
    if (drag && drag.moved <= 4 && drag.button === 0) {
      // Someone's AI first (or your own), then the ground.
      const { person, ground } = under(e);
      if (person === null) events.onPickMe?.();
      else if (person) events.onPick?.(person);
      else if (ground) walkTo(ground);
    }
    drag = null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.max(14, Math.min(150, zoom * (1 + Math.sign(e.deltaY) * 0.12)));
  };
  const menu = (e: MouseEvent) => e.preventDefault();
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", menu);

  // ---------- Keeping it smooth ----------

  // Struggling (under ~32 frames a second for a few seconds): first draw fewer
  // pixels, then drop the glow. Never back up again in one visit.
  let quality: 2 | 1 | 0 = 2, frames = 0, since = 0;
  let bloomOn = true;
  const born = performance.now();
  const watchSpeed = (now: number) => {
    // Loading, going through a door or just started: slow frames then don't count.
    if (transit || loadingShown || now - born < 4000) {
      frames = 0;
      since = now;
      return;
    }
    frames++;
    if (now - since < 3000) return;
    const fps = (frames * 1000) / (now - since);
    frames = 0;
    since = now;
    if (fps >= 32 || quality === 0) return;
    quality = (quality - 1) as 1 | 0;
    if (quality === 1) {
      renderer.setPixelRatio(1);
      composer.setPixelRatio(1);
      resize();
    } else bloomOn = false;
    events.onQuality?.(quality === 1 ? "lighter" : "lightest");
  };

  const resize = () => {
    const { width, height: h } = host.getBoundingClientRect();
    if (!width || !h) return;
    renderer.setSize(width, h, false);
    labels.setSize(width, h);
    composer.setSize(width, h);
    bloom.resolution.set(width / 2, h / 2);
    camera.aspect = width / h;
    camera.updateProjectionMatrix();
  };
  const sized = new ResizeObserver(resize);
  sized.observe(host);
  resize();

  // ---------- Which route you're on ----------

  let onRoute: string | null = null;
  const routes = () => {
    if (place) return;
    const now: Span | Lift | null = riding ? riding.lift : spanAt({ x: player.position.x, z: player.position.z });
    if ((now?.id ?? null) === onRoute) return;
    onRoute = now?.id ?? null;
    events.onRoute?.(now ? { id: now.id, name: now.name, blurb: now.blurb, color: now.color } : null);
  };

  // ---------- Spots ----------

  let spot: Spot | null = null;
  const spots = () => {
    const now = transit ? null : spotAt(place?.id ?? null, { x: player.position.x, z: player.position.z });
    if (now?.id === spot?.id) return;
    spot = now;
    // At the telescope the camera tips back to look up at the sky.
    // At the lookout it pulls right back to take in the whole city.
    const kind = spot?.kind;
    view.pitch = kind === "stargaze" ? 0.42 : kind === "lookout" ? 0.5 : 0.9;
    view.lookY = kind === "stargaze" ? 13 : kind === "lookout" ? -2 : 2;
    view.distance = kind === "stargaze" ? 20 : kind === "lookout" ? 95 : riding ? 55 : null;
    events.onSpot?.(spot);
  };

  // ---------- The loop ----------

  let frame = 0, last = performance.now(), clock = 0;
  let district: District | null = districtAt(start);
  events.onDistrict?.(district);
  stream(true);

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    // Keys steer relative to where the camera looks; they cancel a walk. Nothing moves you mid-door.
    const kx = transit || riding ? 0 : (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0);
    const kz = transit || riding ? 0 : (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0);
    if (keys.has("q")) yaw += dt * 1.6;
    if (keys.has("e")) yaw -= dt * 1.6;
    let step: Point | null = null;
    if (kx || kz) {
      path = [];
      const len = Math.hypot(kx, kz);
      const dx = (kx * Math.cos(yaw) + kz * Math.sin(yaw)) / len, dz = (-kx * Math.sin(yaw) + kz * Math.cos(yaw)) / len;
      step = { x: dx * WALK * dt, z: dz * WALK * dt };
    } else if (path.length && !transit && !riding) {
      const next = path[0];
      const dx = next.x - player.position.x, dz = next.z - player.position.z, far = Math.hypot(dx, dz);
      if (far < WALK * dt) {
        player.position.x = next.x;
        player.position.z = next.z;
        path.shift();
      } else step = { x: (dx / far) * WALK * dt, z: (dz / far) * WALK * dt };
    }
    moving = !!step;
    if (step) {
      const nx = player.position.x + step.x, nz = player.position.z + step.z;
      // Slide along walls rather than stopping dead.
      if (!map.blocked({ x: nx, z: nz })) player.position.set(nx, 0, nz);
      else if (!map.blocked({ x: nx, z: player.position.z })) player.position.x = nx;
      else if (!map.blocked({ x: player.position.x, z: nz })) player.position.z = nz;
      heading = Math.atan2(step.x, step.z);
    }
    // Stand on the ground, up and down the stairs; or float along the lift.
    if (riding) rideOn(dt);
    else player.position.y = map.height({ x: player.position.x, z: player.position.z });
    // Turn to face the way you walk, gently.
    let turn = heading - player.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    player.rotation.y += turn * Math.min(1, dt * 10);
    model.body.position.y = still ? 0 : moving ? Math.abs(Math.sin(clock * 11)) * 0.35 : Math.sin(clock * 2) * 0.12;
    model.body.rotation.z = moving && !still ? Math.sin(clock * 11) * 0.06 : 0;
    // Sitting in a nook: settle down, lean back, breathe slowly.
    const sitting = spot?.kind === "sit" && !moving;
    model.root.position.y += ((sitting ? restY - 0.9 : restY) - model.root.position.y) * Math.min(1, dt * 6);
    model.body.rotation.x = sitting ? -0.18 : 0;
    if (sitting && !still) model.body.position.y = Math.sin(clock * 1.2) * 0.05;
    halo.scale.setScalar(1 + Math.sin(clock * 3) * 0.06);

    const mat = marker.material as THREE.MeshBasicMaterial;
    if (mat.opacity > 0) {
      mat.opacity = Math.max(0, mat.opacity - dt * 0.9);
      marker.scale.setScalar(1 + (0.9 - mat.opacity) * 1.4);
    }

    if (!still && room) animate(room.moving, dt, clock);
    else if (!still) {
      rings.forEach((r, i) => (r.rotation.z += dt * (0.08 + i * 0.05) * (i % 2 ? -1 : 1)));
      crystal.rotation.y += dt * 0.6;
      crystal.position.y = 76 + Math.sin(clock * 1.2) * 1.2;
      animate(always, dt, clock);
      built.forEach(({ moving }) => animate(moving, dt, clock));
    }

    if (!place) {
      const now2 = districtAt({ x: player.position.x, z: player.position.z });
      if (now2?.id !== district?.id) {
        district = now2;
        events.onDistrict?.(district);
      }
    }
    if (!riding) doors();
    pads();
    routes();
    spots();
    drawTrail();
    moveRemotes(now, dt);
    if (myBubble?.dance && !still && !moving) {
      model.body.position.y = Math.abs(Math.sin(clock * 7)) * 0.5;
      model.body.rotation.y += dt * 5;
    } else model.body.rotation.y = 0;
    if (!place) stream();
    else fadeWalls();
    placeCamera(false, dt);
    if (bloomOn) composer.render();
    else renderer.render(scene, camera);
    watchSpeed(now);
    labels.render(scene, camera);
    frame = document.hidden ? 0 : requestAnimationFrame(tick);
  };
  placeCamera(true);
  frame = requestAnimationFrame(tick);
  const shown = () => {
    if (!document.hidden && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", shown);

  return {
    walkTo,
    keys,
    me: () => ({ x: player.position.x, z: player.position.z, heading: player.rotation.y, moving, inside: place?.id ?? null }),
    place: () => place,
    leaveBuilding: (then?: Point) => {
      if (!place) return then && walkTo(then);
      pendingWalk = then ?? null;
      go(null);
    },
    view: () => ({ yaw }),
    loaded: () => [...built.keys()],
    setPeople,
    setMine,
    peers: () => [...remotes.values()].map((r) => ({ id: r.peer.id, x: r.group.position.x, z: r.group.position.z, friend: r.peer.friend })),
    dispose: () => {
      gone = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", shown);
      sized.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", menu);
      built.forEach(({ group }) => disposeGroup(group));
      if (room) disposeGroup(room.group);
      [...remotes.values()].forEach(drop);
      labels.domElement.remove();
      disposeModel(model.root);
      disposeGroup(scene);
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
