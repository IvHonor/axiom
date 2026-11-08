import * as THREE from "three";
import type { CompanionModel } from "./model";
import type { Expression } from "./expressions";
import { ease, pulse, type IdleFrame } from "./itemIdle";

export interface PerformanceFace {
  eyes: [number, number];
  mouth: Expression["mouth"];
  gaze: [number, number];
  closed?: boolean;
  happy?: boolean;
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
  if (!frame) return null;
  const p = frame.progress;
  switch (frame.kind) {
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
