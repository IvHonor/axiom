// The Glow slot: what drifts around Lemma. Local geometry, like everything it
// wears. Nothing but the plain motes has a place until `update` gives it one,
// so a companion's measured size never depends on its glow.
import * as THREE from "three";
import { clockTurn, gearGeometry } from "./clockwork";
import { cardGeometries } from "./greatLibrary";
import type { GlowEffect } from "./look";

export function buildGlowEffect(kind: GlowEffect, root: THREE.Object3D, soft: THREE.Material) {
  const group = new THREE.Group();
  root.add(group);
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(0);
    group.add(mesh);
    return mesh;
  };
  let update = (_time: number) => {};

  if (kind === "embers") {
    const material = new THREE.MeshBasicMaterial({ color: "#ff9d4d", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const geometry = new THREE.OctahedronGeometry(0.026);
    const embers = Array.from({ length: 16 }, () => part(geometry, material));
    update = (time) => embers.forEach((ember, i) => {
      // Each rises from below, drifting, and burns out on the way up.
      const rise = (time * (0.08 + (i % 3) * 0.022) + i * 0.137) % 1;
      const angle = i * 2.4 + time * 0.12, reach = 0.98 + Math.sin(i * 1.7) * 0.24;
      ember.position.set(Math.cos(angle) * reach + Math.sin(time + i) * 0.04, -1 + rise * 2.25, Math.sin(angle) * reach * 0.75 - 0.1);
      ember.rotation.set(time + i, time * 0.7, 0);
      ember.scale.setScalar(Math.sin(rise * Math.PI) * (i % 4 ? 1 : 1.5));
    });
  } else if (kind === "fireflies") {
    const core = new THREE.MeshBasicMaterial({ color: "#e6ff9a" });
    const halo = new THREE.MeshBasicMaterial({ color: "#c7f56b", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const dot = new THREE.SphereGeometry(0.02, 10, 8), bloom = new THREE.SphereGeometry(0.06, 12, 8);
    const flies = Array.from({ length: 9 }, () => {
      const fly = part(dot, core);
      fly.add(new THREE.Mesh(bloom, halo));
      return fly;
    });
    update = (time) => flies.forEach((fly, i) => {
      const speed = 0.22 + (i % 4) * 0.05, angle = i * 2.1 + time * speed;
      fly.position.set(Math.cos(angle) * (1.06 + Math.sin(time * 0.3 + i) * 0.2), Math.sin(time * speed * 1.7 + i * 1.3) * 0.8, Math.sin(angle) * 0.8 - 0.05);
      // A slow pulse, dark between flashes.
      fly.scale.setScalar(Math.max(0.12, Math.sin(time * 0.9 + i * 1.9)) ** 2 * 1.15);
    });
  } else if (kind === "verdigris") {
    const flake = new THREE.MeshStandardMaterial({ color: "#58c4b0", emissive: "#1f8a78", emissiveIntensity: 0.75, metalness: 0.3, roughness: 0.4 });
    const pale = new THREE.MeshStandardMaterial({ color: "#a5ecdc", emissive: "#3aa893", emissiveIntensity: 0.65, metalness: 0.2, roughness: 0.35 });
    const copper = new THREE.MeshStandardMaterial({ color: "#c98a55", emissive: "#7c4a22", emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.38 });
    const chip = new THREE.TetrahedronGeometry(0.038), cog = gearGeometry(0.062, 8, 0.014, 0.018, false);
    const flakes = Array.from({ length: 14 }, (_, i) => part(chip, i % 3 ? flake : pale));
    const cogs = Array.from({ length: 6 }, (_, i) => part(cog, i % 2 ? copper : flake));
    update = (time) => {
      flakes.forEach((piece, i) => {
        const angle = i * 2.4 + time * (0.1 + (i % 3) * 0.03), reach = 1.04 + Math.sin(i * 1.3) * 0.2;
        piece.position.set(Math.cos(angle) * reach, Math.sin(time * 0.35 + i * 1.1) * 0.82, Math.sin(angle) * reach * 0.72 - 0.08);
        piece.rotation.set(time * 0.9 + i, time * 0.6 + i * 2, 0);
        piece.scale.set(1, 0.42, 1).multiplyScalar(0.72 + Math.sin(time * 0.8 + i) * 0.28);
      });
      // The cogs keep clockwork time: they circle and turn in ticks.
      const turn = clockTurn(time);
      cogs.forEach((piece, i) => {
        const angle = i / cogs.length * Math.PI * 2 + turn * 0.012;
        piece.position.set(Math.cos(angle) * 1.26, Math.sin(angle * 2 + i) * 0.34 + (i % 2 ? 0.34 : -0.28), Math.sin(angle) * 0.72 + 0.1);
        piece.rotation.z = (i % 2 ? 1 : -1) * turn * 0.2;
        piece.scale.setScalar(1);
      });
    };
  } else if (kind === "pack-of-cards") {
    // "You're nothing but a pack of cards!": a loose deck whirling round Lemma.
    const { faces, back, material } = cardGeometries();
    const cards = Array.from({ length: 16 }, (_, i) => {
      const card = part(faces[i % faces.length], material);
      const reverse = new THREE.Mesh(back, material);
      reverse.rotation.y = Math.PI;
      reverse.position.z = -0.001;
      card.add(reverse);
      return card;
    });
    update = (time) => cards.forEach((card, i) => {
      // They ride a tilted, breathing whirl, flipping as they go.
      const angle = i / cards.length * Math.PI * 2 + time * 0.34 + Math.sin(time * 0.31 + i) * 0.12;
      const reach = 1.16 + Math.sin(time * 0.5 + i * 1.3) * 0.13;
      card.position.set(Math.cos(angle) * reach, Math.sin(angle * 2 + i) * 0.16 + Math.sin(angle) * 0.42 + (i % 3 - 1) * 0.2, Math.sin(angle) * reach * 0.72 - 0.05);
      card.rotation.set(time * (0.7 + (i % 3) * 0.2) + i, time * (1.1 + (i % 4) * 0.16) + i * 2, Math.sin(time + i) * 0.5);
      card.scale.setScalar(0.92);
    });
  } else if (kind === "mood-ink") {
    const drops = Array.from({ length: 15 }, (_, i) => {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.16, metalness: 0.1, emissiveIntensity: 0.55 });
      const drop = part(new THREE.SphereGeometry(0.038, 14, 12), material);
      return { drop, material, tint: i / 15 };
    });
    update = (time) => drops.forEach(({ drop, material, tint }, i) => {
      // Each slowly sinks and sways, its colour drifting like a changing mood.
      const fall = (time * (0.035 + (i % 4) * 0.008) + i * 0.173) % 1, angle = i * 2.4 + time * 0.09, reach = 1.05 + Math.sin(i * 1.9) * 0.22;
      drop.position.set(Math.cos(angle) * reach + Math.sin(time * 0.5 + i) * 0.05, 1.05 - fall * 2.1, Math.sin(angle) * reach * 0.72 - 0.05);
      material.color.setHSL((tint + time * 0.025) % 1, 0.68, 0.6);
      material.emissive.copy(material.color);
      const size = Math.sin(fall * Math.PI) * (i % 3 ? 1 : 1.35);
      drop.scale.set(size * 0.82, size * 1.22, size * 0.82);
    });
  } else if (kind !== "none") {
    // The plain motes, the look every Lemma starts with.
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(i % 3 === 0 ? 0.025 : 0.012), soft);
      mote.position.set(Math.sin(angle) * 1.2, (i % 4) * 0.48 - 0.65, Math.cos(angle) * 0.8 - 0.3);
      group.add(mote);
    }
    update = (time) => { group.rotation.y = time * 0.08; };
  }
  return { group, update: (time: number) => update(time) };
}
