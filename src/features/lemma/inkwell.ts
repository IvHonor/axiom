// The Inkwell set: the Journal's reward items, all local geometry. The Last Word
// is its centrepiece: Lemma floods with ink, sinks into a pool, and a quill writes
// it back in gold.
import * as THREE from "three";
import type { Shell } from "./look";

const GOLD = "#e8bf68";

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}
const goldMetal = () => new THREE.MeshStandardMaterial({ color: GOLD, emissive: "#7a5418", emissiveIntensity: 0.4, metalness: 0.45, roughness: 0.34 });
const lathe = (points: number[][], segments = 48) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);

/** A feather growing up from its base at the origin: a soft vane around a thin shaft. */
function feather(length: number, width: number) {
  const group = new THREE.Group();
  const vane = new THREE.Shape();
  vane.moveTo(0, length * 0.12);
  vane.bezierCurveTo(width * 1.15, length * 0.3, width, length * 0.78, 0, length);
  vane.bezierCurveTo(-width * 0.7, length * 0.72, -width * 0.8, length * 0.32, 0, length * 0.12);
  const paper = new THREE.MeshStandardMaterial({ color: "#f1e8d6", emissive: "#54483a", emissiveIntensity: 0.25, roughness: 0.75, side: THREE.DoubleSide });
  add(group, new THREE.ExtrudeGeometry(vane, { depth: 0.004, bevelEnabled: false, curveSegments: 14 }), paper);
  add(group, new THREE.CylinderGeometry(0.004, 0.009, length, 8), new THREE.MeshStandardMaterial({ color: "#b89a6c", roughness: 0.5 }), 0, length / 2, 0.004);
  return group;
}

/** A silk ribbon marker with a gold nib at its end; `silk` takes the neckwear colour. */
export function ribbonBookmark(neck: THREE.Object3D, silk: THREE.Material) {
  const tail = (length: number, lean: number, z: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.04, 0);
    shape.bezierCurveTo(-0.07, -length * 0.35, 0.0, -length * 0.65, -0.035, -length);
    shape.lineTo(0.005, -length + 0.035);
    shape.lineTo(0.045, -length);
    shape.bezierCurveTo(0.08, -length * 0.65, 0.01, -length * 0.35, 0.04, 0);
    shape.closePath();
    const part = add(neck, new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false, curveSegments: 12 }), silk, 0, 0.02, z);
    part.rotation.z = lean;
    return part;
  };
  tail(0.36, 0.1, 0.03);
  tail(0.25, -0.26, 0.02);
  add(neck, new THREE.TorusGeometry(0.055, 0.022, 8, 24), silk, 0, 0.03, 0.05).scale.y = 0.72;
  const gold = goldMetal();
  // At the end of the longer tail, which leans a little to one side.
  const nib = add(neck, new THREE.ConeGeometry(0.03, 0.09, 4), gold, 0.038, -0.372, 0.036);
  nib.rotation.z = Math.PI + 0.1;
  nib.scale.z = 0.3;
  add(neck, new THREE.SphereGeometry(0.018, 10, 8), gold, 0, 0.03, 0.078);
}

/** A soft velvet cap with a feather in its band; `velvet` takes the headwear colour. */
export function scribesCap(hat: THREE.Object3D, velvet: THREE.Material) {
  const crown = add(hat, lathe([[0, 0.02], [0.58, 0.02], [0.63, 0.07], [0.7, 0.17], [0.66, 0.28], [0.43, 0.36], [0.15, 0.39], [0, 0.395]]), velvet, 0.05, 0.02, 0);
  crown.rotation.z = -0.1;
  const band = add(hat, new THREE.TorusGeometry(0.585, 0.024, 8, 64), goldMetal(), 0, 0.05, 0);
  band.rotation.x = Math.PI / 2;
  const plume = feather(0.6, 0.075);
  plume.position.set(-0.42, 0.08, 0.4);
  plume.rotation.set(-0.12, 0.45, 0.52);
  hat.add(plume);
}

/** How high the ink stands in each body: about two-thirds full. */
const INK_LEVEL: Record<Shell, number> = { orb: 0.26, prism: 0.24, pyramid: -0.08, drop: 0.24 };

/**
 * Living Ink: black ink held inside a clear shell. The inner surface is drawn up
 * to a rippling level that stays upright however the body turns; looking down
 * past the waterline, the far wall reads as the top of the liquid. Turning the
 * body sets a spring going, which is what makes the ink slosh.
 */
export function inkGlobe(body: THREE.Object3D, shell: THREE.BufferGeometry, shape: Shell) {
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, level: { value: INK_LEVEL[shape] }, tiltX: { value: 0 }, tiltZ: { value: 0 }, rise: { value: 0 } },
    vertexShader: `varying vec3 vRel; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Relative to the body's middle and its size, but not its rotation.
        vRel = (world.xyz - modelMatrix[3].xyz) / max(length(modelMatrix[0].xyz), 0.0001);
        vec4 view = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal); vView = normalize(-view.xyz);
        gl_Position = projectionMatrix * view; }`,
    fragmentShader: `uniform float time; uniform float level; uniform float tiltX; uniform float tiltZ; uniform float rise;
      varying vec3 vRel; varying vec3 vNormal; varying vec3 vView;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float fleck(vec3 p, float size) {
        vec3 cell = floor(p); float seed = hash(cell);
        if (seed < 0.7) return 0.0;
        vec3 spot = vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) * 0.6 + 0.2;
        return smoothstep(size, 0.0, length(fract(p) - spot)) * (0.55 + 0.45 * sin(time * (0.8 + seed * 2.0) + seed * 40.0));
      }
      void main() {
        float ripple = sin(vRel.x * 7.0 + time * 1.5) * 0.017 + sin(vRel.z * 11.0 - time * 2.2) * 0.01 + sin((vRel.x + vRel.z) * 17.0 + time * 2.9) * 0.004;
        float surface = mix(level + ripple + tiltX * vRel.x + tiltZ * vRel.z, 1.5, rise);
        float depth = surface - vRel.y;
        if (depth < 0.0) discard;
        vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float shine = pow(max(dot(normal, normalize(vec3(-0.35, 0.65, 0.68))), 0.0), 40.0);
        float rim = pow(1.0 - abs(dot(normal, normalize(vView))), 3.0);
        // A deep blue-black, with a lit edge, so it still reads against a dark theme.
        vec3 colour = vec3(0.022, 0.027, 0.058) + vec3(0.15, 0.19, 0.36) * rim + vec3(0.5, 0.54, 0.66) * shine;
        if (gl_FrontFacing) {
          vec3 drift = vRel * 6.0 + vec3(sin(time * 0.11) * 0.5, -time * 0.05, time * 0.03);
          colour += vec3(1.0, 0.76, 0.34) * (fleck(drift, 0.2) * 1.5 + fleck(drift * 1.9 + 5.0, 0.26));
        } else {
          // The top of the liquid, with a little light moving over it.
          colour += vec3(0.075, 0.09, 0.16) + vec3(0.16, 0.18, 0.26) * pow(0.5 + 0.5 * sin(vRel.x * 12.0 + vRel.z * 9.0 + time), 5.0);
        }
        // A bright line where the ink meets the glass.
        colour += vec3(0.42, 0.47, 0.62) * smoothstep(0.026, 0.0, depth) * (1.0 - rise);
        gl_FragColor = vec4(colour, 1.0); }`,
  });
  const mesh = add(body, shell, material);
  mesh.scale.setScalar(0.965);
  let tiltX = 0, tiltZ = 0, speedX = 0, speedZ = 0, lastYaw: number | null = null, lastPitch = 0;
  return {
    mesh, material,
    /** `dt` is 0 when nothing should move (reduced motion, or still). */
    tick(dt: number, time: number, yaw: number, pitch: number) {
      material.uniforms.time.value = time;
      if (lastYaw !== null && dt > 0) {
        const clamp = (n: number) => Math.max(-6, Math.min(6, n));
        speedX += (-tiltX * 46 - speedX * 3.2 + clamp((yaw - lastYaw) / dt) * 3.6) * dt;
        speedZ += (-tiltZ * 46 - speedZ * 3.2 + clamp((pitch - lastPitch) / dt) * 3.6) * dt;
        tiltX = Math.max(-0.34, Math.min(0.34, tiltX + speedX * dt));
        tiltZ = Math.max(-0.34, Math.min(0.34, tiltZ + speedZ * dt));
      }
      lastYaw = yaw; lastPitch = pitch;
      material.uniforms.tiltX.value = tiltX;
      material.uniforms.tiltZ.value = tiltZ;
    },
  };
}

/** The path the quill writes: the outline of each body, seen from the front. */
function outlineOf(shape: Shell) {
  const points: THREE.Vector3[] = [];
  const along = (corners: number[][], each: number) => corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % corners.length];
    for (let n = 0; n < each; n++) points.push(new THREE.Vector3(x + (nx - x) * n / each, y + (ny - y) * n / each, 0));
  });
  if (shape === "prism") along([[0, 0.86], [0.78, 0.86], [0.78, -0.86], [-0.78, -0.86], [-0.78, 0.86]], 14);
  else if (shape === "pyramid") along([[0, 0.95], [0.87, -0.95], [-0.87, -0.95]], 20);
  else if (shape === "drop") {
    const side = (t: number) => Math.sin(Math.PI * t) * (0.42 + t * 0.42);
    for (let i = 0; i <= 32; i++) { const t = 1 - i / 32; points.push(new THREE.Vector3(side(t) + 0.02, -1 + t * 1.95, 0)); }
    for (let i = 1; i < 32; i++) { const t = i / 32; points.push(new THREE.Vector3(-side(t) - 0.02, -1 + t * 1.95, 0)); }
  } else for (let i = 0; i < 64; i++) { const a = Math.PI / 2 - i / 64 * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * 0.91, Math.sin(a) * 0.91, 0)); }
  return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.2);
}

/** The Last Word: an inkwell with its quill, and everything its animation calls on. */
export function lastWord(prop: THREE.Object3D, body: THREE.Object3D, shell: THREE.BufferGeometry, shape: Shell) {
  const glass = new THREE.MeshPhysicalMaterial({ color: "#10131d", metalness: 0.1, roughness: 0.12, clearcoat: 1 });
  const gold = goldMetal();
  const inkBlack = new THREE.MeshPhysicalMaterial({ color: "#05060b", roughness: 0.08, clearcoat: 1 });
  add(prop, lathe([[0, -0.16], [0.2, -0.16], [0.235, -0.1], [0.215, 0.03], [0.11, 0.09], [0.095, 0.15], [0.07, 0.15], [0, 0.15]]), glass);
  add(prop, new THREE.TorusGeometry(0.1, 0.018, 8, 32), gold, 0, 0.15, 0).rotation.x = Math.PI / 2;
  add(prop, new THREE.TorusGeometry(0.218, 0.012, 8, 40), gold, 0, -0.09, 0).rotation.x = Math.PI / 2;
  add(prop, new THREE.CircleGeometry(0.086, 24), inkBlack, 0, 0.142, 0).rotation.x = -Math.PI / 2;

  // The quill lives on the body, not in the hand, so it can fly. Its nib is the origin.
  const quill = new THREE.Group();
  body.add(quill);
  const nib = add(quill, new THREE.ConeGeometry(0.018, 0.075, 8), gold, 0, 0.037, 0);
  nib.rotation.z = Math.PI;
  const plume = feather(0.58, 0.085);
  plume.position.y = 0.07;
  quill.add(plume);

  // Ink creeping over the shell: only the part above `level` is drawn.
  const floodMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 2 } },
    vertexShader: `varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vPosition = position;
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform float level; varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float edge = level + sin(vPosition.x * 9.0 + vPosition.z * 7.0) * 0.07 + sin(vPosition.x * 23.0) * 0.025;
        if (vPosition.y < edge) discard;
        float shine = pow(max(dot(normalize(vNormal), normalize(vec3(-0.35, 0.65, 0.68))), 0.0), 34.0);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
        gl_FragColor = vec4(vec3(0.016, 0.02, 0.035) + vec3(0.55, 0.58, 0.7) * shine + vec3(0.07, 0.08, 0.13) * rim, 1.0); }`,
  });
  const flood = add(body, shell, floodMaterial);
  flood.scale.setScalar(1.012);
  flood.visible = false;

  const pool = add(body, new THREE.CircleGeometry(1, 56), inkBlack, 0, -1.08, 0.08);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.setScalar(0);
  const drop = add(body, new THREE.SphereGeometry(0.035, 12, 10), inkBlack);
  drop.scale.set(0.8, 1.25, 0.8);
  drop.visible = false;

  const see = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const rippleMaterial = see("#f3cf82");
  const ripple = add(body, new THREE.TorusGeometry(1, 0.012, 6, 80), rippleMaterial, 0, -1.07, 0.08);
  ripple.rotation.x = Math.PI / 2;
  ripple.scale.setScalar(0);

  // The golden line the quill leaves, revealed along its length as it writes.
  const path = outlineOf(shape);
  const writingMaterial = see("#ffd98c");
  const written = add(body, new THREE.TubeGeometry(path, 240, 0.017, 6, true), writingMaterial, 0, 0, 0.98);
  written.visible = false;
  const flourishMaterial = see("#ffe2a0");
  const flourish = add(body, new THREE.TorusGeometry(1, 0.016, 8, 96), flourishMaterial, 0, 0, 0.98);
  flourish.scale.setScalar(0);
  return { quill, flood, floodMaterial, pool, drop, ripple, rippleMaterial, path, written, writingMaterial, writtenLength: written.geometry.index!.count, flourish, flourishMaterial };
}
