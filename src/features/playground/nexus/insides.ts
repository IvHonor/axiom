// What the insides of Nexus's buildings look like (interiors.ts has their
// layouts). Like the districts, everything solid stands exactly where the
// room's map says it's solid. No ceilings: the camera looks down from above,
// so the walls stop at head height and the sky (or the dark) shows over them,
// and a wall between the camera and you fades away (each says which way it
// faces in `userData.face`).
import * as THREE from "three";
import { arch, block, dataRain, dotTexture, edges, glass, glow, plazaTexture, seeded, shadow, signTexture, stone, tag, windows } from "./kit";
import { CORE, NETWORK, PEDESTALS, PODS, RACK_COLUMNS, STACK_ROWS, TELESCOPE, type Interior, type InteriorId } from "./interiors";

const WALL = 6;
const DOOR_GAP = 6;

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

function canvas(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A material lit from within by its own texture. */
const litBy = (texture: THREE.Texture, tint: THREE.Color, strength = 0.9) =>
  new THREE.MeshStandardMaterial({ color: "#ffffff", map: texture, emissive: tint, emissiveMap: texture, emissiveIntensity: strength, roughness: 0.7 });

/** A floor plane, `w` by `d`, of `material`. */
function floor(w: number, d: number, material: THREE.Material, y = 0.02): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Four straight walls, a gap for the door in the south one. */
function walls(room: Interior, material: THREE.Material, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const { halfW, halfD } = room;
  const side = (halfW - DOOR_GAP / 2);
  const pieces: [number, number, number, number, number, number][] = [
    [0, -halfD, halfW * 2 + 1, 1, 0, -1],
    [-halfW, 0, 1, halfD * 2 + 1, -1, 0],
    [halfW, 0, 1, halfD * 2 + 1, 1, 0],
    [-(DOOR_GAP / 2 + side / 2), halfD, side, 1, 0, 1],
    [DOOR_GAP / 2 + side / 2, halfD, side, 1, 0, 1],
  ];
  for (const [x, z, w, d, fx, fz] of pieces) {
    const piece = block(new THREE.BoxGeometry(w, WALL, d), material.clone(), color, x, 0, z);
    piece.userData.face = { x: fx, z: fz };
    group.add(piece);
  }
  return group;
}

/** The way out: an arch in the doorway, a glowing portal and a ring on the floor to step on. */
function exit(room: Interior, color: THREE.Color, where: string): THREE.Group {
  const group = new THREE.Group();
  const wallZ = room.round ? room.round : room.halfD;
  const gate = at(arch(color, DOOR_GAP, 8), 0, 0, wallZ);
  gate.userData.face = { x: 0, z: 1 };
  group.add(gate);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_GAP - 0.4, 5), glow(color, 0.4));
  portal.position.set(0, 2.5, wallZ + 0.3);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), glow(color, 0.85));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(room.door.x, 0.05, room.door.z);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: signTexture("Way out", where, `#${color.getHexString()}`), transparent: true, fog: false }));
  label.position.set(0, 9.6, wallZ);
  label.rotation.y = Math.PI;
  group.add(tag(portal, { pulse: 0.9 }), tag(ring, { pulse: 1.6 }), label);
  return group;
}

/** Specks of light drifting in the air. */
function motes(room: Interior, color: string, count: number, height: number): THREE.Points {
  const rand = seeded(`${room.id}-motes`);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) positions.set([(rand() * 2 - 1) * room.halfW * 0.9, 0.5 + rand() * height, (rand() * 2 - 1) * room.halfD * 0.9], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return tag(new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, color, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })), { float: 0, spin: 0.01 });
}

function light(color: string, power: number, x: number, y: number, z: number, reach = 40): THREE.PointLight {
  const l = new THREE.PointLight(color, power, reach, 1.6);
  l.position.set(x, y, z);
  return l;
}

// ---------- The Great Library ----------

/** Rows of book spines, every colour, for the shelves' faces. */
function booksTexture(): THREE.CanvasTexture {
  const rand = seeded("spines");
  return canvas(512, 256, (g) => {
    g.fillStyle = "#1a0f08";
    g.fillRect(0, 0, 512, 256);
    for (let shelf = 0; shelf < 4; shelf++) {
      const top = shelf * 64 + 6;
      for (let x = 4; x < 508;) {
        const w = 6 + Math.floor(rand() * 9), h = 40 + Math.floor(rand() * 16);
        g.fillStyle = `hsl(${Math.floor(rand() * 360)} ${45 + rand() * 30}% ${32 + rand() * 22}%)`;
        g.fillRect(x, top + 56 - h, w, h);
        if (rand() < 0.3) {
          g.fillStyle = "rgba(255, 216, 154, 0.7)";
          g.fillRect(x + 1, top + 56 - h + 6, w - 2, 2);
        }
        x += w + 1;
      }
      g.fillStyle = "#3a2414";
      g.fillRect(0, top + 56, 512, 8);
    }
  }, true);
}

function planks(): THREE.CanvasTexture {
  const rand = seeded("planks");
  return canvas(512, 512, (g) => {
    for (let y = 0; y < 512; y += 32) {
      for (let x = (y / 32) % 2 ? -64 : 0; x < 512; x += 128) {
        g.fillStyle = `hsl(26 ${30 + rand() * 12}% ${11 + rand() * 5}%)`;
        g.fillRect(x, y, 127, 31);
      }
    }
  }, true);
}

function library(room: Interior): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(room.color), rand = seeded("library-inside");
  const wood = planks();
  wood.repeat.set(room.halfW / 6, room.halfD / 6);
  group.add(floor(room.halfW * 2, room.halfD * 2, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 })));
  // A red runner down the nave, edged in gold.
  group.add(floor(5, room.halfD * 2 - 4, new THREE.MeshStandardMaterial({ color: "#5a1420", roughness: 0.9 }), 0.04));
  for (const x of [-2.6, 2.6]) group.add(at(floor(0.2, room.halfD * 2 - 4, glow(color, 0.6), 0.05), x, 0, 0));
  // Walls of tall arched windows, warm light behind.
  group.add(walls(room, litBy(windows("#ffd89a", 24, 2, true, "library-inside"), color, 0.6), color));
  // The stacks.
  const spines = booksTexture();
  const shelfFaces = (w: number) => {
    const face = spines.clone();
    face.needsUpdate = true;
    face.repeat.set(w / 8, 1);
    const side = new THREE.MeshStandardMaterial({ color: "#2a180c", roughness: 0.8 });
    const books = new THREE.MeshStandardMaterial({ map: face, emissive: color, emissiveMap: face, emissiveIntensity: 0.25, roughness: 0.8 });
    return [side, side, shadow(), side, books, books];
  };
  for (const z of STACK_ROWS) {
    for (const x of [-19, 19]) {
      const geo = new THREE.BoxGeometry(14, 4.5, 1.2);
      const shelf = new THREE.Mesh(geo, shelfFaces(14));
      shelf.position.set(x, 2.25, z);
      const line = edges(geo, color, 0.35);
      line.position.copy(shelf.position);
      group.add(shelf, line);
      // A lamp at each end of the row.
      for (const end of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(color));
        lamp.position.set(x + end * 7.2, 4.8, z);
        group.add(tag(lamp, { pulse: 0.4 + rand() * 0.3 }));
      }
    }
  }
  // Reading tables, lamps lit and books open.
  for (const x of [-5, 5]) {
    group.add(block(new THREE.BoxGeometry(2.4, 0.9, 10), new THREE.MeshStandardMaterial({ color: "#3a2414", roughness: 0.7 }), color, x, 0, -2));
    for (const z of [-5.5, -2, 1.5]) {
      group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), shadow()), x, 1.35, z));
      group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), glow(new THREE.Color("#ffe2b0"))), x, 1.9, z), { pulse: 0.5 }));
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: "#f3e6cc" }));
      page.rotation.x = -Math.PI / 2;
      page.position.set(x + (rand() - 0.5) * 0.8, 0.92, z + 1.1);
      page.rotation.z = (rand() - 0.5) * 0.6;
      group.add(page);
    }
  }
  // The atlas desk, its globe turning over it.
  group.add(block(new THREE.CylinderGeometry(3, 3, 1.1, 40), new THREE.MeshStandardMaterial({ color: "#3a2414", roughness: 0.6 }), color, 0, 0, -16));
  group.add(tag(at(edges(new THREE.IcosahedronGeometry(2.2, 2), color, 0.8), 0, 4.6, -16), { spin: 0.25 }));
  const meridian = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.05, 6, 64), glow(color));
  group.add(tag(at(meridian, 0, 4.6, -16), { spin: -0.4 }));
  // Reading nooks: armchairs round a low table with a candle, on a rug.
  for (const side of [-1, 1]) {
    const rug = floor(9, 8, new THREE.MeshStandardMaterial({ color: side < 0 ? "#173a3a" : "#3a1730", roughness: 1 }), 0.04);
    rug.position.set(side * 22, 0.04, 15);
    group.add(rug);
    for (const [x, z] of [[24, 15], [20, 17.5]]) {
      const chair = new THREE.Group();
      const fabric = new THREE.MeshStandardMaterial({ color: side < 0 ? "#1f6b66" : "#7a2448", roughness: 0.9 });
      chair.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.7), fabric), 0, 0.5, 0));
      chair.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 0.4), fabric), 0, 1.1, -0.7));
      chair.position.set(side * x, 0, z);
      chair.lookAt(side * 22, 0, 12);
      group.add(chair);
    }
    group.add(block(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 20), new THREE.MeshStandardMaterial({ color: "#3a2414" }), color, side * 22, 0, 12));
    group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glow(new THREE.Color("#ffb347"))), side * 22, 0.85, 12), { pulse: 3 }));
    group.add(light("#ffb347", 6, side * 22, 2.5, 13, 14));
  }
  // Books drifting over the nave.
  const orbit = tag(new THREE.Group(), { spin: 0.05 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 6 + rand() * 8;
    const book = new THREE.Group();
    const cover = new THREE.Color().setHSL(rand(), 0.55, 0.4);
    book.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.75), new THREE.MeshStandardMaterial({ color: cover, emissive: cover, emissiveIntensity: 0.3 })));
    book.position.set(Math.cos(a) * r, 7 + rand() * 3, Math.sin(a) * r - 2);
    book.rotation.set(rand(), rand() * Math.PI, rand() * 0.5);
    orbit.add(tag(book, { spin: 0.6 + rand(), float: rand() * 6 }));
  }
  group.add(orbit, motes(room, "#ffd89a", 260, 8));
  // Chandeliers over the nave.
  for (const z of [-12, 0, 12]) {
    group.add(tag(at(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), glow(color)), 0, 8.5, z), { spin: 0.2 }));
    (group.children[group.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
  }
  group.add(light("#ffd89a", 26, 0, 9, -10, 50), light("#ffd89a", 22, 0, 9, 10, 50));
  group.add(exit(room, color, "Memory District"));
  return group;
}

// ---------- The Processor Core ----------

function circuitTexture(color: string): THREE.CanvasTexture {
  const rand = seeded("circuit");
  return canvas(512, 512, (g) => {
    g.fillStyle = "#040a12";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      let x = Math.floor(rand() * 16) * 32, y = Math.floor(rand() * 16) * 32;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        if (rand() < 0.5) x += (rand() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rand() * 3));
        else y += (rand() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rand() * 3));
        g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 0.7;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.35;
    }
    g.globalAlpha = 1;
  }, true);
}

function core(room: Interior): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(room.color), hex = `#${color.getHexString()}`, rand = seeded("core-inside");
  const circuit = circuitTexture(hex);
  circuit.repeat.set(room.halfW / 8, room.halfD / 8);
  group.add(floor(room.halfW * 2, room.halfD * 2, litBy(circuit, color, 0.7)));
  group.add(walls(room, stone(color), color));
  // Light strips round the walls.
  for (const y of [1, 5]) {
    for (const [x, z, w, d] of [[0, -room.halfD + 0.55, room.halfW * 2, 0.1], [-room.halfW + 0.55, 0, 0.1, room.halfD * 2], [room.halfW - 0.55, 0, 0.1, room.halfD * 2]] as const) {
      group.add(tag(at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), glow(color, 0.8)), x, y, z), { pulse: 0.6 }));
    }
  }
  // The racks, their lights blinking.
  for (const x of RACK_COLUMNS) {
    for (const z of [-10, 4]) {
      const leds = windows(rand() < 0.5 ? "#6fe3ff" : "#5ef2a0", 6, 16, false, `rack${x}${z}`);
      leds.wrapS = leds.wrapT = THREE.RepeatWrapping;
      const face = litBy(leds, color, 1.1);
      const geo = new THREE.BoxGeometry(1.4, 4, 7);
      const rack = new THREE.Mesh(geo, [face, face, shadow(), shadow(), shadow(), shadow()]);
      rack.position.set(x, 2, z);
      const line = edges(geo, color, 0.5);
      line.position.copy(rack.position);
      group.add(tag(rack, { scroll: { texture: leds, speed: 0.05 + rand() * 0.1 } }), line);
    }
  }
  // Conduits along the floor from each bank to the core.
  for (const side of [-1, 1]) {
    const strip = floor(7.5, 0.5, glow(color, 0.7), 0.05);
    strip.position.set(side * 8.75, 0.05, -1.5);
    group.add(tag(strip, { pulse: 1.2 }));
  }
  // The core: a glass column with light working inside it, rings turning round it.
  const { x, z, r } = CORE;
  group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 11, 48, 1, true), glass(color, 0.16)), x, 5.5, z));
  group.add(at(edges(new THREE.CylinderGeometry(r, r, 11, 12, 1, true), color, 0.5), x, 5.5, z));
  group.add(block(new THREE.CylinderGeometry(r + 0.4, r + 0.6, 0.6, 48), shadow(), color, x, 0, z));
  group.add(tag(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 10.5, 24), glow(color, 0.9)), x, 5.6, z), { pulse: 1.8 }));
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 1 + i * 0.8, 0.1, 6, 80), glow(color, 0.85));
    const holder = tag(new THREE.Group(), { spin: (i % 2 ? -1 : 1) * (0.4 + i * 0.2) });
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
    holder.add(ring);
    group.add(at(holder, x, 3 + i * 3, z));
  }
  for (let i = 0; i < 4; i++) {
    const rain = dataRain(color, 10);
    const a = (i / 4) * Math.PI * 2;
    rain.position.x = x + Math.cos(a) * 2.6;
    rain.position.z = z + Math.sin(a) * 2.6;
    rain.rotation.y = -a;
    group.add(rain);
  }
  group.add(light(hex, 40, x, 6, z, 45));
  // Consoles round the core, screens facing it.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const desk = new THREE.Group();
    desk.add(block(new THREE.BoxGeometry(1.6, 1, 0.9), stone(color), color, 0, 0, 0));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), glow(color, 0.55));
    screen.position.set(0, 1.9, 0);
    screen.rotation.x = -0.2;
    desk.add(tag(screen, { pulse: 2.4 }));
    desk.position.set(x + Math.cos(a) * 9, 0, z + Math.sin(a) * 9);
    desk.lookAt(x, 0, z);
    group.add(desk);
  }
  group.add(motes(room, hex, 200, 6), light(hex, 12, 0, 6, 12, 30));
  group.add(exit(room, color, "Computation District"));
  return group;
}

// ---------- The Observatory ----------

function sky(rand: () => number): THREE.Points {
  const count = 1600, positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, up = 0.1 + rand() * 0.9, r = 80;
    positions.set([Math.cos(a) * Math.sqrt(1 - up * up) * r, up * r, Math.sin(a) * Math.sqrt(1 - up * up) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return tag(new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, color: "#e8dcff", size: 1.4, sizeAttenuation: false, fog: false })), { spin: 0.006 });
}

function galaxy(rand: () => number, scale: number): THREE.Points {
  const count = 3000, stars = new Float32Array(count * 3), colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const arm = i % 3, t = rand() * 4, a = t * 1.9 + (arm / 3) * Math.PI * 2;
    const r = (t * 2.2 + rand() * 0.9) * scale;
    stars.set([Math.cos(a) * r, (rand() - 0.5) * 0.8 * scale, Math.sin(a) * r], i * 3);
    const c = new THREE.Color().setHSL(0.72 + rand() * 0.15, 0.8, 0.6 + rand() * 0.3);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 0.12 * scale, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
}

function planet(color: string, size: number, ringed: boolean): THREE.Group {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(size, 28, 18), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.6 })));
  if (ringed) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(size * 1.7, size * 0.08, 6, 64), glow(c, 0.8));
    band.rotation.x = 1.2;
    group.add(band);
  }
  return group;
}

function observatory(room: Interior): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(room.color), hex = `#${color.getHexString()}`, rand = seeded("observatory-inside");
  const R = room.round ?? 24;
  group.add(at(new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ color: "#0b0718", roughness: 0.9 })), 0, 0.01, 0));
  (group.children[0] as THREE.Mesh).rotation.x = -Math.PI / 2;
  const chart = new THREE.Mesh(new THREE.CircleGeometry(R - 0.5, 96), new THREE.MeshBasicMaterial({ map: plazaTexture(hex), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  chart.rotation.x = -Math.PI / 2;
  chart.position.y = 0.03;
  group.add(chart);
  // A low glass wall round the room, open at the door.
  const gap = DOOR_GAP / R;
  const start = Math.PI / 2 + gap / 2, length = Math.PI * 2 - gap;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 3, 96, 1, true, start, length), glass(color, 0.2));
  wall.position.y = 1.5;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 160, length), glow(color));
  rim.rotation.x = -Math.PI / 2;
  rim.rotation.z = Math.PI / 2 + gap / 2;
  rim.position.y = 3;
  group.add(wall, rim);
  // The sky: stars all round, and a galaxy turning overhead.
  group.add(sky(rand), tag(at(galaxy(rand, 3), 0, 26, 0), { spin: 0.04 }));
  // The orrery: a sun on a pedestal, planets swinging round it.
  group.add(block(new THREE.CylinderGeometry(3.5, 3.8, 1.2, 40), stone(color), color, 0, 0, 0));
  group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), glow(new THREE.Color("#ffd27a"))), 0, 4, 0), { pulse: 1 }));
  group.add(light("#ffd27a", 30, 0, 4.5, 0, 40));
  [["#5fa8ff", 0.35, 2.2, 0.9], ["#ff8a5f", 0.45, 3.2, 0.55], ["#7ff5c9", 0.3, 4.2, 0.4], ["#c58bff", 0.6, 5.4, 0.25]].forEach(([c, size, r, speed], i) => {
    const arm = tag(new THREE.Group(), { spin: speed as number });
    arm.position.y = 4;
    arm.rotation.y = i * 1.7;
    arm.add(at(planet(c as string, size as number, i === 3), r as number, 0, 0));
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(r as number, 0.025, 4, 96), glow(color, 0.4));
    orbit.rotation.x = Math.PI / 2;
    group.add(arm, at(orbit, 0, 4, 0));
  });
  // Pedestals round the room, each with a little world over it.
  const worlds = ["#2e7bff", "#e8a33a", "#3ddc84", "#ff5f8a", "#9aa7c7"];
  PEDESTALS.forEach((p, i) => {
    group.add(block(new THREE.CylinderGeometry(1, 1.1, 1.1, 24), stone(color), color, p.x, 0, p.z));
    group.add(tag(at(planet(worlds[i % worlds.length], 0.6, i % 2 === 0), p.x, 2.2, p.z), { spin: 0.5 + rand(), float: rand() * 6 }));
    group.add(tag(at(new THREE.Mesh(new THREE.RingGeometry(1.3, 1.45, 32), glow(color, 0.6)), p.x, 0.05, p.z), { pulse: 1 + rand() }));
    (group.children[group.children.length - 1] as THREE.Mesh).rotation.x = -Math.PI / 2;
  });
  // The telescope, pointed up at the galaxy.
  const scope = new THREE.Group();
  scope.add(block(new THREE.CylinderGeometry(1.2, 1.5, 0.8, 20), stone(color), color, 0, 0, 0));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 5, 20), stone(color));
  tube.position.set(0.8, 3.2, -0.6);
  tube.rotation.set(-0.5, 0, -0.35);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), glow(color));
  lens.position.set(0, 2.5, 0);
  lens.rotation.x = -Math.PI / 2;
  tube.add(lens);
  scope.add(tube);
  group.add(at(scope, TELESCOPE.x, 0, TELESCOPE.z));
  group.add(motes(room, hex, 220, 7));
  group.add(exit(room, color, "Simulation Chambers"));
  return group;
}

// ---------- The Model Forge ----------

function hexTexture(color: string): THREE.CanvasTexture {
  return canvas(256, 222, (g) => {
    g.fillStyle = "#03100b";
    g.fillRect(0, 0, 256, 222);
    g.strokeStyle = color;
    g.globalAlpha = 0.3;
    g.lineWidth = 2;
    const hex = (cx: number, cy: number) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) g.lineTo(cx + Math.cos((i * Math.PI) / 3) * 36, cy + Math.sin((i * Math.PI) / 3) * 36);
      g.closePath();
      g.stroke();
    };
    for (const [cx, cy] of [[0, 0], [108, 0], [216, 0], [54, 111], [162, 111], [0, 222], [108, 222], [216, 222], [270, 111]]) hex(cx, cy);
    g.globalAlpha = 1;
  }, true);
}

function forge(room: Interior): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(room.color), hex = `#${color.getHexString()}`, rand = seeded("forge-inside");
  const floorTex = hexTexture(hex);
  floorTex.repeat.set(room.halfW / 5, room.halfD / 5);
  group.add(floor(room.halfW * 2, room.halfD * 2, litBy(floorTex, color, 0.6)));
  group.add(walls(room, litBy(windows("#7ff5c9", 26, 2, false, "forge-walls"), color, 0.4), color));
  // The network: layers of nodes, every node joined to every one in the next layer.
  const net = tag(new THREE.Group(), { spin: 0.08 });
  const layers = [4, 6, 6, 3];
  const nodes: THREE.Vector3[][] = layers.map((count, li) =>
    Array.from({ length: count }, (_, i) => new THREE.Vector3((li - (layers.length - 1) / 2) * 3.4, 2.5 + ((i + 0.5) / count) * 8, 0)),
  );
  const links: number[] = [];
  for (let li = 0; li + 1 < nodes.length; li++) for (const a of nodes[li]) for (const b of nodes[li + 1]) links.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
  net.add(new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.35 })));
  for (const layer of nodes) for (const n of layer) net.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), glow(color)), n.x, n.y, n.z), { pulse: 0.6 + rand() * 2.2 }));
  group.add(at(net, NETWORK.x, 0, NETWORK.z));
  // Its plinth, a ring of light round the bottom.
  group.add(block(new THREE.CylinderGeometry(NETWORK.r, NETWORK.r + 0.3, 0.5, 48), stone(color), color, NETWORK.x, 0, NETWORK.z));
  group.add(tag(at(new THREE.Mesh(new THREE.TorusGeometry(NETWORK.r + 0.2, 0.08, 6, 96), glow(color)), NETWORK.x, 0.55, NETWORK.z), { pulse: 1 }));
  (group.children[group.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
  group.add(light(hex, 28, NETWORK.x, 8, NETWORK.z, 40));
  // Training pods: glass capsules with a young model glowing in each.
  PODS.forEach((p, i) => {
    const pod = new THREE.Group();
    pod.add(block(new THREE.CylinderGeometry(1.3, 1.4, 0.4, 24), shadow(), color, 0, 0, 0));
    pod.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.2, 8, 20), glass(color, 0.18)), 0, 2.3, 0));
    const hue = new THREE.Color().setHSL(0.35 + i * 0.07, 0.8, 0.6);
    pod.add(tag(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glow(hue)), 0, 2.3, 0), { spin: 0.8 + rand(), float: rand() * 6, pulse: 1 + rand() }));
    group.add(at(pod, p.x, 0, p.z));
  });
  // Planters of circuit plants along the walls.
  for (const side of [-1, 1]) {
    group.add(block(new THREE.BoxGeometry(3, 0.9, 26), stone(color), color, side * 24, 0, -2));
    for (let z = -13; z <= 9; z += 2.2) {
      const h = 1 + rand() * 2;
      group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 5), stone(color)), side * (24 + (rand() - 0.5)), 0.9 + h / 2, z));
      group.add(tag(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(color)), side * (24 + (rand() - 0.5)), 0.95 + h, z), { pulse: 0.5 + rand() * 2 }));
    }
  }
  group.add(motes(room, hex, 240, 8), light(hex, 10, 0, 6, 12, 30));
  group.add(exit(room, color, "Model District"));
  return group;
}

export const INSIDES: Record<InteriorId, (room: Interior) => THREE.Group> = { library, core, observatory, forge };

/** The air inside each: background and fog. */
export const AIR: Record<InteriorId, { background: string; fog: string; density: number }> = {
  library: { background: "#0a0603", fog: "#120a05", density: 0.012 },
  core: { background: "#02070c", fog: "#03101a", density: 0.012 },
  observatory: { background: "#05030d", fog: "#0a0618", density: 0.004 },
  forge: { background: "#020a06", fog: "#04120c", density: 0.012 },
};
