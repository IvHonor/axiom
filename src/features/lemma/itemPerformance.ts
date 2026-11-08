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
  if (!frame) return null;
  const p = frame.progress;
  switch (frame.kind) {
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
      m.held.position.lerp(new THREE.Vector3(0.12, m.face.position.y - 0.34, m.face.position.z + 0.36), lift);
      const flip = pulse(0.32, 0.48, 0.64, 0.82, p);
      m.held.rotation.z += Math.PI * flip;
      m.page.visible = p > 0.15 && p < 0.32;
      m.page.rotation.y = -ease(0.15, 0.32, p) * Math.PI;
      const surprise = p > 0.48 && p < 0.68;
      return { eyes: surprise ? [1.4, 1.4] : [0.8, 0.8], mouth: surprise ? "round" : p > 0.82 ? "smile" : "flat", gaze: [-0.025 + Math.sin(p * 35) * 0.025, -0.045] };
    }
    case "plant": {
      const growing = pulse(0.22, 0.58, 0.78, 1, p);
      m.sprout.scale.y = 1 + growing * 1.8;
      m.sprout.rotation.z = growing * 0.6;
      m.held.position.x -= growing * 0.35;
      m.held.position.z += growing * 0.35;
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
