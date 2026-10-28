import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Look, Holding } from "./look";

/** All of Lemma's shapes and accessories are local geometry: no remote models. */
export function buildCompanion(look: Look, glow: THREE.Color, shell: THREE.Color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const casing = new THREE.MeshStandardMaterial({ color: shell.clone().lerp(glow, 0.22), metalness: 0.48, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: "#071b26", metalness: 0.35, roughness: 0.24 });
  const trim = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.4, metalness: 0.45, roughness: 0.25 });
  const light = new THREE.MeshBasicMaterial({ color: glow.clone().lerp(new THREE.Color("#ffffff"), 0.6) });
  const soft = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.3, depthWrite: false });
  const white = new THREE.MeshStandardMaterial({ color: "#edf8f5", roughness: 0.45 });
  const gold = new THREE.MeshStandardMaterial({ color: "#ffd078", emissive: "#ae6617", emissiveIntensity: 0.25, metalness: 0.55, roughness: 0.3 });

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  const box = (w: number, h: number, d: number, radius = 0.06) => new RoundedBoxGeometry(w, h, d, 3, radius);
  function ring(parent: THREE.Object3D, radius: number, thickness: number, material: THREE.Material, arc = Math.PI * 2) {
    return mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 80, arc), material);
  }
  function tube(parent: THREE.Object3D, points: number[][], thickness: number, material: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)));
    return mesh(parent, new THREE.TubeGeometry(curve, 24, thickness, 6, false), material);
  }

  let geometry: THREE.BufferGeometry;
  let faceZ = 0.8, faceY = 0, hatY = 0.72;
  switch (look.shape) {
    case "prism":
      geometry = box(1.35, 1.65, 0.95, 0.14);
      geometry.rotateZ(-0.1);
      faceZ = 0.5;
      hatY = 0.78;
      break;
    case "pyramid":
      geometry = new THREE.ConeGeometry(1.18, 1.85, 4);
      geometry.rotateY(Math.PI / 4);
      faceZ = 0.63;
      faceY = -0.32;
      hatY = 0.82;
      break;
    case "drop": {
      const points = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        return new THREE.Vector2(Math.sin(Math.PI * t) * (0.42 + t * 0.42), -1 + t * 1.95);
      });
      geometry = new THREE.LatheGeometry(points, 48);
      faceZ = 0.65;
      faceY = 0.15;
      hatY = 0.55;
      break;
    }
    default:
      geometry = new THREE.SphereGeometry(0.88, 48, 32);
  }
  mesh(body, geometry, casing);

  // A transparent skin gives each solid body a luminous rim and fine scan lines.
  const hologram = new THREE.ShaderMaterial({
    uniforms: { tint: { value: glow }, time: { value: 0 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vPosition;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz); vPosition = position;
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; uniform float time;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vPosition;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.3);
        float lines = pow(0.5 + 0.5 * sin(vPosition.y * 145.0 - time * 1.5), 12.0);
        gl_FragColor = vec4(tint, rim * 0.65 + lines * 0.075); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  mesh(body, geometry, hologram).scale.setScalar(1.008);
  if (look.shape === "prism" || look.shape === "pyramid") {
    body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: glow, transparent: true, opacity: 0.75 })));
  }
  if (look.shape === "orb") {
    // Broken orbital bands leave the face open and make the depth readable.
    for (let i = 0; i < 3; i++) {
      const arc = ring(body, 0.94, 0.036, trim, Math.PI * 0.51);
      arc.rotation.z = i * Math.PI * 2 / 3 + 0.25;
      arc.rotation.y = -0.17;
    }
    const seam = ring(body, 0.89, 0.012, soft);
    seam.rotation.y = Math.PI / 2;
    for (const side of [-1, 1]) mesh(body, box(0.15, 0.32, 0.32), dark, side * 0.89, -0.04, 0);
  }

  const face = new THREE.Group();
  face.position.set(0, faceY, faceZ);
  body.add(face);
  const lens = mesh(face, new THREE.SphereGeometry(1, 32, 20), dark, 0, 0, -0.015);
  lens.scale.set(0.57, 0.34, 0.12);
  const eyes = [-1, 1].map((side) => {
    const group = new THREE.Group();
    group.position.set(side * 0.22, 0.04, 0.115);
    face.add(group);
    const open = mesh(group, new THREE.CapsuleGeometry(0.065, 0.09, 5, 12), light);
    open.scale.z = 0.44;
    const happy = tube(group, [[-0.095, -0.025], [0, 0.065], [0.095, -0.025]], 0.025, light);
    happy.visible = false;
    return { group, open, happy };
  });
  const mouth = tube(face, [[-0.06, -0.16, 0.1], [0, -0.175, 0.105], [0.06, -0.16, 0.1]], 0.012, light);
  const glint = mesh(face, box(0.16, 0.018, 0.01, 0.005), soft, -0.29, 0.21, 0.075);
  glint.rotation.z = 0.22;

  const hat = new THREE.Group();
  hat.position.y = hatY;
  if (look.shape === "pyramid" && ["cap", "beanie", "crown"].includes(look.accessory)) {
    hat.position.y = 0.72;
    hat.scale.setScalar(0.65);
  }
  body.add(hat);
  switch (look.accessory) {
    case "cap": {
      const dome = mesh(hat, new THREE.SphereGeometry(0.64, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), trim);
      dome.scale.y = 0.57;
      const brim = mesh(hat, new THREE.CylinderGeometry(0.66, 0.66, 0.045, 48), dark, 0.1, 0.015, 0.28);
      brim.scale.set(1, 1, 0.75);
      mesh(hat, new THREE.SphereGeometry(0.055, 12, 8), light, 0, 0.38, 0);
      break;
    }
    case "beanie": {
      const dome = mesh(hat, new THREE.SphereGeometry(0.63, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, -0.05, 0);
      dome.scale.y = 0.8;
      const cuff = ring(hat, 0.59, 0.09, white);
      cuff.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const seam = ring(hat, 0.625, 0.008, soft, Math.PI);
        seam.rotation.y = i * Math.PI / 12;
        seam.scale.y = 0.8;
      }
      mesh(hat, new THREE.SphereGeometry(0.14, 16, 12), white, 0, 0.56, 0);
      break;
    }
    case "crown": {
      mesh(hat, new THREE.CylinderGeometry(0.5, 0.5, 0.2, 32, 1, true), gold, 0, 0.06, 0);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const point = mesh(hat, new THREE.ConeGeometry(0.16, 0.3, 4), gold, Math.sin(angle) * 0.46, 0.27, Math.cos(angle) * 0.46);
        point.rotation.y = angle;
        mesh(hat, new THREE.SphereGeometry(0.045, 10, 8), light, Math.sin(angle) * 0.46, 0.44, Math.cos(angle) * 0.46);
      }
      break;
    }
    case "halo": {
      const halo = ring(hat, 0.53, 0.035, gold);
      halo.position.y = 0.42;
      halo.rotation.x = Math.PI / 2 - 0.16;
      break;
    }
    case "headphones": {
      hat.position.y = 0;
      const band = ring(hat, 0.99, 0.055, dark, Math.PI);
      band.position.z = -0.05;
      for (const side of [-1, 1]) {
        mesh(hat, box(0.2, 0.44, 0.42, 0.09), dark, side * 0.96, 0, 0);
        mesh(hat, box(0.05, 0.28, 0.3), trim, side * 1.07, 0, 0.02);
      }
      break;
    }
    case "bow":
      hat.position.set(0, -0.77, 0.55);
      for (const side of [-1, 1]) {
        const wing = mesh(hat, new THREE.ConeGeometry(0.18, 0.26, 3), trim, side * 0.14, 0, 0);
        wing.rotation.z = side * Math.PI / 2;
      }
      mesh(hat, new THREE.SphereGeometry(0.085, 12, 8), gold);
  }

  const held = new THREE.Group();
  held.position.set(1.03, -0.52, 0.38);
  held.rotation.set(0.08, -0.25, 0.08);
  body.add(held);
  const prop = new THREE.Group();
  held.add(prop);

  function extrude(points: number[][], material: THREE.Material, depth = 0.09) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, steps: 1 });
    geo.translate(0, 0, -depth / 2);
    return mesh(prop, geo, material);
  }
  function holding(kind: Holding) {
    switch (kind) {
      case "coffee": {
        mesh(prop, new THREE.CylinderGeometry(0.19, 0.15, 0.36, 24), white);
        mesh(prop, new THREE.CylinderGeometry(0.16, 0.16, 0.015, 24), dark, 0, 0.183, 0);
        const handle = ring(prop, 0.11, 0.035, white);
        handle.position.set(0.21, 0, 0);
        tube(prop, [[-0.04, 0.25], [0.01, 0.36], [-0.02, 0.48]], 0.012, soft);
        break;
      }
      case "book":
        mesh(prop, box(0.39, 0.48, 0.16, 0.025), trim);
        mesh(prop, box(0.33, 0.41, 0.165, 0.008), white, 0.035, 0, 0);
        mesh(prop, box(0.39, 0.48, 0.025, 0.015), trim, 0, 0, 0.095);
        mesh(prop, box(0.19, 0.02, 0.015), light, 0, 0.1, 0.115);
        break;
      case "plant": {
        const green = new THREE.MeshStandardMaterial({ color: "#64dc95", roughness: 0.6 });
        mesh(prop, new THREE.CylinderGeometry(0.2, 0.14, 0.27, 20), white, 0, -0.1, 0);
        tube(prop, [[0, 0], [0, 0.2], [0.06, 0.4]], 0.02, green);
        for (const side of [-1, 1]) {
          const leaf = mesh(prop, new THREE.SphereGeometry(1, 16, 12), green, side * 0.1, 0.22 + side * 0.05, 0);
          leaf.scale.set(0.15, 0.07, 0.04);
          leaf.rotation.z = side * 0.5;
        }
        break;
      }
      case "star":
        extrude(Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.13 : 0.29; return [Math.cos(a) * r, Math.sin(a) * r]; }), gold);
        break;
      case "heart": {
        const points = Array.from({ length: 48 }, (_, i) => {
          const t = i * Math.PI * 2 / 48;
          return [16 * Math.sin(t) ** 3 / 65, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 65];
        });
        extrude(points, new THREE.MeshStandardMaterial({ color: "#ff7595", roughness: 0.35 }));
        break;
      }
      case "rocket":
        mesh(prop, new THREE.CapsuleGeometry(0.13, 0.3, 8, 16), white);
        mesh(prop, new THREE.ConeGeometry(0.13, 0.2, 20), trim, 0, 0.3, 0);
        mesh(prop, new THREE.SphereGeometry(0.065, 16, 12), dark, 0, 0.06, 0.12);
        mesh(prop, new THREE.ConeGeometry(0.08, 0.2, 12), gold, 0, -0.33, 0).rotation.z = Math.PI;
        for (const side of [-1, 1]) mesh(prop, new THREE.ConeGeometry(0.1, 0.25, 3), trim, side * 0.13, -0.14, 0);
        prop.rotation.z = -0.25;
        break;
      case "music":
        tube(prop, [[-0.08, -0.15], [-0.08, 0.25], [0.19, 0.3], [0.19, -0.1]], 0.028, gold);
        for (const side of [-1, 1]) {
          const note = mesh(prop, new THREE.SphereGeometry(0.085, 16, 12), gold, side === -1 ? -0.14 : 0.13, side === -1 ? -0.15 : -0.1, 0);
          note.scale.set(1.25, 0.8, 0.5);
        }
        break;
      case "game":
        mesh(prop, box(0.56, 0.31, 0.18, 0.1), white);
        mesh(prop, box(0.14, 0.045, 0.035), dark, -0.14, 0, 0.1);
        mesh(prop, box(0.045, 0.14, 0.035), dark, -0.14, 0, 0.1);
        for (const side of [-1, 1]) mesh(prop, new THREE.SphereGeometry(0.035, 10, 8), trim, 0.15 + side * 0.04, side * 0.04, 0.1);
    }
  }
  holding(look.holding);
  const palm = mesh(held, new THREE.SphereGeometry(0.12, 16, 12), trim, -0.06, -0.23, 0.05);
  palm.scale.set(1.3, 0.6, 1);
  const work = new THREE.Group();
  held.add(work);
  mesh(work, box(0.5, 0.58, 0.065), dark);
  mesh(work, box(0.43, 0.5, 0.02), trim, 0, 0, 0.045);
  for (let i = 0; i < 3; i++) mesh(work, box(0.25 - i * 0.04, 0.022, 0.015), light, -0.025, 0.1 - i * 0.09, 0.06);
  work.visible = false;
  held.visible = look.holding !== "none";

  const base = new THREE.Group();
  base.position.y = -1.22;
  root.add(base);
  const baseRing = ring(base, 0.65, 0.015, soft);
  baseRing.rotation.x = Math.PI / 2;
  const outer = ring(base, 0.79, 0.009, soft, Math.PI * 1.45);
  outer.rotation.x = Math.PI / 2;
  const pulse = ring(base, 0.84, 0.022, trim, Math.PI * 1.75);
  pulse.rotation.x = Math.PI / 2;
  pulse.visible = false;
  const motes = new THREE.Group();
  root.add(motes);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    mesh(motes, new THREE.OctahedronGeometry(i % 3 === 0 ? 0.025 : 0.012), soft, Math.sin(a) * 1.2, (i % 4) * 0.48 - 0.65, Math.cos(a) * 0.8 - 0.3);
  }
  return { root, body, eyes, face, mouth, hat, held, prop, work, base, pulse, motes, hologram };
}

export type CompanionModel = ReturnType<typeof buildCompanion>;

/** Meshes share materials and some geometry, so release each resource once. */
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
