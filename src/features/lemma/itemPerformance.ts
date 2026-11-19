import * as THREE from "three";
import type { CompanionModel } from "./model";
import type { Expression } from "./expressions";
import { ease, pulse, type IdleFrame } from "./itemIdle";

const TAU = Math.PI * 2;
/** Ten past ten, the way watches are shown. */
const REST_MINUTE = -Math.PI / 3, REST_HOUR = Math.PI / 3 - Math.PI / 36;
/** The Hour Stops: when time rewinds, and when it locks at twelve. */
const REWIND = 0.46, LOCK = 0.72;
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
/** How far the True Compass's lid stands open. */
export const LID_OPEN = -1.78;
const EMBER = new THREE.Color("#ff4a1a"), GOLD_LIGHT = new THREE.Color("#fff0bd"), UP = new THREE.Vector3(0, 1, 0);

export interface PerformanceFace {
  eyes: [number, number];
  mouth: Expression["mouth"];
  gaze: [number, number];
  closed?: boolean;
  happy?: boolean;
  /** No eyes or brows at all. */
  hidden?: boolean;
}

/** Reapply the base pose every frame, so every exit path restores the companion. */
export function performItem(m: CompanionModel, frame: IdleFrame | null, time: number): PerformanceFace | null {
  m.held.position.copy(m.heldOrigin);
  m.held.rotation.set(0.08, -0.25, 0.08);
  m.prop.rotation.set(0, 0, 0);
  m.sprout.scale.setScalar(1); m.sprout.rotation.z = 0;
  m.bookCover.rotation.y = 0;
  m.page.visible = false; m.page.rotation.y = 0;
  m.steam.scale.setScalar(1);
  m.hat.position.copy(m.hatOrigin);
  m.drop.visible = m.sneeze.visible = false;
  m.body.position.x = 0; m.body.visible = m.face.visible = true;
  m.hologram.uniforms.dissolve.value = 1;
  for (const [material, opacity] of m.bodyMaterials) material.opacity = opacity;
  if (m.code) {
    m.code.rain.visible = m.code.ghostEyes.visible = false;
    m.code.coreMaterial.uniforms.time.value = time;
    m.code.coreMaterial.uniforms.alpha.value = 1;
    m.code.rainMaterial.uniforms.time.value = time;
  }
  if (m.lantern) {
    m.held.updateMatrix();
    m.lantern.star.position.set(0, Math.sin(time * 1.8) * 0.018, 0).applyMatrix4(m.held.matrix);
    m.lantern.star.rotation.set(0, Math.sin(time * 0.8) * 0.3, Math.sin(time) * 0.06);
    m.lantern.star.scale.setScalar(1);
    m.lantern.starMaterial.emissiveIntensity = 1.25;
    m.lantern.haloMaterial.opacity = 0.10;
    m.lantern.light.intensity = 0.45;
    m.lantern.sparks.visible = false;
  }
  if (m.watch) {
    const watch = m.watch;
    watch.lid.rotation.y = 0;
    watch.crown.rotation.y = 0;
    watch.minute.rotation.z = REST_MINUTE;
    watch.hour.rotation.z = REST_HOUR;
    watch.second.rotation.z = -Math.floor(time) * TAU / 60;
    watch.dial.visible = watch.chime.visible = false;
    watch.dial.position.x = 0;
    watch.dial.rotation.z = 0;
    watch.drive = watch.stillness = 0;
    if (m.revealedWorks) m.revealedWorks.visible = false;
    if (m.interior) m.interior.visible = true;
    m.casing.opacity = m.casingOpacity;
    if (m.edges) m.edges.visible = true;
    m.lens.scale.copy(m.lensScale);
    m.hat.scale.copy(m.hatScale);
    m.neckwear.scale.setScalar(1);
    m.drainColour(0);
  }
  if (m.ink) {
    const ink = m.ink;
    ink.drop.visible = ink.written.visible = false;
    ink.floodMaterial.uniforms.level.value = 2;
    ink.pool.scale.setScalar(0);
    ink.ripple.scale.setScalar(0);
    ink.flourish.scale.setScalar(0);
    ink.written.geometry.setDrawRange(0, 0);
    for (const part of m.shellParts) { part.object.scale.copy(part.scale); part.object.position.copy(part.position); }
    ink.flood.visible = false;
    if (m.globe) m.globe.material.uniforms.rise.value = 0;
    if (m.edges) m.edges.visible = true;
    m.face.position.copy(m.faceOrigin);
    m.lens.scale.copy(m.lensScale);
    m.hat.scale.copy(m.hatScale);
    m.neckwear.scale.setScalar(1);
    m.held.updateMatrix();
    ink.quill.position.set(0.075, 0.13, 0.015).applyMatrix4(m.held.matrix);
    ink.quill.rotation.set(0, 0.3, -0.34);
  }
  if (m.gyges) {
    const gyges = m.gyges;
    m.held.updateMatrix();
    gyges.ring.position.set(0, 0.03 + Math.sin(time * 1.4) * 0.012, 0.01).applyMatrix4(m.held.matrix);
    gyges.ring.rotation.set(0.1, -0.2 + Math.sin(time * 0.6) * 0.25, 0.06);
    gyges.ring.scale.setScalar(1);
    gyges.bezel.rotation.z = 0;
    gyges.stoneMaterial.emissiveIntensity = 0.5;
    gyges.realm.visible = false;
    gyges.stand.scale.setScalar(1);
    if (m.interior) m.interior.visible = true;
    m.casing.opacity = m.casingOpacity;
    if (m.edges) m.edges.visible = true;
    m.lens.scale.copy(m.lensScale);
    m.palm.visible = true;
    m.hat.rotation.x = m.face.rotation.x = m.neckwear.rotation.y = 0;
  }
  if (m.compass) {
    const c = m.compass;
    c.lid.rotation.x = LID_OPEN;
    c.plateMaterial.emissiveIntensity = 0;
    c.part.spin = 0;
    c.part.held = false;
    c.shadow.visible = c.beam.visible = c.under.visible = c.veil.visible = false;
    c.shards.forEach(piece => { piece.visible = false; });
    c.horns.forEach(horn => horn.scale.setScalar(0.001));
    for (const part of m.shellParts) { part.object.scale.copy(part.scale); part.object.position.copy(part.position); }
    if (c.part.faceColour) for (const part of [...m.eyes.flatMap(eye => [eye.open, eye.happy]), ...Object.values(m.mouths)]) (part.material as THREE.MeshBasicMaterial).color.copy(c.part.faceColour);
    m.base.visible = true;
    m.face.position.copy(m.faceOrigin);
    m.lens.scale.copy(m.lensScale);
    m.hat.scale.copy(m.hatScale);
    m.neckwear.scale.setScalar(1);
    if (m.interior) m.interior.visible = true;
    if (m.edges) m.edges.visible = true;
  }
  if (!frame) return null;
  const p = frame.progress;
  switch (frame.kind) {
    case "gyges-ring": {
      // The stone turns inward and Lemma is gone; only what it's wearing is left, carrying on without it.
      if (!m.gyges) return null;
      const g = m.gyges;
      const lift = pulse(0, 0.07, 0.93, 1, p);
      m.held.position.lerp(new THREE.Vector3(0.82, m.heldOrigin.y + 0.1, m.face.position.z + 0.18), lift);
      m.held.updateMatrix();
      const rest = new THREE.Vector3(0, 0.03, 0.01).applyMatrix4(m.held.matrix);
      // It rises before Lemma's eyes, and after a held moment the stone turns inward with a flash.
      const rise = pulse(0.05, 0.14, 0.8, 0.89, p), close = pulse(0.09, 0.15, 0.28, 0.36, p);
      const before = new THREE.Vector3(0.02, m.faceOrigin.y + 0.05, m.faceOrigin.z + 0.42);
      g.ring.position.lerpVectors(rest, before, rise);
      g.ring.rotation.set(0.12, -0.2 + ease(0.08, 0.15, p) * 0.2, Math.sin(p * 18) * 0.03 * rise);
      g.ring.scale.setScalar(1 + close * 0.9);
      g.bezel.rotation.z = ease(0.17, 0.235, p) * Math.PI * (1 - ease(0.8, 0.86, p));
      g.stoneMaterial.emissiveIntensity = 0.5 + pulse(0.2, 0.235, 0.24, 0.33, p) * 5 + pulse(0.78, 0.82, 0.84, 0.9, p) * 3;
      // The body comes apart as silver dust, and gathers again at the end.
      const gone = pulse(0.25, 0.38, 0.79, 0.91, p), dust = pulse(0.24, 0.43, 0.77, 0.93, p);
      g.realm.visible = p > 0.22 && p < 0.97;
      g.dustMaterial.uniforms.amount.value = dust;
      m.casing.opacity = m.casingOpacity * (1 - gone);
      m.hologram.uniforms.dissolve.value = 1 - gone;
      if (m.interior) m.interior.visible = gone < 0.5;
      if (m.edges) m.edges.visible = gone < 0.5;
      m.mouth.visible = gone < 0.5;
      m.lens.scale.copy(m.lensScale).multiplyScalar(Math.max(0.001, 1 - gone));
      m.palm.visible = gone < 0.5;
      g.stand.scale.setScalar(Math.max(0.001, 1 - gone));
      // Nobody home, but the clothes carry on: wandering, looking about, tipping the hat.
      const about = pulse(0.38, 0.45, 0.72, 0.8, p), walk = (p - 0.38) * 24;
      m.body.position.x += Math.sin(walk) * 0.2 * about;
      m.body.position.y += Math.abs(Math.sin(walk * 2)) * 0.045 * about;
      m.face.rotation.y += Math.sin((p - 0.38) * 34) * 0.55 * about;
      m.face.rotation.x = Math.sin((p - 0.38) * 21) * 0.1 * about;
      m.neckwear.rotation.y = Math.sin(walk * 2 + 0.6) * 0.28 * about;
      const tip = pulse(0.5, 0.54, 0.58, 0.63, p);
      m.hat.position.y += tip * 0.2 + Math.abs(Math.sin(walk * 2 + 0.3)) * 0.03 * about;
      m.hat.rotation.x = tip * 0.42;
      // The ring goes with them, as if on an unseen finger.
      const drift = pulse(0.31, 0.41, 0.72, 0.81, p), turn = (p - 0.31) * 15;
      g.ring.position.add(new THREE.Vector3(Math.sin(turn) * 0.85 * drift, Math.sin(turn * 2) * 0.26 * drift, (Math.cos(turn) * 0.28 - 0.1) * drift));
      g.windMaterial.opacity = gone * 0.22;
      g.wind.forEach(({ streak, speed, seed, size }) => {
        streak.position.x = ((p * speed * 7 + seed) % 1) * 4 - 2;
        streak.scale.x = size * (0.4 + gone);
      });
      // Colour bursts out from the ring, and Lemma is back, rather pleased with itself.
      const rush = ease(0.8, 0.91, p);
      g.shock.visible = rush > 0 && rush < 1;
      g.shock.scale.setScalar(Math.max(0.001, rush * 1.9));
      g.waveMaterial.opacity = (1 - rush) * 0.85;
      const dressed = m.hat.children.length + m.neckwear.children.length + m.facewear.children.length > 0;
      const away = gone > 0.5, back = p > 0.9;
      return { eyes: back ? [0.68, 1.02] : away ? [1.2, 1.2] : close > 0.4 ? [1.25, 1.25] : [1, 1], mouth: back ? "smile" : p > 0.14 ? "round" : "flat", gaze: p < 0.25 ? [0.01, 0.04] : away ? [Math.sin((p - 0.38) * 34) * 0.05, 0] : back ? [0.05, 0.01] : [0.02, 0.01], hidden: away && dressed };
    }
    case "true-compass": {
      // The shadow drags Lemma under and makes it its own, until the compass finds north and the light brings it back.
      if (!m.compass) return null;
      const c = m.compass;
      const lift = pulse(0, 0.07, 0.94, 1, p);
      m.held.position.lerp(new THREE.Vector3(0.78, Math.max(m.heldOrigin.y + 0.34, m.faceOrigin.y - 0.2), m.faceOrigin.z + 0.42), lift);
      m.held.rotation.y -= lift * 0.28;
      // A black pool opens, and the shadow stands up out of it.
      const spread = pulse(0.06, 0.18, 0.87, 0.96, p);
      c.under.visible = spread > 0.002;
      m.base.visible = spread < 0.3;
      c.poolMaterial.uniforms.spread.value = spread * 0.92;
      const loom = pulse(0.12, 0.3, 0.64, 0.7, p);
      c.shadow.visible = p > 0.11 && p < 0.86;
      c.figure.visible = c.outline.visible = loom > 0.005;
      c.shadow.scale.setScalar(0.62 + ease(0.12, 0.5, p) * 0.72 + Math.sin(p * 34) * 0.012);
      c.shadow.position.y = -1.0 + ease(0.12, 0.34, p) * 0.76;
      c.shadowMaterial.opacity = loom * 0.94;
      (c.outline.material as THREE.LineBasicMaterial).opacity = loom * 0.8;
      c.emberMaterial.opacity = pulse(0.2, 0.3, 0.62, 0.68, p);
      // Its hands climb Lemma, and black spreads up from where they hold.
      const grow = ease(0.16, 0.31, p) * (1 - ease(0.5, 0.56, p));
      c.tendrils.forEach(({ geometry, length, delay }) => geometry.setDrawRange(0, Math.floor(Math.max(0, Math.min(1, grow * (1 + delay) - delay)) * length / 3) * 3));
      const dark = ease(0.23, 0.39, p) * (1 - ease(0.76, 0.79, p)), gold = ease(0.68, 0.79, p) * (1 - ease(0.9, 0.975, p));
      c.veil.visible = dark > 0 || gold > 0;
      c.veilMaterial.uniforms.dark.value = dark;
      c.veilMaterial.uniforms.gold.value = gold;
      // It changes: horns, and eyes like coals.
      const horned = pulse(0.31, 0.41, 0.72, 0.8, p);
      c.horns.forEach(horn => horn.scale.setScalar(Math.max(0.001, horned)));
      c.hornMaterial.color.set("#0d0a10").lerp(GOLD_LIGHT, ease(0.69, 0.75, p));
      const ember = pulse(0.32, 0.39, 0.66, 0.7, p), glory = pulse(0.72, 0.78, 0.9, 0.96, p);
      for (const part of [...m.eyes.flatMap(eye => [eye.open, eye.happy]), ...Object.values(m.mouths)]) {
        const colour = (part.material as THREE.MeshBasicMaterial).color;
        c.part.faceColour ??= colour.clone();
        colour.copy(c.part.faceColour).lerp(EMBER, ember).lerp(GOLD_LIGHT, glory);
      }
      // It struggles, and is hauled under in jerks, eyes last.
      const struggle = pulse(0.18, 0.24, 0.45, 0.5, p);
      m.body.position.x += Math.sin(p * 170) * 0.022 * struggle;
      m.body.rotation.z += Math.sin(p * 130) * 0.035 * struggle;
      const haul = ease(0.43, 0.57, p) + Math.sin(p * 80) * 0.02 * pulse(0.43, 0.47, 0.53, 0.57, p);
      const sunk = Math.max(0, Math.min(1, haul)) * (1 - ease(0.71, 0.83, p));
      for (const part of m.shellParts) {
        part.object.scale.set(part.scale.x * (1 + sunk * 0.3), part.scale.y * Math.max(0.03, 1 - sunk), part.scale.z * (1 + sunk * 0.3));
        part.object.position.y = part.position.y - sunk * 1.02;
      }
      c.veil.scale.set(1.016 * (1 + sunk * 0.3), 1.016 * Math.max(0.03, 1 - sunk), 1.016 * (1 + sunk * 0.3));
      m.face.position.y = m.faceOrigin.y + (-0.86 - m.faceOrigin.y) * sunk;
      m.face.visible = sunk < 0.96;
      const hiddenBody = pulse(0.27, 0.36, 0.86, 0.94, p);
      if (m.interior) m.interior.visible = hiddenBody < 0.5;
      if (m.edges) m.edges.visible = hiddenBody < 0.5;
      m.hologram.uniforms.dissolve.value = 1 - hiddenBody;
      const tuck = Math.max(0.001, 1 - pulse(0.42, 0.5, 0.78, 0.86, p));
      m.hat.scale.copy(m.hatScale).multiplyScalar(tuck);
      m.neckwear.scale.setScalar(tuck);
      m.facewear.visible = sunk < 0.5;
      m.lens.scale.copy(m.lensScale).multiplyScalar(Math.max(0.001, 1 - pulse(0.46, 0.54, 0.76, 0.84, p)));
      // Alone in the dark, the needle goes wild, then stops dead on north.
      const lock = ease(0.585, 0.6, p), frenzy = ease(0.1, 0.42, p) * (1 - lock);
      c.part.spin = frenzy > 0 ? p * 120 * frenzy : 0;
      c.part.held = lock > 0.5;
      m.held.position.x += Math.sin(p * 210) * 0.008 * frenzy;
      // Its light goes down into the pool, and the pool breaks up in gold.
      const blaze = pulse(0.6, 0.635, 0.72, 0.79, p);
      c.beam.visible = blaze > 0.01;
      m.held.updateMatrix();
      const from = new THREE.Vector3(0, 0.12, 0.1).applyMatrix4(m.held.matrix), to = new THREE.Vector3(0.05, -0.98, 0.2);
      c.beam.position.copy(from);
      c.beam.quaternion.setFromUnitVectors(UP, from.clone().sub(to).normalize());
      c.beam.scale.set(0.5 + blaze * 0.9, from.distanceTo(to), 0.5 + blaze * 0.9);
      c.beamMaterial.opacity = blaze * 0.42;
      c.poolMaterial.uniforms.gold.value = ease(0.62, 0.74, p);
      c.rose.scale.setScalar(Math.max(0.001, 0.3 + ease(0.63, 0.73, p) * 0.75));
      c.rose.rotation.z = p * 2.2;
      c.roseMaterial.opacity = pulse(0.63, 0.68, 0.87, 0.95, p);
      // The shadow is torn apart, and a column of light lifts Lemma out, shining.
      const shatter = ease(0.66, 0.84, p);
      c.shards.forEach((piece, i) => {
        piece.visible = shatter > 0 && shatter < 1;
        const home = piece.userData.home as THREE.Vector3;
        piece.position.copy(home).multiplyScalar(1 + shatter * (1.2 + (i % 3) * 0.5));
        piece.rotation.set(shatter * (3 + i), shatter * (4 - i * 0.3), 0);
        piece.scale.setScalar(Math.max(0.001, 1 - shatter));
      });
      const shine = pulse(0.67, 0.74, 0.87, 0.96, p);
      c.columnMaterial.uniforms.strength.value = shine;
      c.sparkMaterial.uniforms.strength.value = shine;
      c.sparkMaterial.uniforms.rise.value = p * 9;
      m.body.position.y += pulse(0.76, 0.84, 0.9, 0.97, p) * (0.14 + Math.sin(p * 40) * 0.015);
      // The lid snaps shut on it all, the words shining, and opens again.
      c.lid.rotation.x = LID_OPEN * (1 - pulse(0.925, 0.945, 0.97, 0.995, p));
      c.plateMaterial.emissiveIntensity = pulse(0.86, 0.9, 0.925, 0.94, p) * 0.75;
      return {
        eyes: glory > 0.3 ? [1.18, 1.18] : ember > 0.4 ? [0.42, 0.42] : struggle > 0.3 ? [1.32, 1.32] : [1, 1],
        mouth: p > 0.78 ? "smile" : ember > 0.4 ? "flat" : struggle > 0.3 ? "round" : p > 0.1 ? "frown" : "flat",
        gaze: ember > 0.4 ? [0, -0.02] : struggle > 0.3 ? [Math.sin(p * 60) * 0.05, -0.05] : [0.05, -0.012], closed: p > 0.905 && p < 0.92, happy: p > 0.93,
      };
    }
    case "last-word": {
      // Lemma floods with ink, sinks into a pool, and the quill writes it back.
      if (!m.ink) return null;
      const ink = m.ink;
      const lift = pulse(0, 0.07, 0.93, 1, p), aside = pulse(0.18, 0.28, 0.88, 0.95, p);
      m.held.position.lerp(new THREE.Vector3(0.74, Math.max(m.heldOrigin.y + 0.2, m.face.position.y - 0.34), m.face.position.z + 0.34), lift);
      m.held.position.lerp(new THREE.Vector3(1.08, -0.92, 0.72), aside);
      m.held.updateMatrix();
      const inWell = new THREE.Vector3(0.075, 0.13, 0.015).applyMatrix4(m.held.matrix);
      const above = new THREE.Vector3(0.16, 1.14, 0.92);
      const head = new THREE.Vector3(0.16, m.faceOrigin.y + 0.72, 0.5);

      // Two dips, then up over Lemma's head to let one drop fall.
      const dips = p > 0.06 && p < 0.16 ? Math.abs(Math.sin((p - 0.06) / 0.1 * Math.PI * 2)) * 0.16 : 0;
      const rise = pulse(0.16, 0.22, 0.88, 0.92, p);
      ink.quill.position.copy(inWell).setY(inWell.y + dips).lerp(above, rise);
      ink.quill.rotation.set(0, 0.3 - rise * 0.3, -0.34 + rise * 0.74);
      const falling = (p - 0.22) / 0.05;
      ink.drop.visible = falling > 0 && falling < 1;
      if (ink.drop.visible) ink.drop.position.lerpVectors(above, head, falling * falling);

      // The ink runs down over the shell until only the eyes are left.
      const spread = ease(0.27, 0.42, p), clear = ease(0.73, 0.9, p);
      // In a Living Ink shell, the ink already inside rises to fill it instead.
      ink.flood.visible = !m.globe && spread > 0 && clear < 1;
      if (m.globe) m.globe.material.uniforms.rise.value = spread * (1 - clear);
      ink.floodMaterial.uniforms.level.value = clear > 0 ? -1.2 + clear * 2.4 : 1.2 - spread * 2.4;
      m.hologram.uniforms.dissolve.value = 1 - pulse(0.27, 0.4, 0.74, 0.9, p);
      if (m.edges) m.edges.visible = spread < 0.5 || clear > 0.5;
      m.mouth.visible = spread < 0.35 || clear > 0.8;
      m.facewear.visible = spread < 0.2 || clear > 0.9;
      m.lens.scale.copy(m.lensScale).multiplyScalar(Math.max(0.001, 1 - pulse(0.3, 0.4, 0.8, 0.9, p)));
      const tuck = Math.max(0.001, 1 - pulse(0.24, 0.36, 0.84, 0.93, p));
      m.hat.scale.copy(m.hatScale).multiplyScalar(tuck);
      m.neckwear.scale.setScalar(tuck);

      // Then all of it slumps into a pool, and rises again as it's written.
      const sunk = pulse(0.42, 0.53, 0.68, 0.86, p);
      for (const part of m.shellParts) {
        part.object.scale.set(part.scale.x * (1 + sunk * 0.3), part.scale.y * Math.max(0.03, 1 - sunk), part.scale.z * (1 + sunk * 0.3));
        part.object.position.y = part.position.y - sunk * 1.02;
      }
      m.face.position.y = m.faceOrigin.y + (-0.86 - m.faceOrigin.y) * sunk;
      ink.pool.scale.setScalar(Math.max(0.001, sunk * 1.28));
      const wave = ease(0.5, 0.64, p);
      ink.ripple.scale.setScalar(Math.max(0.001, wave * 1.5));
      ink.rippleMaterial.opacity = wave > 0 && wave < 1 ? (1 - wave) * 0.75 : 0;

      // The quill writes the outline in gold, and the body follows it back.
      const write = ease(0.6, 0.86, p), fade = ease(0.9, 0.96, p);
      ink.written.visible = write > 0 && fade < 1;
      ink.written.geometry.setDrawRange(0, Math.floor(ink.writtenLength * write / 3) * 3);
      ink.writingMaterial.opacity = (1 - fade) * 0.95;
      if (p > 0.56 && p < 0.9) {
        const at = ink.path.getPointAt(write % 1).setZ(0.98);
        const moveIn = ease(0.56, 0.6, p), leave = ease(0.86, 0.9, p);
        ink.quill.position.lerpVectors(above, at, moveIn).lerp(inWell, leave);
        ink.quill.rotation.set(0, 0, 0.4 + Math.sin(p * 90) * 0.1 * (1 - leave));
      } else if (p >= 0.9) ink.quill.position.copy(inWell);

      // A final flourish.
      const flourish = ease(0.87, 0.95, p);
      ink.flourish.scale.setScalar(Math.max(0.001, 0.75 + flourish * 0.75));
      ink.flourish.visible = flourish > 0 && flourish < 1;
      ink.flourishMaterial.opacity = (1 - flourish) * 0.85;
      const gone = spread > 0.5 && clear < 0.6;
      return { eyes: gone ? [1.16, 1.16] : [1, 1], mouth: p > 0.93 ? "smile" : "flat", gaze: p < 0.27 ? [0.05, 0.03] : gone ? [0, 0] : [0.02, 0.02], closed: p > 0.925 && p < 0.94, happy: p > 0.955 };
    }
    case "long-hour": {
      // The Hour Stops: Lemma stops time, turns into a clock, winds it back, and is rebuilt by the chime.
      if (!m.watch) return null;
      const watch = m.watch, skeleton = !m.revealedWorks;
      // The watch comes up beside the face, then steps aside for the dial.
      const lift = pulse(0, 0.08, 0.92, 1, p), aside = pulse(0.24, 0.36, 0.82, 0.92, p);
      m.held.position.lerp(new THREE.Vector3(0.68, Math.max(m.heldOrigin.y + 0.34, m.face.position.y - 0.12), m.face.position.z + 0.34), lift);
      m.held.position.lerp(new THREE.Vector3(1.02, -1, 0.72), aside);
      m.held.rotation.y += lift * 0.05;
      m.held.rotation.z -= lift * 0.08;
      watch.lid.rotation.y = Math.PI * 0.84 * ease(0.05, 0.1, p) * (1 - ease(0.93, 0.95, p));
      // Its second hand stutters, then stops, and the world stops with it.
      const stutter = Math.min(p, 0.12);
      watch.second.rotation.z = -Math.floor(stutter / 0.016) * TAU / 60 + (p > 0.09 && p < 0.12 ? Math.sin(p * 900) * 0.05 : 0);
      const still = pulse(0.12, 0.18, 0.8, 0.86, p);
      watch.stillness = still;
      m.body.position.y *= 1 - still;
      m.body.rotation.x *= 1 - still;
      m.body.rotation.z *= 1 - still;
      m.drainColour(pulse(0.12, 0.24, 0.8, 0.89, p));

      // The shell falls away, and the hat and neckwear fold into the mechanism.
      const open = pulse(0.24, 0.38, 0.82, 0.91, p);
      if (m.revealedWorks) m.revealedWorks.visible = open > 0.005;
      // What fills the shell would hide the gears, so it goes with it.
      if (m.interior) m.interior.visible = open < 0.5;
      // The Skeleton keeps its clear shell: its gears are already on show.
      if (!skeleton) {
        m.casing.opacity = m.casingOpacity * (1 - open);
        m.hologram.uniforms.dissolve.value = 1 - open;
        if (m.edges) m.edges.visible = open < 0.5;
      }
      m.hat.scale.copy(m.hatScale).multiplyScalar(Math.max(0.001, 1 - open));
      m.neckwear.scale.setScalar(Math.max(0.001, 1 - open));
      m.facewear.visible = open < 0.4;
      m.lens.scale.copy(m.lensScale).multiplyScalar(Math.max(0.001, 1 - pulse(0.3, 0.42, 0.84, 0.9, p)));

      // The dial appears around all of it.
      const dialIn = pulse(0.26, 0.42, 0.84, 0.92, p);
      watch.dial.visible = dialIn > 0.005;
      watch.dial.scale.setScalar(mix(0.92, 1, dialIn));
      watch.dialMaterial.opacity = dialIn * 0.92;
      watch.backingMaterial.opacity = dialIn * (skeleton ? 0.35 : 0.62);

      // Time runs backwards, gathering speed, and stops dead at twelve.
      const run = Math.min(1, Math.max(0, (p - REWIND) / (LOCK - REWIND))), sweep = run ** 3;
      watch.minute.rotation.z = REST_MINUTE * (1 - sweep) + sweep * TAU * 12;
      watch.hour.rotation.z = REST_HOUR * (1 - sweep) + sweep * TAU;
      watch.crown.rotation.y = sweep * 24;
      watch.drive = sweep * 150 * (1 - ease(0.82, 0.96, p));

      // Lemma's eyes leave its face and become the hands.
      const hands = pulse(0.38, 0.46, 0.84, 0.92, p);
      m.face.visible = hands < 0.02;
      watch.eyeHands.forEach(({ pivot, blade }, i) => {
        const side = i ? 1 : -1, length = i ? 4.1 : 2.6, width = i ? 0.55 : 0.8;
        pivot.visible = hands >= 0.02;
        pivot.position.set(side * 0.22 * (1 - hands), (m.face.position.y + 0.02) * (1 - hands), 0.985);
        pivot.rotation.z = sweep * TAU * (i ? 12 : 1) * hands;
        blade.scale.set(mix(1, width, hands), mix(1, length, hands), 0.44);
        blade.position.y = hands * (0.11 * length - 0.04);
      });

      watch.numerals.forEach(({ numeral, material }, i) => {
        // The hour hand runs backwards from twelve: XI first, XII last.
        const passed = sweep > 0 && sweep >= (12 - i) / 12;
        material.color.set(passed ? "#fff1c4" : "#b9985a");
        material.opacity = dialIn * (passed ? 1 : 0.58);
        numeral.scale.setScalar(passed ? 1.14 : 1);
      });
      // Each echo flickers up as the hand passes its hour, and is gone soon after.
      watch.echoes.forEach((echo, i) => {
        const at = (12 - i) / 12;
        echo.scale.setScalar(0.17 * pulse(at - 0.04, at, at + 0.1, at + 0.22, sweep) * (1 - ease(LOCK, LOCK + 0.05, p)));
      });

      // The lock: one hard jolt, a crack across the glass, and a beat of stillness.
      const jolt = pulse(LOCK, LOCK + 0.004, LOCK + 0.012, LOCK + 0.05, p);
      watch.dial.position.x = jolt * 0.035;
      watch.dial.rotation.z = -jolt * 0.018;
      m.held.position.x += jolt * 0.03;
      const spread = ease(LOCK, LOCK + 0.016, p), wave = ease(0.8, 0.89, p), waveReach = wave * 2;
      watch.crackMaterial.opacity = spread;
      watch.crack.forEach(({ stroke, reach }, i) => { stroke.visible = spread > i / watch.crack.length && reach > waveReach; });
      // The chime rings out, sealing the crack; colour and shell return behind it.
      watch.chime.visible = wave > 0 && wave < 1;
      watch.chime.scale.setScalar(Math.max(0.001, waveReach));
      watch.chimeMaterial.opacity = (1 - wave) * 0.9;

      const settled = p > 0.92;
      return { eyes: settled ? [1, 1] : still > 0.5 ? [1.2, 1.2] : [1.02, 1.02], mouth: p > 0.94 ? "smile" : "flat", gaze: settled ? [0.02, -0.01] : [0.05, -0.012], closed: p > 0.925 && p < 0.94, happy: p > 0.955 };
    }
    case "first-light": {
      if (!m.lantern) return null;
      const lantern = m.lantern;
      const lift = pulse(0, 0.16, 0.84, 1, p);
      m.held.position.lerp(new THREE.Vector3(0.80, Math.max(m.heldOrigin.y + 0.22, m.face.position.y - 0.22), m.face.position.z + 0.28), lift);
      m.held.rotation.z -= lift * 0.08;
      m.held.updateMatrix();
      const origin = new THREE.Vector3().applyMatrix4(m.held.matrix);
      lanternFlight(p, origin, lantern.star.position);
      lantern.star.rotation.y = Math.sin(time * 2) * 0.3;
      const flare = pulse(0.84, 0.89, 0.93, 1, p);
      lantern.star.scale.setScalar(1 + flare * 0.15);
      lantern.starMaterial.emissiveIntensity = 1.25 + flare * 1.5;
      lantern.haloMaterial.opacity = 0.10 + flare * 0.13;
      lantern.light.intensity = 0.45 + flare * 0.65;
      const trail = pulse(0.18, 0.28, 0.76, 0.87, p);
      lantern.sparks.visible = trail > 0;
      lantern.sparkMaterial.opacity = trail * 0.8;
      lantern.sparks.children.forEach((spark, i) => {
        lanternFlight(Math.max(0.16, p - (i + 1) * 0.006), origin, spark.position);
        spark.scale.setScalar((1 - i / lantern.sparks.children.length) * trail);
        spark.rotation.z = time * 2 + i;
      });
      const watching = p > 0.16 && p < 0.84;
      return { eyes: watching ? [1.2, 1.2] : [0.95, 0.95], mouth: p > 0.84 ? "smile" : watching ? "round" : "smile", gaze: watching ? [lantern.star.position.x * 0.045, lantern.star.position.y * 0.035] : [0.035, -0.025], happy: p > 0.84 };
    }
    case "coffee": {
      const lift = pulse(0.08, 0.28, 0.50, 0.68, p);
      m.held.position.lerp(new THREE.Vector3(0.23, m.face.position.y - 0.20, m.face.position.z + 0.27), lift);
      m.held.rotation.z += lift * 0.62;
      m.held.rotation.x += lift * 0.45;
      const blow = p < 0.25, sip = p >= 0.25 && p < 0.52, buzz = p >= 0.58 && p < 0.83;
      m.steam.scale.y = 1 + (blow ? Math.sin(p * 60) * 0.25 : 0);
      if (buzz) { m.body.position.x = Math.sin(p * 140) * 0.012; m.body.rotation.z += Math.sin(p * 140) * 0.018; }
      return { eyes: sip ? [0.55, 0.55] : buzz ? [1.45, 1.45] : [0.95, 0.95], mouth: blow || sip ? "round" : "smile", gaze: p > 0.83 ? [-0.04, 0] : [0.025, -0.02], happy: sip };
    }
    case "book": {
      const lift = pulse(0, 0.15, 0.82, 1, p);
      const open = pulse(0.08, 0.26, 0.78, 0.96, p);
      m.held.position.lerp(new THREE.Vector3(0.14, m.face.position.y - 0.50, m.face.position.z + 0.36), lift);
      m.held.rotation.x -= open * 0.18;
      m.held.rotation.y += lift * 0.25;
      m.bookCover.rotation.y = -Math.PI * 0.84 * open;
      m.page.visible = p > 0.32 && p < 0.58;
      m.page.rotation.y = -ease(0.32, 0.58, p) * Math.PI * 0.84;
      return { eyes: [0.85, 0.85], mouth: p > 0.78 ? "smile" : "flat", gaze: [-0.025 + Math.sin(p * 35) * 0.025, -0.045] };
    }
    case "plant": {
      const growing = pulse(0.22, 0.58, 0.78, 1, p);
      m.sprout.scale.y = 1 + growing * 1.8;
      m.sprout.rotation.z = -growing * 0.32;
      m.held.position.x += growing * 0.25;
      m.held.position.z += growing * 0.18;
      if (p > 0.08 && p < 0.30) {
        const fall = ease(0.08, 0.30, p);
        m.drop.visible = true;
        m.drop.position.set(-0.25 + fall * 1.2, 0.5 - fall * 0.8 + Math.sin(fall * Math.PI) * 0.2, 0.6);
      }
      const tickled = p > 0.54 && p < 0.72, sneeze = p >= 0.72 && p < 0.83;
      if (sneeze) {
        const burst = (p - 0.72) / 0.11;
        m.sneeze.visible = true;
        m.sneeze.position.copy(m.face.position);
        m.sneeze.children.forEach((particle, i) => particle.position.set(Math.sin(i * 2.4) * burst * 0.65, Math.cos(i * 1.7) * burst * 0.45, 0.2 + burst * 0.6));
        m.body.rotation.x += Math.sin(burst * Math.PI) * 0.17;
        m.hat.position.y += Math.sin(burst * Math.PI) * 0.16;
      }
      return { eyes: tickled ? [0.55, 0.8] : [1.05, 1.05], mouth: tickled ? "round" : sneeze ? "round" : "smile", gaze: [0.045, growing * 0.015], closed: sneeze };
    }
    case "glitch": {
      if (!m.code) return null;
      const collapse = pulse(0.12, 0.38, 0.66, 0.94, p);
      for (const [material, opacity] of m.bodyMaterials) material.opacity = opacity * (1 - collapse);
      m.hologram.uniforms.dissolve.value = 1 - collapse;
      m.code.coreMaterial.uniforms.alpha.value = 1 - collapse;
      m.code.rainMaterial.uniforms.alpha.value = collapse;
      m.code.rain.visible = collapse > 0.01;
      m.body.visible = collapse < 0.98;
      m.face.visible = collapse < 0.42;
      m.code.rain.children.forEach((column, i) => {
        column.position.y = (i % 3 - 1) * 0.1 - collapse * ((p * 3 + i * 0.17) % 1) * 0.35;
      });
      m.code.ghostEyes.visible = collapse > 0.42;
      m.code.ghostEyes.rotation.z = Math.sin(p * 16) * 0.09;
      m.code.ghostEyes.children.forEach(eye => eye.scale.y = p > 0.50 && p < 0.53 ? 0.12 : 1);
      return { eyes: [1.25, 1.25], mouth: p > 0.85 ? "smile" : "round", gaze: [Math.sin(p * 14) * 0.04, 0] };
    }
  }
}

function lanternFlight(progress: number, origin: THREE.Vector3, target: THREE.Vector3) {
  const angle = ease(0.28, 0.72, progress) * Math.PI * 2;
  target.set(Math.cos(angle) * 1.12, 0.32 + Math.sin(angle) * 1.04, 1.05);
  if (progress < 0.28) target.lerpVectors(origin, target, ease(0.16, 0.28, progress));
  else if (progress > 0.72) target.lerp(origin, ease(0.72, 0.86, progress));
}
