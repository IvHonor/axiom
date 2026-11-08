import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { lookForRole, type Look, type Holding } from "./look";

/** All of Lemma's shapes and accessories are local geometry: no remote models. */
export function buildCompanion(chosen: Look, glow: THREE.Color, shell: THREE.Color, admin = false, firstLight = false) {
  const look = lookForRole(chosen, admin, firstLight);
  const colourUpdates: ((next: Look, glow: THREE.Color) => void)[] = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const finish = look.finish;
  const casing = new THREE.MeshPhysicalMaterial({
    color: shell.clone().lerp(glow, finish === "hologram" ? 0.22 : 0.06),
    metalness: finish === "metal" ? 0.92 : finish === "glass" || finish === "matte" ? 0 : 0.48,
    roughness: finish === "matte" ? 0.96 : finish === "glass" ? 0.5 : finish === "metal" ? 0.16 : 0.3,
    transparent: finish === "glass", opacity: finish === "glass" ? 0.67 : 1,
    clearcoat: finish === "glass" ? 0.7 : 0, side: THREE.FrontSide,
  });
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
    case "prism": {
      // Smooth corners (enough segments that light glides round them, rather
      // than catching on facets), so it reads as one clean, solid prism.
      geometry = new RoundedBoxGeometry(1.5, 1.65, 1.05, 10, 0.14);
      if (["cap", "beanie", "crown"].includes(look.accessory)) {
        // Round the shoulders into the hat opening, leaving the lower body square.
        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        const radius = look.accessory === "crown" ? 0.40 : look.accessory === "beanie" ? 0.32 : 0.28;
        for (let i = 0; i < positions.count; i++) {
          if (positions.getY(i) <= 0) continue;
          positions.setXYZ(i,
            (0.75 - radius) * Math.sign(positions.getX(i)) + normals.getX(i) * radius,
            0.825 - radius + normals.getY(i) * radius,
            (0.525 - radius) * Math.sign(positions.getZ(i)) + normals.getZ(i) * radius);
        }
        geometry.computeVertexNormals();
      }
      faceZ = 0.55;
      hatY = 0.86;
      break;
    }
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
    uniforms: { tint: { value: glow }, time: { value: 0 }, scan: { value: finish === "hologram" ? 1 : 0 }, dissolve: { value: 1 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vPosition;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz); vPosition = position;
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; uniform float time; uniform float scan; uniform float dissolve;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vPosition;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.3);
        float lines = pow(0.5 + 0.5 * sin(vPosition.y * 145.0 - time * 1.5), 12.0);
        gl_FragColor = vec4(tint, (rim * (0.12 + scan * 0.53) + lines * 0.075 * scan) * dissolve); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  mesh(body, geometry, hologram).scale.setScalar(1.008);
  // A pyramid's true edges glow. (A prism's corners are rounded: outlining
  // them traced every facet of the curve, and made it look textured.)
  if (look.shape === "pyramid") {
    body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: glow, transparent: true, opacity: 0.75 })));
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
    const brow = tube(face, [[-0.09, 0, 0], [0, 0.015, 0], [0.09, 0, 0]], 0.016, light);
    brow.position.set(side * 0.22, 0.2, 0.09);
    return { group, open, happy, brow };
  });
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.15, 0.11);
  face.add(mouth);
  const mouths = {
    smile: tube(mouth, [[-0.11, 0.015], [0, -0.025], [0.11, 0.015]], 0.016, light),
    flat: tube(mouth, [[-0.07, 0], [0, 0], [0.07, 0]], 0.014, light),
    round: ring(mouth, 0.045, 0.012, light),
    frown: tube(mouth, [[-0.09, -0.02], [0, 0.02], [0.09, -0.02]], 0.016, light),
  };
  for (const [name, part] of Object.entries(mouths)) part.visible = name === "smile";
  // Independent opacity lets facial features crossfade without rebuilding geometry.
  for (const part of [...Object.values(mouths), ...eyes.flatMap(eye => [eye.open, eye.happy])]) {
    part.material = light.clone();
    part.material.transparent = true;
    part.material.depthWrite = false;
    part.material.opacity = part.visible ? 1 : 0;
  }

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
      mesh(hat, new THREE.SphereGeometry(0.055, 12, 8), white, 0, 0.38, 0);
      break;
    }
    case "beanie": {
      const dome = mesh(hat, new THREE.SphereGeometry(0.63, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, -0.05, 0);
      dome.scale.y = 0.8;
      const cuff = ring(hat, 0.59, 0.09, white);
      cuff.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const seam = ring(hat, 0.625, 0.008, dark, Math.PI);
        seam.rotation.y = i * Math.PI / 12;
        seam.scale.y = 0.8;
      }
      mesh(hat, new THREE.SphereGeometry(0.14, 16, 12), white, 0, 0.56, 0);
      break;
    }
    case "crown": {
      // A continuous six-point coronet, with broad joined points and a rolled rim.
      const radius = 0.52, segments = 96;
      const vertices: number[] = [], indices: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        const peak = 1 - Math.abs((i / segments * 6 % 1) * 2 - 1);
        for (const [r, y] of [[radius, -0.04], [radius + 0.055, 0.16 + peak * 0.28], [radius - 0.045, -0.04], [radius + 0.01, 0.16 + peak * 0.28]]) {
          vertices.push(Math.sin(angle - Math.PI / 6) * r, y, Math.cos(angle - Math.PI / 6) * r);
        }
        if (i < segments) {
          const a = i * 4, b = a + 4;
          for (const [u, v] of [[0, 1], [3, 2], [1, 3], [2, 0]]) indices.push(a + u, b + u, a + v, b + u, b + v, a + v);
        }
      }
      const coronet = new THREE.BufferGeometry();
      coronet.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      coronet.setIndex(indices); coronet.computeVertexNormals();
      mesh(hat, coronet, gold);
      const rim = ring(hat, radius, 0.035, gold);
      rim.rotation.x = Math.PI / 2;
      const jewelMaterial = new THREE.MeshStandardMaterial({ color: look.jewelColor === "theme" ? glow : /^#[\da-f]{6}$/i.test(look.jewelColor) ? look.jewelColor : "#c52e58", metalness: 0.25, roughness: 0.2 });
      colourUpdates.push((next, glow) => {
        if (next.jewelColor === "theme") jewelMaterial.color.copy(glow);
        else jewelMaterial.color.set(/^#[\da-f]{6}$/i.test(next.jewelColor) ? next.jewelColor : "#c52e58");
      });
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const jewel = mesh(hat, new THREE.OctahedronGeometry(0.065), jewelMaterial, Math.sin(angle) * 0.55, 0.10, Math.cos(angle) * 0.55);
        jewel.rotation.y = angle;
        jewel.scale.set(0.8, 1, 0.45);
        jewel.userData.keepColor = true;
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
      if (look.shape === "prism") {
        tube(hat, [[-0.84, 0.12, -0.05], [-0.84, 0.70, -0.05], [-0.80, 0.91, -0.05], [-0.58, 0.99, -0.05], [0.58, 0.99, -0.05], [0.80, 0.91, -0.05], [0.84, 0.70, -0.05], [0.84, 0.12, -0.05]], 0.045, dark);
      } else {
        const band = ring(hat, 0.99, 0.055, dark, Math.PI);
        band.position.z = -0.05;
      }
      for (const side of [-1, 1]) {
        const x = look.shape === "prism" ? 0.84 : 0.96;
        mesh(hat, box(0.2, 0.44, 0.42, 0.09), dark, side * x, 0, 0);
        mesh(hat, box(0.05, 0.28, 0.3), trim, side * (x + 0.11), 0, 0.02);
      }
      break;
    }
  }

  if (look.shape === "prism") {
    if (look.accessory === "cap" || look.accessory === "beanie") { hat.scale.x = 1.15; hat.position.y = 0.82; }
  }

  const neckwear = new THREE.Group();
  // The pyramid widens towards its base, so its bow must sit further forward.
  const bowMount = look.shape === "pyramid" ? [0, -0.72, 0.83] : look.shape === "prism" ? [0, -0.64, 0.59] : look.shape === "drop" ? [0, -0.48, 0.52] : [0, -0.64, 0.68];
  neckwear.position.set(bowMount[0], bowMount[1], bowMount[2]);
  body.add(neckwear);
  if (look.neckwear === "bow") {
    for (const side of [-1, 1]) {
      const wing = new THREE.Shape();
      wing.moveTo(side * 0.025, 0); wing.lineTo(side * 0.25, 0.13); wing.lineTo(side * 0.25, -0.13); wing.closePath();
      mesh(neckwear, new THREE.ExtrudeGeometry(wing, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.015, bevelSegments: 2, steps: 1 }), trim);
    }
    mesh(neckwear, box(0.1, 0.13, 0.11, 0.035), trim, 0, 0, 0.04);
  }
  const facewear = new THREE.Group();
  facewear.position.z = 0.17;
  face.add(facewear);
  if (look.facewear === "sunglasses") {
    const outline = (inset: number) => {
      const shape = new THREE.Shape(), a = 0.185 - inset, b = 0.14 - inset;
      const top = 0.145 - inset, bottom = -0.12 + inset, r = 0.035;
      shape.moveTo(-a + r, top); shape.lineTo(a - r, top);
      shape.quadraticCurveTo(a, top, a - 0.006, top - r);
      shape.lineTo(b + 0.006, bottom + r); shape.quadraticCurveTo(b, bottom, b - r, bottom);
      shape.lineTo(-b + r, bottom); shape.quadraticCurveTo(-b, bottom, -b - 0.006, bottom + r);
      shape.lineTo(-a + 0.006, top - r); shape.quadraticCurveTo(-a, top, -a + r, top);
      return shape;
    };
    const frame = outline(0); frame.holes.push(outline(0.032));
    const frameGeometry = new THREE.ExtrudeGeometry(frame, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, steps: 1 });
    const lensMaterial = new THREE.MeshStandardMaterial({ color: "#10241f", roughness: 0.16, metalness: 0.2, transparent: true, opacity: 0.94 });
    for (const side of [-1, 1]) {
      mesh(facewear, frameGeometry, trim, side * 0.23, 0.035, 0);
      const lens = mesh(facewear, new THREE.ShapeGeometry(outline(0.027)), lensMaterial, side * 0.23, 0.035, 0.01);
      lens.userData.keepColor = true;
      const pin = mesh(facewear, box(0.036, 0.013, 0.012, 0.004), white, side * 0.375, 0.135, 0.045);
      pin.userData.keepColor = true;
      tube(facewear, [[side * 0.40, 0.10, 0.01], [side * 0.51, 0.10, -0.07], [side * 0.54, 0.04, -0.20]], 0.028, trim);
    }
    mesh(facewear, box(0.12, 0.045, 0.04, 0.014), trim, 0, 0.12, 0.015);
  } else if (look.facewear === "glasses") {
    for (const side of [-1, 1]) {
      const frame = ring(facewear, 0.15, 0.022, trim);
      frame.position.set(side * 0.22, 0.035, 0);
      frame.scale.y = 0.88;
      tube(facewear, [[side * 0.37, 0.06, 0], [side * 0.49, 0.08, -0.08], [side * 0.53, 0.06, -0.18]], 0.018, trim);
    }
    tube(facewear, [[-0.07, 0.05], [0, 0.07], [0.07, 0.05]], 0.018, trim);
  }

  const held = new THREE.Group();
  held.position.set(look.shape === "prism" ? 0.98 : 1.03, -0.52, 0.38);
  held.rotation.set(0.08, -0.25, 0.08);
  body.add(held);
  const prop = new THREE.Group();
  held.add(prop);
  const sprout = new THREE.Group();
  const bookCover = new THREE.Group();
  const page = new THREE.Group();
  const steam = new THREE.Group();

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
        prop.add(steam);
        tube(steam, [[-0.04, 0.25], [0.01, 0.36], [-0.02, 0.48]], 0.012, new THREE.MeshBasicMaterial({ color: "#edf8f5", transparent: true, opacity: 0.3, depthWrite: false }));
        break;
      }
      case "book":
        mesh(prop, box(0.39, 0.48, 0.025, 0.012), trim, 0, 0, -0.09);
        mesh(prop, box(0.33, 0.41, 0.14, 0.008), white, 0.025, 0, -0.005);
        mesh(prop, box(0.035, 0.48, 0.18, 0.012), trim, -0.18, 0, 0);
        // Both the cover and the turning leaf hinge along the spine.
        prop.add(bookCover); bookCover.position.set(-0.195, 0, 0.09);
        mesh(bookCover, box(0.39, 0.48, 0.025, 0.012), trim, 0.195);
        mesh(bookCover, box(0.19, 0.02, 0.008, 0.003), white, 0.195, 0.1, 0.017);
        mesh(bookCover, box(0.33, 0.41, 0.012, 0.004), white, 0.215, 0, -0.024);
        for (let i = 0; i < 3; i++) {
          mesh(prop, box(0.22 - i * 0.025, 0.012, 0.004, 0.002), dark, 0.025, 0.1 - i * 0.075, 0.068);
          mesh(bookCover, box(0.22 - i * 0.025, 0.012, 0.004, 0.002), dark, 0.215, 0.1 - i * 0.075, -0.033);
        }
        prop.add(page); page.position.set(-0.17, 0, 0.078);
        mesh(page, box(0.325, 0.4, 0.008, 0.002), white, 0.1625, 0, 0);
        page.visible = false;
        break;
      case "plant": {
        const green = new THREE.MeshStandardMaterial({ color: "#64dc95", roughness: 0.6 });
        mesh(prop, new THREE.CylinderGeometry(0.2, 0.14, 0.27, 20), white, 0, -0.1, 0);
        mesh(prop, new THREE.CylinderGeometry(0.175, 0.175, 0.015, 20), new THREE.MeshStandardMaterial({ color: "#493329", roughness: 1 }), 0, 0.038, 0);
        prop.add(sprout);
        tube(sprout, [[0, 0], [0, 0.2], [0.06, 0.4]], 0.02, green);
        for (const side of [-1, 1]) {
          const leaf = mesh(sprout, new THREE.SphereGeometry(1, 16, 12), green, side * 0.1, 0.22 + side * 0.05, 0);
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
  const drop = mesh(body, new THREE.SphereGeometry(0.045, 12, 8), light);
  drop.visible = false;
  const sneeze = new THREE.Group();
  body.add(sneeze);
  for (let i = 0; i < 12; i++) mesh(sneeze, new THREE.OctahedronGeometry(0.018), soft);
  sneeze.visible = false;

  let code: ReturnType<typeof codeEffect> | null = null;
  if (look.holding === "glitch") {
    code = codeEffect();
    prop.add(code.core); root.add(code.rain, code.ghostEyes);
  }
  const lantern = look.holding === "first-light" ? firstLightEffect() : null;
  if (lantern) { prop.add(lantern.frame); body.add(lantern.star, lantern.sparks); }
  function itemTrim(group: THREE.Object3D, fallback: string, field?: "headwearColor" | "facewearColor" | "neckwearColor", sources = [trim]) {
    const replacements = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const bindings: { material: THREE.MeshStandardMaterial; base: THREE.Color; emissive: THREE.Color; intensity: number; autoIntensity: number }[] = [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !sources.includes(object.material) || object.userData.keepColor) return;
      let material = replacements.get(object.material);
      if (!material) {
        material = (object.material as THREE.MeshStandardMaterial).clone();
        bindings.push({ material, base: object.material === trim ? new THREE.Color(fallback) : material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity, autoIntensity: object.material === trim ? 0 : material.emissiveIntensity });
        replacements.set(object.material, material);
      }
      object.material = material;
    });
    const update = (next: Look, glow: THREE.Color) => {
      const custom = field ? next[field] : "auto";
      const automatic = custom !== "theme" && !/^#[\da-f]{6}$/i.test(custom);
      for (const { material, base, emissive, intensity, autoIntensity } of bindings) {
        if (automatic) {
          material.color.copy(base); material.emissive.copy(emissive);
          material.emissiveIntensity = autoIntensity;
        } else {
          if (custom === "theme") material.color.copy(glow); else material.color.set(custom);
          material.emissive.copy(material.color); material.emissiveIntensity = intensity;
        }
      }
    };
    update(look, glow);
    if (field) colourUpdates.push(update);
  }
  itemTrim(hat, "#466b85", "headwearColor", [trim, ...(["crown", "halo"].includes(look.accessory) ? [gold] : []), ...(look.accessory === "headphones" ? [dark] : [])]);
  itemTrim(neckwear, "#b83f55", "neckwearColor");
  itemTrim(facewear, look.facewear === "sunglasses" ? "#161b20" : "#d7e1e5", "facewearColor");
  itemTrim(prop, "#3c78a6");
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
  const bodyMaterials = new Map<THREE.Material, number>();
  if (code) body.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
      bodyMaterials.set(object.material, object.material.opacity);
      object.material.transparent = true;
    }
  });
  return { root, body, eyes, face, facewear, neckwear, mouth, mouths, hat, hatOrigin: hat.position.clone(), held, heldOrigin: held.position.clone(), prop, work, base, pulse, motes, hologram, sprout, bookCover, page, steam, drop, sneeze, code, lantern, bodyMaterials,
    updateColours(next: Look, glow: THREE.Color) { colourUpdates.forEach(update => update(next, glow)); },
  };
}

/** A brass lantern and a separate star, so its flight stays beside the companion's body. */
function firstLightEffect() {
  const frame = new THREE.Group(), star = new THREE.Group(), sparks = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: "#bd8846", metalness: 0.75, roughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#ffe6b3", transparent: true, opacity: 0.16, roughness: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, material); part.position.set(x, y, z); parent.add(part); return part;
  };
  add(frame, new THREE.CylinderGeometry(0.22, 0.20, 0.07, 6), brass, 0, -0.25);
  add(frame, new THREE.CylinderGeometry(0.20, 0.24, 0.08, 6), brass, 0, 0.23);
  add(frame, new THREE.ConeGeometry(0.24, 0.12, 6), brass, 0, 0.32);
  add(frame, new THREE.CylinderGeometry(0.185, 0.185, 0.43, 6, 1, true), glass, 0, -0.015);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    add(frame, new THREE.CylinderGeometry(0.012, 0.012, 0.43, 8), brass, Math.sin(angle) * 0.19, -0.015, Math.cos(angle) * 0.19);
  }
  add(frame, new THREE.TorusGeometry(0.085, 0.015, 8, 24), brass, 0, 0.43);
  const outline = new THREE.Shape(Array.from({ length: 10 }, (_, i) => {
    const angle = i * Math.PI / 5 + Math.PI / 2, radius = i % 2 ? 0.065 : 0.145;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }));
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, steps: 1 });
  geometry.translate(0, 0, -0.02);
  const starMaterial = new THREE.MeshStandardMaterial({ color: "#ffe7a3", emissive: "#ffb52e", emissiveIntensity: 1.25, metalness: 0.25, roughness: 0.28 });
  add(star, geometry, starMaterial);
  const haloMaterial = new THREE.MeshBasicMaterial({ color: "#ffbc48", transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false });
  add(star, new THREE.SphereGeometry(0.19, 16, 12), haloMaterial);
  const light = new THREE.PointLight("#ffbd54", 0.45, 2.4);
  star.add(light);
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: "#ffcf70", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkGeometry = new THREE.OctahedronGeometry(0.018);
  for (let i = 0; i < 14; i++) add(sparks, sparkGeometry, sparkMaterial);
  sparks.visible = false;
  return { frame, star, sparks, starMaterial, haloMaterial, sparkMaterial, light };
}

/** Animated glyphs share one locally drawn atlas; no fonts or assets are downloaded. */
function codeEffect() {
  const atlas = document.createElement("canvas"); atlas.width = 128; atlas.height = 512;
  const ctx = atlas.getContext("2d")!;
  ctx.font = "bold 15px monospace"; ctx.textAlign = "center";
  const chars = "01{}<>/ABCDEF:+=";
  for (let row = 0; row < 32; row++) for (let col = 0; col < 8; col++) {
    ctx.fillStyle = `rgba(140,255,185,${0.35 + ((row * 7 + col * 13) % 10) / 16})`;
    ctx.fillText(chars[(row * 11 + col * 7) % chars.length], col * 16 + 8, row * 16 + 14);
  }
  const texture = new THREE.CanvasTexture(atlas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const material = () => new THREE.ShaderMaterial({
    uniforms: { atlas: { value: texture }, time: { value: 0 }, alpha: { value: 1 } },
    vertexShader: "varying vec2 uv_; void main(){uv_=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `uniform sampler2D atlas; uniform float time; uniform float alpha; varying vec2 uv_;
      void main(){vec2 p=vec2(uv_.x,fract(uv_.y+time*0.17)); vec4 c=texture2D(atlas,p);
      float head=pow(fract(uv_.y+time*0.17),6.0); gl_FragColor=vec4(mix(vec3(0.12,1.0,0.48),vec3(0.85,1.0,0.9),head),c.a*alpha);}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const core = new THREE.Group(), rain = new THREE.Group(), ghostEyes = new THREE.Group();
  const coreMaterial = material(), rainMaterial = material();
  const columnGeometry = (width: number, height: number, column: number, rows: number) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute("uv");
    for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) + column % 8) / 8, uv.getY(v) * rows / 32);
    return geometry;
  };
  for (let i = 0; i < 5; i++) {
    const column = new THREE.Mesh(columnGeometry(0.095, 0.5, i, 9), coreMaterial);
    column.position.set((i - 2) * 0.09, ((i * 7) % 3) * 0.025, Math.sin(i) * 0.04);
    core.add(column);
  }
  for (let i = 0; i < 18; i++) {
    const column = new THREE.Mesh(columnGeometry(0.105, 1.5 + (i % 3) * 0.16, i, 22), rainMaterial);
    column.position.set((i - 8.5) * 0.11, (i % 3 - 1) * 0.1, Math.sin(i * 2.4) * 0.3 + 0.35);
    rain.add(column);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.08, 4, 10), new THREE.MeshBasicMaterial({ color: "#c5ffdc", transparent: true }));
    eye.position.set(side * 0.22, 0.04, 0.98); ghostEyes.add(eye);
  }
  rain.visible = ghostEyes.visible = false;
  return { core, rain, ghostEyes, coreMaterial, rainMaterial };
}

export type CompanionModel = ReturnType<typeof buildCompanion>;

/** Meshes share materials and some geometry, so release each resource once. */
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
    if (material instanceof THREE.MeshBasicMaterial && material.map) textures.add(material.map);
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
}
