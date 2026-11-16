// What each of Nexus's districts looks like, built only when someone's near
// (see the engine's streaming). Every solid thing drawn here stands where
// world.ts says it's solid, so what you see is what you bump into.
import * as THREE from "three";
import { arch, block, crystal, dataRain, dotTexture, edges, glass, glow, holoCube, plazaTexture, seeded, shadow, sign, signTexture, stone, tag, windows } from "./kit";
import { DAIS, LIBRARY_TERRACE, SOLIDS, STAIRS, TRACK, cityHeight, type District, type DistrictId } from "./world";
import { islandOf } from "./routes";
import { beam, railings, stairs, terrace } from "./terrain";
import { interiorOf, type InteriorId } from "./interiors";

const facing = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};
const lit = (texture: THREE.Texture, tint: THREE.Color) =>
  new THREE.MeshStandardMaterial({ color: "#ffffff", map: texture, emissive: tint, emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.6 });

/** A building's way in: a ring on the ground to step on, and its name floating over it. */
function entrance(id: InteriorId, color: THREE.Color): THREE.Group {
  const room = interiorOf(id)!;
  const { door, out } = room.outside;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 40), glow(color, 0.9));
  ring.rotation.x = -Math.PI / 2;
  // Builders draw from their island's top (see BUILDERS).
  const y = cityHeight(door) - islandOf(room.district).h;
  ring.position.set(door.x, y + 0.08, door.z);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), glow(color, 0.18));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(door.x, y + 0.07, door.z);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTexture("Enter", room.name, `#${color.getHexString()}`), transparent: true, side: THREE.DoubleSide, fog: false }));
  label.position.set(door.x, y + 5.2, door.z);
  label.rotation.y = facing(door, out);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), glow(color));
  gem.position.set(door.x, y + 3.6, door.z);
  group.add(tag(ring, { pulse: 1.4 }), tag(inner, { pulse: 1.4 }), tag(label, { float: 0 }), tag(gem, { spin: 1.5, float: 1 }));
  return group;
}

/** A district's sign by its road in, facing the Nexus. */
function gateSign(d: District, x: number, z: number): THREE.Group {
  const s = sign(d.name, d.subtitle, new THREE.Color(d.color), 20);
  s.position.set(x, 0, z);
  s.rotation.y = facing({ x, z }, { x: 0, z: 0 });
  return s;
}

function holoCubes(group: THREE.Group, d: District, color: THREE.Color, rand: () => number, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = 10 + rand() * (d.radius - 16);
    group.add(at(holoCube(color, 1.6 + rand() * 2.4, rand), d.center.x + Math.cos(a) * r, 14 + rand() * 16, d.center.z + Math.sin(a) * r));
  }
}

function rains(group: THREE.Group, d: District, color: THREE.Color, rand: () => number, count = 5) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = d.radius * (0.55 + rand() * 0.4);
    const column = dataRain(color, 26 + rand() * 30);
    column.position.x = d.center.x + Math.cos(a) * r;
    column.position.z = d.center.z + Math.sin(a) * r;
    column.rotation.y = rand() * Math.PI;
    group.add(column);
  }
}

// ---------- The Nexus ----------

function nexus(d: District): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(d.color), hex = `#${color.getHexString()}`, rand = seeded("nexus");
  // The square round the dais: rings and spokes of light on the ground.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(d.radius * 2, d.radius * 2), new THREE.MeshBasicMaterial({ map: plazaTexture(hex), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  group.add(floor);
  // The dais the citadel stands on, its stairs down to every road, and its balustrade.
  const flights = STAIRS.filter((st) => st.id.startsWith("dais"));
  const base = DAIS.base;
  group.add(terrace(DAIS, color, base), railings([DAIS], flights, color, base), ...flights.map((st) => stairs(st, color, base)));
  const top = new THREE.Mesh(new THREE.CircleGeometry(DAIS.kind === "circle" ? DAIS.r - 0.6 : 0, 96), new THREE.MeshBasicMaterial({ map: plazaTexture(hex), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = DAIS.h - base + 0.04;
  group.add(top);
  // The citadel: a crowd of crystal spires round the great one, rising in tiers.
  const citadel = new THREE.Group();
  citadel.position.y = DAIS.h - base;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.25, r = 4 + (i % 3) * 2.6 + rand();
    const tall = 58 - r * 4 + rand() * 10;
    citadel.add(at(crystal(color, 1.2 + rand() * 1.3, tall), Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  // Low arcaded walls round the citadel's foot.
  const arcade = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 10.8, 5, 48, 1, true), new THREE.MeshStandardMaterial({ color: "#ffffff", map: (() => { const t = windows(hex, 16, 1, true, "citadel"); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })(), emissive: color, emissiveIntensity: 0.6, side: THREE.DoubleSide, transparent: true }));
  arcade.material.emissiveMap = arcade.material.map;
  arcade.position.y = 2.5;
  citadel.add(arcade);
  group.add(citadel);
  // Beams of light up from the top of every flight of stairs.
  for (const st of flights) {
    for (const side of [-1, 1]) {
      const foot = { x: st.top.x - st.dir.z * side * (st.width / 2 + 0.5), z: st.top.z + st.dir.x * side * (st.width / 2 + 0.5) };
      group.add(at(beam(color, 46 + rand() * 20, 0.5), foot.x, DAIS.h - base, foot.z));
    }
  }
  // The pylons round the square.
  for (const s of SOLIDS.filter((s) => s.kind === "circle" && s.r > 1.5 && s.r < 2 && Math.hypot(s.x, s.z) < 40)) {
    if (s.kind === "circle") group.add(at(crystal(color, s.r, 6.5), s.x, 0, s.z), at(beam(color, 30, 0.6), s.x, 6.5, s.z));
  }
  // A geodesic orb high over everything.
  group.add(at(tag(edges(new THREE.IcosahedronGeometry(10, 1), color, 0.7), { spin: 0.08, float: 0 }), 0, 96, 0));
  // The sign over the way up, facing you as you arrive.
  group.add(at(sign("Nexus", "Intelligence Exchange", color, 24), 0, 0, 29));
  rains(group, d, color, rand, 10);
  return group;
}

// ---------- Memory District: the Great Library ----------

function memory(d: District): THREE.Group {
  const outer = new THREE.Group();
  const color = new THREE.Color(d.color), rand = seeded("memory");
  const warm = stone(color);
  // The library stands on its terrace: everything up there is built in `group`, raised.
  const group = new THREE.Group();
  const base = LIBRARY_TERRACE.base;
  group.position.y = LIBRARY_TERRACE.h - base;
  const flight = STAIRS.filter((st) => st.id === "library");
  outer.add(group, terrace(LIBRARY_TERRACE, color, base), railings([LIBRARY_TERRACE], flight, color, base), ...flight.map((st) => stairs(st, color, base)));
  // Lamps of light either side of the grand staircase.
  for (const x of [-156.5, -143.5]) outer.add(at(beam(color, 40, 0.5), x, 0, -59));
  // The hall: tall walls of arched windows under a steep roof.
  const hall = { x: -150, z: -96, w: 46, d: 26, h: 15 };
  const walls = new THREE.BoxGeometry(hall.w, hall.h, hall.d);
  const front = windows("#ffd89a", 18, 3, true, "library-front"), side = windows("#ffd89a", 10, 3, true, "library-side");
  const faces = [lit(side, color), lit(side, color), shadow(), shadow(), lit(front, color), lit(front, color)];
  const body = new THREE.Mesh(walls, faces);
  body.position.set(hall.x, hall.h / 2, hall.z);
  const bodyEdges = edges(walls, color);
  bodyEdges.position.copy(body.position);
  group.add(body, bodyEdges);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-hall.d / 2 - 1, 0);
  roofShape.lineTo(0, 10);
  roofShape.lineTo(hall.d / 2 + 1, 0);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: hall.w + 2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(hall.w + 2) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, shadow());
  const roofEdges = edges(roofGeo, color);
  roof.position.set(hall.x, hall.h, hall.z);
  roofEdges.position.copy(roof.position);
  group.add(roof, roofEdges);
  // The grand doorway, glowing.
  const door = arch(color, 9, 13);
  door.position.set(hall.x, 0, hall.z + hall.d / 2 + 0.8);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(8, 8.5), glow(color, 0.55));
  doorway.position.set(hall.x, 4.25, hall.z + hall.d / 2 + 0.2);
  group.add(door, tag(doorway, { pulse: 0.8 }));
  // The two front towers with pointed roofs.
  for (const x of [-170, -130]) {
    const tower = new THREE.Group();
    const geo = new THREE.CylinderGeometry(4, 4, 24, 16);
    const mesh = new THREE.Mesh(geo, lit(windows("#ffd89a", 12, 5, true, `tower${x}`), color));
    mesh.position.y = 12;
    const line = edges(geo, color, 0.6);
    line.position.y = 12;
    tower.add(mesh, line, block(new THREE.ConeGeometry(4.8, 12, 16), shadow(), color, 0, 24, 0));
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), glow(color));
    tip.position.y = 37;
    tower.add(tag(tip, { spin: 1, pulse: 1.3 }));
    group.add(at(tower, x, 0, -81));
  }
  // Obelisks either side of the way in.
  for (const x of [-157, -143]) group.add(at(crystal(color, 1.2, 9), x, 0, -74));
  // The archive towers (down on the ground): rings of lit shelves, floor upon floor.
  for (const s of [{ x: -186, z: -60, r: 7 }, { x: -112, z: -40, r: 5 }]) {
    const tower = new THREE.Group();
    const height = s.r * 4.6;
    tower.add(block(new THREE.CylinderGeometry(s.r * 0.9, s.r, height, 20), warm, color, 0, 0, 0));
    for (let y = 3; y < height; y += 3) {
      const shelf = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.98, 0.12, 6, 48), glow(color, 0.75));
      shelf.rotation.x = Math.PI / 2;
      shelf.position.y = y;
      tower.add(shelf);
    }
    tower.add(block(new THREE.ConeGeometry(s.r * 1.1, s.r * 1.6, 20), shadow(), color, 0, height, 0));
    outer.add(at(tower, s.x, 0, s.z));
  }
  // Books drifting round the library.
  const orbit = tag(new THREE.Group(), { spin: 0.06 });
  orbit.position.set(hall.x, 0, hall.z);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 32 + rand() * 6;
    const book = new THREE.Group();
    book.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.3), stone(color)), edges(new THREE.BoxGeometry(1.8, 0.35, 1.3), color));
    book.position.set(Math.cos(a) * r, 18 + rand() * 10, Math.sin(a) * r);
    book.rotation.set(rand(), rand() * Math.PI, rand() * 0.5);
    orbit.add(tag(book, { spin: 0.5 + rand(), float: rand() * Math.PI * 2 }));
  }
  group.add(orbit);
  outer.add(gateSign(d, -116, -60), entrance("library", color));
  rains(outer, d, color, rand, 4);
  return outer;
}

// ---------- Computation District ----------

function computation(d: District): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(d.color), rand = seeded("computation");
  // Compute cubes: glass, with a bright core working away inside.
  const cubes = SOLIDS.filter((s) => s.kind === "box" && s.w === 8 && Math.hypot(s.x - d.center.x, s.z - d.center.z) < d.radius);
  for (const s of cubes) {
    if (s.kind !== "box") continue;
    const cube = new THREE.Group();
    const geo = new THREE.BoxGeometry(8, 8, 8);
    const shell = new THREE.Mesh(geo, glass(color, 0.14));
    shell.position.y = 4.4;
    const line = edges(geo, color);
    line.position.y = 4.4;
    const core = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), glow(color, 0.95));
    core.position.y = 4.4;
    cube.add(block(new THREE.BoxGeometry(9, 0.4, 9), shadow(), color, 0, 0, 0), shell, line, tag(core, { spin: 0.7, pulse: 1.6 + rand() }));
    group.add(at(cube, s.x, 0, s.z));
  }
  // Conduits of light along the ground between them.
  const conduit = (x1: number, z1: number, x2: number, z2: number) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.6, length), glow(color, 0.6));
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    strip.position.set((x1 + x2) / 2, 0.08, (z1 + z2) / 2);
    group.add(tag(strip, { pulse: 0.9 }));
  };
  for (const z of [-108, -72]) conduit(137, z, 173, z);
  for (const x of [137, 155, 173]) conduit(x, -108, x, -72);
  conduit(173, -72, 180, -48);
  // The processor: a stepped ziggurat with a beacon on top.
  const steps = [[16, 4], [12, 4], [8, 4], [4, 6]];
  let y = 0;
  for (const [size, h] of steps) {
    group.add(block(new THREE.BoxGeometry(size, h, size), stone(color), color, 180, y, -48));
    y += h;
  }
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), glow(color));
  beacon.position.set(180, y + 2, -48);
  group.add(tag(beacon, { spin: 1.4, pulse: 2 }), at(dataRain(color, 60), 180, 0, -48));
  // The way into the Processor Core, on the ziggurat's west face.
  const coreDoor = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), glow(color, 0.5));
  coreDoor.position.set(171.9, 2.5, -48);
  coreDoor.rotation.y = -Math.PI / 2;
  group.add(tag(coreDoor, { pulse: 0.9 }), at(arch(color, 5, 7), 171.6, 0, -48));
  (group.children[group.children.length - 1] as THREE.Group).rotation.y = Math.PI / 2;
  group.add(gateSign(d, 116, -60), entrance("core", color));
  holoCubes(group, d, color, rand, 8);
  rains(group, d, color, rand, 4);
  return group;
}

// ---------- Simulation Chambers ----------

function simulation(d: District): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(d.color), rand = seeded("simulation");
  const dome = (x: number, z: number, r: number, inside: THREE.Object3D) => {
    const half = new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    group.add(at(new THREE.Mesh(half, glass(color, 0.16)), x, 0, z), at(edges(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), color, 0.4), x, 0, z));
    const base = new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 6, 64), glow(color, 0.9));
    base.rotation.x = Math.PI / 2;
    group.add(at(base, x, 0.2, z), at(inside, x, r * 0.42, z));
  };
  // A spinning galaxy in the great dome.
  const stars = new Float32Array(2400 * 3), colours = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) {
    const arm = i % 3, t = rand() * 4, a = t * 1.9 + (arm / 3) * Math.PI * 2;
    const r = t * 2.2 + rand() * 0.9;
    stars.set([Math.cos(a) * r, (rand() - 0.5) * 0.8, Math.sin(a) * r], i * 3);
    const c = new THREE.Color().setHSL(0.72 + rand() * 0.15, 0.8, 0.6 + rand() * 0.3);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  const galaxyGeo = new THREE.BufferGeometry();
  galaxyGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  galaxyGeo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const galaxy = tag(new THREE.Points(galaxyGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 0.25, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), { spin: 0.25 });
  dome(150, 138, 13, galaxy);
  // The great dome's way in: an arch at its edge, facing the Nexus.
  {
    const { door } = interiorOf("observatory")!.outside;
    const u = { x: (door.x - 150) / 14.2, z: (door.z - 138) / 14.2 };
    const gate = arch(color, 5, 7);
    gate.position.set(150 + u.x * 12.6, 0, 138 + u.z * 12.6);
    gate.rotation.y = Math.atan2(u.x, u.z) + Math.PI / 2;
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), glow(color, 0.45));
    veil.position.set(150 + u.x * 12.9, 2.5, 138 + u.z * 12.9);
    veil.rotation.y = Math.atan2(u.x, u.z);
    group.add(gate, tag(veil, { pulse: 0.9 }), entrance("observatory", color));
  }
  // A little planet of mountains.
  const planet = new THREE.Group();
  planet.add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 3.5, 1, 24), new THREE.MeshStandardMaterial({ color: "#2f8f5b", emissive: "#14432a", emissiveIntensity: 0.6, flatShading: true })));
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rand(), 2 + rand() * 2, 5), new THREE.MeshStandardMaterial({ color: "#9aa7c7", emissive: "#2a3557", emissiveIntensity: 0.5, flatShading: true }));
    const a = rand() * Math.PI * 2, r = rand() * 3;
    m.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    planet.add(m);
  }
  dome(118, 150, 8, tag(planet, { spin: 0.2 }));
  // An ocean world with a ring.
  const ocean = new THREE.Group();
  ocean.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16), new THREE.MeshStandardMaterial({ color: "#2e7bff", emissive: "#0d2c6b", emissiveIntensity: 0.7 })));
  const band = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 6, 64), glow(color, 0.9));
  band.rotation.x = 1.2;
  ocean.add(band);
  dome(160, 100, 7, tag(ocean, { spin: 0.4, float: 1 }));
  // The ring track high on its pillars.
  const track = new THREE.Mesh(new THREE.TorusGeometry(TRACK.r, 0.9, 8, 220), stone(color));
  track.rotation.x = Math.PI / 2;
  const trackGlow = new THREE.Mesh(new THREE.TorusGeometry(TRACK.r, 0.15, 6, 220), glow(color));
  trackGlow.rotation.x = Math.PI / 2;
  group.add(at(track, TRACK.x, 15, TRACK.z), at(trackGlow, TRACK.x, 16, TRACK.z));
  for (const s of SOLIDS) {
    if (s.kind === "circle" && Math.abs(Math.hypot(s.x - TRACK.x, s.z - TRACK.z) - TRACK.r) < 0.5) {
      group.add(block(new THREE.CylinderGeometry(s.r, s.r, 15, 8), stone(color), color, s.x, 0, s.z));
    }
  }
  // A floor of coloured tiles that never stops dancing.
  const tiles = new THREE.Group();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(((i * 6 + j) * 0.137) % 1, 0.85, 0.6), transparent: true, opacity: 0.8 }));
    tile.rotation.x = -Math.PI / 2;
    tile.position.set((i - 2.5) * 2.6, 0.07, (j - 2.5) * 2.6);
    tiles.add(tag(tile, { pulse: 1 + rand() * 3 }));
  }
  group.add(at(tiles, 108, 0, 104));
  group.add(gateSign(d, 100, 94));
  holoCubes(group, d, color, rand, 5);
  rains(group, d, color, rand, 4);
  return group;
}

// ---------- Model District: the gardens ----------

/** A pyramid of pyramids, `depth` levels deep, its base `size` across. */
function fractal(color: THREE.Color, size: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const build = (x: number, y: number, z: number, s: number, level: number) => {
    if (level === 0) {
      const geo = new THREE.ConeGeometry(s / Math.SQRT2, s * 0.8, 4);
      geo.rotateY(Math.PI / 4);
      group.add(block(geo, stone(color), color, x, y, z));
      return;
    }
    const h = s / 2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) build(x + (dx * h) / 2, y, z + (dz * h) / 2, h, level - 1);
    build(x, y + s * 0.4, z, h, level - 1);
  };
  build(0, 0, 0, size, depth);
  return group;
}

function gardens(d: District): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(d.color), rand = seeded("gardens");
  // The data pool, data rising out of it.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshBasicMaterial({ color: "#47b8ff", transparent: true, opacity: 0.5 }));
  pool.rotation.x = -Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(12.2, 0.3, 8, 80), glow(color));
  rim.rotation.x = Math.PI / 2;
  group.add(at(pool, -150, 0.07, 140), at(rim, -150, 0.3, 140));
  for (let i = 0; i < 6; i++) {
    const rise = dataRain(color, 14 + rand() * 10);
    const scroll = rise.userData.scroll as { speed: number };
    scroll.speed = -scroll.speed;
    const a = (i / 6) * Math.PI * 2;
    rise.position.x = -150 + Math.cos(a) * 6;
    rise.position.z = 140 + Math.sin(a) * 6;
    rise.rotation.y = a;
    group.add(rise);
  }
  // Circuit trees: branches like traces, nodes lit at their ends.
  for (const s of SOLIDS.filter((s) => s.kind === "circle" && s.r === 2.5)) {
    if (s.kind !== "circle") continue;
    const tree = new THREE.Group();
    tree.add(block(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), stone(color), color, 0, 0, 0));
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + rand(), len = 2.5 + rand() * 1.5;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, len, 5), stone(color));
      branch.position.set(Math.cos(a) * len * 0.35, 6 + b * 0.6, Math.sin(a) * len * 0.35);
      branch.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), glow(color));
      node.position.set(Math.cos(a) * len * 0.7, 6.6 + b * 0.6, Math.sin(a) * len * 0.7);
      tree.add(branch, tag(node, { pulse: 1 + rand() * 2 }));
    }
    tree.add(at(tag(edges(new THREE.IcosahedronGeometry(3.6, 1), color, 0.5), { spin: 0.12 }), 0, 8.5, 0));
    group.add(at(tree, s.x, 0, s.z));
  }
  // Fractal pyramids.
  group.add(at(fractal(color, 20, 2), -168, 0, 94), at(fractal(color, 14, 2), -100, 0, 152));
  // The way into the Model Forge, on the great pyramid's east face.
  const forgeDoor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.2), glow(color, 0.5));
  forgeDoor.position.set(-157.9, 2.1, 94);
  forgeDoor.rotation.y = Math.PI / 2;
  const forgeArch = arch(color, 5, 6.5);
  forgeArch.position.set(-157.6, 0, 94);
  forgeArch.rotation.y = Math.PI / 2;
  group.add(tag(forgeDoor, { pulse: 0.9 }), forgeArch, entrance("forge", color));
  group.add(gateSign(d, -100, 94));
  holoCubes(group, d, color, rand, 5);
  rains(group, d, color, rand, 3);
  return group;
}

/** Each district drawn from its island's top: everything in a builder stands at 0 on it. */
const raised = (build: (d: District) => THREE.Group) => (d: District) => {
  const group = new THREE.Group();
  group.position.y = islandOf(d.id).h;
  group.add(build(d));
  return group;
};

export const BUILDERS: Record<DistrictId, (d: District) => THREE.Group> = {
  nexus: raised(nexus), memory: raised(memory), computation: raised(computation), simulation: raised(simulation), gardens: raised(gardens),
};

// ---------- Always there: the roads' gateways and the skyline ----------

/** A ring of far-off towers past the map's edge, so the city seems to go on. */
export function skyline(): THREE.Group {
  const group = new THREE.Group();
  const rand = seeded("skyline");
  const face = windows("#6f9dff", 6, 14, false, "skyline");
  const material = new THREE.MeshStandardMaterial({ color: "#05080f", map: face, emissive: new THREE.Color("#3b6bff"), emissiveMap: face, emissiveIntensity: 0.4, roughness: 0.9, fog: false });
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rand() * 0.05, r = 300 + rand() * 140;
    const w = 14 + rand() * 22, h = 60 + rand() * 140;
    const geo = rand() < 0.3 ? new THREE.CylinderGeometry(w * 0.15, w * 0.55, h, 6) : new THREE.BoxGeometry(w, h, w);
    const tower = new THREE.Mesh(geo, material);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    tower.rotation.y = rand() * Math.PI;
    group.add(tower);
    if (rand() < 0.5) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), glow(new THREE.Color("#8fc4ff")));
      light.material.fog = false;
      light.position.set(tower.position.x, h + 2, tower.position.z);
      group.add(tag(light, { pulse: 0.6 + rand() }));
    }
  }
  return group;
}

// ---------- The sky ----------

/** Overhead: a network of light strung across the sky, and great shapes turning high above the districts. */
export function overhead(): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color("#8fc4ff"), rand = seeded("overhead");
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < 44; i++) {
    const a = rand() * Math.PI * 2, r = 25 + rand() * 120;
    nodes.push(new THREE.Vector3(Math.cos(a) * r, 62 + rand() * 50 - r * 0.12, Math.sin(a) * r));
  }
  const links: number[] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => [n.distanceTo(m), j] as const).filter(([, j]) => j !== i).sort((x, y) => x[0] - y[0]).slice(0, 2);
    for (const [, j] of near) if (j > i || !near.some(([, k]) => k === i)) links.push(n.x, n.y, n.z, nodes[j].x, nodes[j].y, nodes[j].z);
  });
  const web = new THREE.BufferGeometry();
  web.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
  const dots = new THREE.BufferGeometry().setFromPoints(nodes);
  const net = tag(new THREE.Group(), { spin: 0.008 });
  net.add(
    new THREE.LineSegments(web, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.6), transparent: true, opacity: 0.45, fog: false })),
    new THREE.Points(dots, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, color: "#dff0ff", size: 3.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
  );
  group.add(net);
  // Wireframe shapes turning round the citadel.
  [new THREE.OctahedronGeometry(5), new THREE.IcosahedronGeometry(4.5), new THREE.DodecahedronGeometry(4), new THREE.OctahedronGeometry(3.5)].forEach((geo, i) => {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    group.add(tag(at(edges(geo, color, 0.8), Math.cos(a) * 42, 52 + i * 6, Math.sin(a) * 42), { spin: 0.2 + i * 0.05, float: i }));
  });
  // A twisted ring of light over the Simulation Chambers, and a holographic cube over the Memory District.
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(12, 2.2, 160, 16, 2, 3), new THREE.MeshStandardMaterial({ color: "#c9c3e6", emissive: "#5b4a9a", emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 }));
  group.add(tag(at(knot, 120, 72, 60), { spin: 0.1, float: 2 }));
  const cube = new THREE.Group();
  cube.add(edges(new THREE.BoxGeometry(18, 18, 18), new THREE.Color("#ffd89a"), 0.85));
  for (let i = 0; i < 6; i++) cube.add(at(crystal(new THREE.Color("#ffd89a"), 0.9 + rand(), 5 + rand() * 7), (rand() - 0.5) * 9, -7, (rand() - 0.5) * 9));
  group.add(tag(at(cube, -125, 62, -55), { spin: 0.12, float: 3 }));
  return group;
}