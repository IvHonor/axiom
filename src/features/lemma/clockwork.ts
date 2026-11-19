// The clockwork set: the Daily Plan's reward items, all local geometry. Gears
// that touch really mesh: each is driven by its neighbour at the ratio of their
// teeth, and starts with a tooth in the other's gap.
import * as THREE from "three";
import type { Shell } from "./look";

/** Something that turns with the clock: `phase + rate * clockTurn(time)`, about its own axis. */
export interface Spinner {
  object: THREE.Object3D;
  teeth: number;
  phase: number;
  rate: number;
}

const TAU = Math.PI * 2;

/** Clock time, in ticks: it holds still, then snaps forward, about twice a second. */
export function clockTurn(seconds: number) {
  const ticks = seconds * 2, whole = Math.floor(ticks), step = Math.min(1, (ticks - whole) / 0.22);
  return whole + 1 - (1 - step) ** 3;
}

function brassParts() {
  return {
    // Only moderately metallic: with no reflections to catch, full metal renders nearly black.
    brass: new THREE.MeshStandardMaterial({ color: "#d3a554", emissive: "#6e4a16", emissiveIntensity: 0.42, metalness: 0.42, roughness: 0.38 }),
    pale: new THREE.MeshStandardMaterial({ color: "#efd08c", emissive: "#7a5a22", emissiveIntensity: 0.36, metalness: 0.36, roughness: 0.34 }),
    steel: new THREE.MeshStandardMaterial({ color: "#59606a", metalness: 0.85, roughness: 0.34 }),
    jewel: new THREE.MeshStandardMaterial({ color: "#c52e58", emissive: "#6d1230", emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.18 }),
  };
}

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

/** A gear facing +z, centred on it. `radius` is its pitch circle: two gears mesh at the sum of theirs. */
export function gearGeometry(radius: number, teeth: number, depth = 0.035, hole = radius * 0.28, windows = teeth >= 14) {
  const tip = radius * 1.09, root = radius * 0.89, step = TAU / teeth;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const at = i * step;
    ([[-0.31, root], [-0.15, tip], [0.15, tip], [0.31, root]] as const).forEach(([offset, r], corner) => {
      const x = Math.cos(at + offset * step) * r, y = Math.sin(at + offset * step) * r;
      if (i === 0 && corner === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, hole, 0, TAU, true);
  shape.holes.push(bore);
  if (windows) for (let i = 0; i < 4; i++) {
    const middle = i * TAU / 4 + Math.PI / 4, spread = 0.52, inner = radius * 0.42, outer = radius * 0.72;
    const opening = new THREE.Path();
    opening.absarc(0, 0, outer, middle + spread, middle - spread, true);
    opening.absarc(0, 0, inner, middle - spread, middle + spread, false);
    opening.closePath();
    shape.holes.push(opening);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1, curveSegments: 10, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** A gear turned by `driver`, set at (dx, dy) from it, so their teeth interlock. */
function meshed(driver: Spinner, object: THREE.Object3D, teeth: number, dx: number, dy: number): Spinner {
  const contact = Math.atan2(dy, dx);
  const pitch = driver.teeth * (contact - driver.phase) / TAU;
  const phase = contact + Math.PI - TAU * (0.5 - (pitch - Math.floor(pitch))) / teeth;
  object.rotation.z = phase;
  return { object, teeth, phase, rate: -driver.rate * driver.teeth / teeth };
}

/** Radii come from teeth, so any two gears of a train share the same tooth size. */
const pitchOf = (teeth: number) => teeth * 0.02;

/** A small gear train fixed in `parent`: each entry is [teeth, direction from the gear before it]. */
function train(parent: THREE.Object3D, material: THREE.Material, start: [x: number, y: number], rate: number, links: [teeth: number, degrees: number, from?: number][], depth = 0.03, hubs?: THREE.Material) {
  const spinners: Spinner[] = [];
  const places: [number, number][] = [];
  links.forEach(([teeth, degrees, from], i) => {
    const radius = pitchOf(teeth);
    const gear = new THREE.Group();
    add(gear, gearGeometry(radius, teeth, depth), material);
    if (i === 0) {
      gear.position.set(start[0], start[1], 0);
      places.push(start);
      spinners.push({ object: gear, teeth, phase: 0, rate });
    } else {
      const source = from ?? i - 1, at = degrees * Math.PI / 180, reach = pitchOf(links[source][0]) + radius;
      const dx = Math.cos(at) * reach, dy = Math.sin(at) * reach;
      const place: [number, number] = [places[source][0] + dx, places[source][1] + dy];
      gear.position.set(place[0], place[1], 0);
      places.push(place);
      spinners.push(meshed(spinners[source], gear, teeth, dx, dy));
    }
    parent.add(gear);
    if (hubs) add(parent, new THREE.SphereGeometry(Math.max(0.018, radius * 0.16), 12, 8), hubs, places[i][0], places[i][1], depth * 0.6);
  });
  return spinners;
}

/** How the works sit inside each body, clear of its walls. */
const WORKS: Record<Shell, { y: number; z: number; scale: number }> = {
  orb: { y: 0, z: -0.12, scale: 1 },
  prism: { y: 0, z: -0.12, scale: 1.05 },
  pyramid: { y: -0.3, z: -0.1, scale: 0.72 },
  drop: { y: 0.12, z: -0.08, scale: 0.72 },
};

/** The Skeleton material's insides: a gear train seen through a clear shell. */
export function skeletonWorks(body: THREE.Object3D, shape: Shell) {
  const { brass, pale, steel, jewel } = brassParts();
  // Seen through a shell, often on a dark theme, so they carry some light of their own.
  brass.emissiveIntensity = 0.8;
  pale.emissiveIntensity = 0.7;
  steel.color.set("#8c95a1");
  const { y, z, scale } = WORKS[shape];
  const works = new THREE.Group();
  works.position.set(0, y, z);
  works.scale.setScalar(scale);
  body.add(works);
  const plate = add(works, new THREE.TorusGeometry(0.68, 0.014, 8, 72), steel, 0, 0, -0.07);
  plate.scale.y = 0.98;
  for (const angle of [0.5, 2.3, 4.1]) {
    const bar = add(works, new THREE.BoxGeometry(0.66, 0.018, 0.012), steel, Math.cos(angle) * 0.33, Math.sin(angle) * 0.33, -0.07);
    bar.rotation.z = angle;
  }
  // 18 teeth drive 12, which drives 9; a second 9 runs off the big gear.
  const spinners = train(works, brass, [-0.22, 0.24], 0.1, [[18, -25], [12, -25], [9, -110], [9, -120, 0]], 0.04, jewel);
  spinners.forEach((spinner, i) => { if (i % 2) (spinner.object.children[0] as THREE.Mesh).material = pale; });
  return { group: works, spinners };
}

/** The hat's body is `felt`; its band and cogs are brass. */
export function gearwrightHat(hat: THREE.Object3D, felt: THREE.Material) {
  const { brass, pale, jewel } = brassParts();
  add(hat, new THREE.LatheGeometry([[0, 0.01], [0.6, 0.01], [0.76, 0.03], [0.78, 0.055], [0.6, 0.065], [0, 0.065]].map(([x, y]) => new THREE.Vector2(x, y)), 48), felt);
  add(hat, new THREE.LatheGeometry([[0.49, 0.04], [0.455, 0.14], [0.47, 0.42], [0.51, 0.62], [0.49, 0.66], [0, 0.66]].map(([x, y]) => new THREE.Vector2(x, y)), 48), felt);
  add(hat, new THREE.CylinderGeometry(0.462, 0.458, 0.1, 48, 1, true), brass, 0, 0.145);
  const cogs = new THREE.Group();
  cogs.position.set(-0.05, 0.215, 0.475);
  cogs.rotation.x = 0.05;
  cogs.scale.setScalar(0.68);
  hat.add(cogs);
  const spinners = train(cogs, brass, [0, 0], 0.09, [[9, 0], [6, -32]], 0.028, jewel);
  (spinners[1].object.children[0] as THREE.Mesh).material = pale;
  return spinners;
}

/** A cord (`cord`) through a turning gear clasp, with two metal-tipped ends. */
export function cogBolo(neck: THREE.Object3D, cord: THREE.Material) {
  const { brass, pale, jewel } = brassParts();
  const line = (points: number[][]) => add(neck, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 20, 0.014, 6, false), cord);
  for (const side of [-1, 1]) {
    line([[side * 0.34, 0.2, -0.16], [side * 0.2, 0.12, -0.02], [side * 0.05, 0.03, 0.035], [side * 0.012, -0.02, 0.04]]);
    line([[side * 0.012, -0.02, 0.04], [side * 0.04, -0.13, 0.055], [side * 0.055, -0.24, 0.05]]);
    add(neck, new THREE.CylinderGeometry(0.014, 0.022, 0.06, 10), pale, side * 0.055, -0.265, 0.05);
  }
  const spinners = train(neck, brass, [0, 0], 0.08, [[6, 0]], 0.03);
  spinners[0].object.position.z = 0.07;
  add(neck, new THREE.SphereGeometry(0.03, 14, 10), jewel, 0, 0, 0.092);
  return spinners;
}

/** An eyepiece over the right eye; `frame` takes the facewear colour. */
export function watchmakersLoupe(face: THREE.Object3D, frame: THREE.Material) {
  const { brass, steel } = brassParts();
  const eye = new THREE.Group();
  eye.position.set(0.22, 0.035, 0);
  face.add(eye);
  // A hollow barrel, with an outer and an inner wall, so the eye shows through it.
  add(eye, new THREE.LatheGeometry([[0.145, 0], [0.16, 0], [0.134, 0.13], [0.116, 0.13], [0.145, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 40).rotateX(Math.PI / 2), frame);
  add(eye, new THREE.TorusGeometry(0.128, 0.017, 10, 44), frame, 0, 0, 0.125);
  add(eye, new THREE.TorusGeometry(0.16, 0.015, 10, 44), frame, 0, 0, 0);
  const glass = add(eye, new THREE.CircleGeometry(0.122, 36), new THREE.MeshPhysicalMaterial({ color: "#d9f2ff", transparent: true, opacity: 0.16, roughness: 0.05, clearcoat: 1, depthWrite: false }), 0, 0, 0.122);
  glass.userData.keepColor = true;
  const rim = new THREE.Group();
  add(rim, gearGeometry(0.2, 20, 0.018, 0.163, false), brass);
  rim.position.z = 0.012;
  eye.add(rim);
  const strap = (points: number[][]) => add(face, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 22, 0.012, 6, false), steel);
  strap([[0.385, 0.075, 0.01], [0.5, 0.09, -0.08], [0.54, 0.07, -0.2]]);
  strap([[0.075, 0.1, 0.02], [-0.2, 0.19, 0.02], [-0.45, 0.14, -0.05], [-0.54, 0.07, -0.2]]);
  return [{ object: rim, teeth: 20, phase: 0, rate: 0.035 }] satisfies Spinner[];
}

/**
 * The Long Hour: a lidded pocket watch, and everything The Hour Stops needs: the
 * great dial, Lemma's eyes as its hands, the echoes, the crack and the chime.
 */
export function longHourWatch(prop: THREE.Object3D, body: THREE.Object3D, shell: THREE.BufferGeometry, eyeLight: THREE.Material, glow: THREE.Color) {
  const { brass, pale, steel } = brassParts();
  const enamel = new THREE.MeshStandardMaterial({ color: "#f3ead6", roughness: 0.42 });
  const facing = (geometry: THREE.BufferGeometry) => geometry.rotateX(Math.PI / 2);
  const watch = new THREE.Group();
  watch.scale.setScalar(0.92);
  prop.add(watch);
  add(watch, facing(new THREE.CylinderGeometry(0.27, 0.27, 0.075, 56)), brass);
  add(watch, new THREE.TorusGeometry(0.262, 0.018, 10, 56), pale, 0, 0, 0.038);
  add(watch, new THREE.CircleGeometry(0.238, 48), enamel, 0, 0, 0.04);
  for (let i = 0; i < 12; i++) {
    const angle = i * TAU / 12, long = i % 3 === 0;
    const mark = add(watch, new THREE.BoxGeometry(long ? 0.016 : 0.009, long ? 0.044 : 0.026, 0.004), steel, Math.sin(angle) * 0.196, Math.cos(angle) * 0.196, 0.043);
    mark.rotation.z = -angle;
  }
  const hand = (length: number, width: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    add(pivot, new THREE.BoxGeometry(width, length, 0.005), steel, 0, length / 2 - 0.018, 0);
    watch.add(pivot);
    return pivot;
  };
  const hour = hand(0.125, 0.018, 0.047), minute = hand(0.185, 0.012, 0.052), second = hand(0.2, 0.005, 0.056);
  add(watch, new THREE.SphereGeometry(0.018, 12, 8), pale, 0, 0, 0.055);
  // The crown turns as it's wound; the bow it hangs from doesn't.
  const crown = new THREE.Group();
  crown.position.y = 0.3;
  watch.add(crown);
  add(crown, new THREE.CylinderGeometry(0.036, 0.042, 0.06, 12), pale);
  add(watch, new THREE.TorusGeometry(0.066, 0.012, 8, 28), brass, 0, 0.385, 0);
  // The lid hinges on the outer side, so it swings open away from Lemma's face.
  const lid = new THREE.Group();
  lid.position.set(0.27, 0, 0.055);
  watch.add(lid);
  add(lid, facing(new THREE.CylinderGeometry(0.268, 0.268, 0.022, 56)), brass, -0.27);
  add(lid, new THREE.TorusGeometry(0.235, 0.008, 8, 56), pale, -0.27, 0, 0.012);
  add(lid, gearGeometry(0.13, 13, 0.008, 0.035), pale, -0.27, 0, 0.014);
  add(lid, new THREE.CircleGeometry(0.262, 44), new THREE.MeshStandardMaterial({ color: "#c29a58", metalness: 0.4, roughness: 0.36, side: THREE.BackSide }), -0.27, 0, -0.012);

  // The great dial. Its parts sit at zero scale or hidden until they're needed,
  // so they never count towards the companion's measured size.
  const dial = new THREE.Group();
  dial.position.y = 0.02;
  dial.visible = false;
  dial.scale.setScalar(0.001);
  body.add(dial);
  const see = (color: string | THREE.Color, additive = false) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const dialMaterial = see("#e0ba72"), backingMaterial = see("#17110a");
  add(dial, new THREE.CircleGeometry(1.2, 80), backingMaterial, 0, 0, -0.74);
  add(dial, new THREE.TorusGeometry(1.2, 0.017, 8, 128), dialMaterial, 0, 0, 0.96);
  add(dial, new THREE.TorusGeometry(1, 0.007, 6, 128), dialMaterial, 0, 0, 0.96);
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.04, 0.004), dialMaterial, 60);
  const place = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const angle = i * TAU / 60;
    place.position.set(Math.sin(angle) * 1.165, Math.cos(angle) * 1.165, 0.96);
    place.rotation.z = -angle;
    place.updateMatrix();
    ticks.setMatrixAt(i, place.matrix);
  }
  ticks.frustumCulled = false;
  dial.add(ticks);

  // Twelve numerals from one small atlas drawn here, each able to light alone.
  const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  const atlas = document.createElement("canvas");
  atlas.width = 512; atlas.height = 384;
  const pen = atlas.getContext("2d")!;
  pen.fillStyle = "#fff"; pen.textAlign = "center"; pen.textBaseline = "middle";
  ROMAN.forEach((numeral, i) => {
    pen.font = `600 ${numeral.length > 3 ? 44 : 58}px Georgia, "Times New Roman", serif`;
    pen.fillText(numeral, (i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 66);
  });
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const numerals = ROMAN.map((_, i) => {
    const geometry = new THREE.PlaneGeometry(0.18, 0.18), uv = geometry.getAttribute("uv");
    for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) + i % 4) / 4, (uv.getY(v) + 2 - Math.floor(i / 4)) / 3);
    const material = new THREE.MeshBasicMaterial({ map: texture, color: "#b9985a", transparent: true, opacity: 0, depthWrite: false });
    const angle = i * TAU / 12;
    const numeral = add(dial, geometry, material, Math.sin(angle) * 1.085, Math.cos(angle) * 1.085, 0.965);
    numeral.rotation.z = -angle;
    return { numeral, material };
  });

  // Lemma's eyes, once they've left its face: each is a pivot holding one long capsule.
  const eyeShape = new THREE.CapsuleGeometry(0.065, 0.09, 5, 12);
  const eyeHand = () => {
    const pivot = new THREE.Group();
    const blade = add(pivot, eyeShape, eyeLight.clone());
    dial.add(pivot);
    return { pivot, blade };
  };
  const eyeHands = [eyeHand(), eyeHand()] as const;

  // Faint copies of Lemma at the hour marks.
  const echoMaterial = see(glow, true);
  echoMaterial.opacity = 0.42;
  const echoes = ROMAN.map((_, i) => {
    const angle = i * TAU / 12;
    const echo = add(dial, shell, echoMaterial, Math.sin(angle) * 1.48, Math.cos(angle) * 1.48, 0.2);
    echo.scale.setScalar(0);
    return echo;
  });

  // The crack: short bright strokes, so it can spread and seal piece by piece.
  const crackMaterial = see("#fff3cf");
  const crack: { stroke: THREE.Mesh; reach: number }[] = [];
  for (const line of [
    [[-0.62, 0.98], [-0.4, 0.62], [-0.48, 0.34], [-0.18, 0.1], [-0.1, -0.2], [0.2, -0.42], [0.16, -0.7], [0.46, -1]],
    [[-0.18, 0.1], [0.18, 0.22], [0.3, 0.52]],
    [[0.2, -0.42], [0.55, -0.38]],
  ]) for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], x = (ax + bx) / 2, y = (ay + by) / 2;
    const stroke = add(dial, new THREE.BoxGeometry(Math.hypot(bx - ax, by - ay), 0.013, 0.003), crackMaterial, x, y, 0.975);
    stroke.rotation.z = Math.atan2(by - ay, bx - ax);
    crack.push({ stroke, reach: Math.hypot(x, y) });
  }
  crack.sort((a, b) => a.reach - b.reach);

  const chimeMaterial = see("#ffe2a0", true);
  const chime = add(dial, new THREE.TorusGeometry(1, 0.022, 8, 120), chimeMaterial, 0, 0, 0.97);
  chime.visible = false;
  return {
    lid, crown, minute, hour, second, dial, dialMaterial, backingMaterial, numerals, eyeHands, echoes, crack, crackMaterial, chime, chimeMaterial,
    /** Extra clock ticks for every gear on Lemma, and how stopped the world is (0 to 1). */
    drive: 0, stillness: 0,
  };
}
