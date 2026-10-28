import * as THREE from "three";
import { buildCompanion, disposeModel, type CompanionModel } from "./model";
import type { Look } from "./look";
import type { Mood } from "./Face";

export interface SceneState { look: Look; mood: Mood; level: number; working: boolean }

export function createCompanionScene(host: HTMLElement, initial: SceneState, availability: (ready: boolean) => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.85, 1.85, 1.85, -1.85, 0.1, 30);
  camera.position.set(0, 1.25, 7);
  camera.lookAt(0, 0.08, 0);
  scene.add(new THREE.HemisphereLight("#c6f3ff", "#173651", 2.5));
  const key = new THREE.DirectionalLight("#e9faff", 3.5);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#66cfff", 2);
  rim.position.set(3, 1, -2);
  scene.add(rim);

  let state = initial;
  let model: CompanionModel;
  let signature = "";
  let visible = true, lost = false, disposed = false;
  let lastFrame = 0, time = 0, nextBlink = 2.8, blinkUntil = 0;
  let pointerX = 0, pointerY = 0, yaw = -0.2, tilt = 0;
  let happyUntil = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true })!;

  function resolvedColor(selector: string) {
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = getComputedStyle(host.querySelector(selector)!).color;
    colorContext.fillRect(0, 0, 1, 1);
    const [r, g, b] = colorContext.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  }
  function rebuild() {
    const glow = resolvedColor("[data-glow]"), shell = resolvedColor("[data-shell]");
    const next = JSON.stringify(state.look) + glow.getHexString() + shell.getHexString();
    if (signature === next) return;
    if (model) { scene.remove(model.root); disposeModel(model.root); }
    model = buildCompanion(state.look, glow, shell);
    scene.add(model.root);
    signature = next;
  }

  function render(now = performance.now(), force = false) {
    if (disposed || lost || !visible || document.hidden) return;
    if (!force && now - lastFrame < 1000 / 30) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.08);
    lastFrame = now;
    if (!motion.matches) time += dt;
    const moving = !motion.matches;
    const t = moving ? time : 0;
    const mood = happyUntil > now && ["idle", "sleepy", "waiting", "happy"].includes(state.mood) ? "happy" : state.mood;
    const busy = mood === "thinking" || mood === "preparing";
    if (moving && t > nextBlink) { blinkUntil = t + 0.13; nextBlink = t + 3 + Math.random() * 4; }
    const blink = moving && t < blinkUntil;
    const lerp = moving ? 1 - Math.exp(-dt * 7) : 1;
    const looking = mood === "looking" ? Math.sin(t * 1.4) * 0.38 : 0;
    const targetYaw = yaw + (moving ? pointerX * 0.35 + looking : 0);
    model.body.rotation.y = THREE.MathUtils.lerp(model.body.rotation.y, targetYaw, lerp);
    model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, tilt + (moving ? pointerY * 0.12 : 0), lerp);
    model.body.rotation.z = mood === "concerned" ? -0.12 : mood === "waiting" ? 0.09 : Math.sin(t * 0.65) * 0.025;
    model.body.position.y = Math.sin(t * (mood === "sleepy" ? 0.8 : 1.6)) * 0.055 + (moving && mood === "happy" ? Math.abs(Math.sin(t * 5)) * 0.14 : 0);
    const level = Math.min(1, Math.max(0, Number.isFinite(state.level) ? state.level : 0));
    model.body.scale.setScalar(mood === "listening" ? 1 + level * 0.035 : 1);
    model.face.rotation.y = moving ? pointerX * 0.055 : 0;
    for (const [i, eye] of model.eyes.entries()) {
      eye.open.visible = mood !== "happy";
      eye.happy.visible = mood === "happy";
      const height = blink ? 0.1 : mood === "sleepy" ? 0.22 : mood === "preparing" ? 0.5 : mood === "waiting" && i === 0 ? 0.55 : mood === "listening" ? 1.2 + level * 0.3 : 1;
      eye.group.scale.y = height;
      eye.group.rotation.z = mood === "concerned" ? (i === 0 ? -0.35 : 0.35) : 0;
      eye.group.position.y = 0.04 + (busy ? 0.05 : 0) + (moving ? -pointerY * 0.035 : 0);
    }
    model.mouth.scale.x = mood === "happy" ? 1.5 : mood === "speaking" ? 1.2 : 1;
    // Talking: the mouth opens and closes in uneven syllables, kept centred
    // where it sits on the face (about y = -0.17).
    const talk = mood === "speaking" && moving ? 1 + Math.abs(Math.sin(t * 13)) * (1.4 + Math.sin(t * 3.7) * 0.8) : 1;
    model.mouth.scale.y = talk;
    model.mouth.position.y = -0.17 * (1 - talk);
    model.hat.rotation.z = state.look.accessory === "halo" ? Math.sin(t) * 0.06 : 0;
    model.held.visible = state.working || state.look.holding !== "none";
    model.prop.visible = !state.working;
    model.work.visible = state.working;
    model.held.rotation.z = 0.08 + Math.sin(t * 1.5) * 0.05;
    model.motes.rotation.y = t * 0.08;
    model.hologram.uniforms.time.value = t;
    model.pulse.visible = mood === "listening" || busy || mood === "waiting";
    model.pulse.scale.setScalar(mood === "listening" ? 1 + level * 0.28 : 1 + Math.sin(t * 2) * 0.035);
    model.base.rotation.y = busy ? -t * 1.5 : t * 0.12;
    renderer.render(scene, camera);
  }
  function schedule() {
    renderer.setAnimationLoop(!disposed && !lost && visible && !document.hidden && !motion.matches ? (now) => render(now) : null);
    render(performance.now(), true);
  }
  function resize() {
    const bounds = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
    schedule();
  }
  function move(e: PointerEvent) {
    if (!visible || document.hidden || motion.matches) return;
    const bounds = host.getBoundingClientRect();
    pointerX = THREE.MathUtils.clamp((e.clientX - bounds.left - bounds.width / 2) / (bounds.width * 2), -1, 1);
    pointerY = THREE.MathUtils.clamp((e.clientY - bounds.top - bounds.height / 2) / (bounds.height * 2), -1, 1);
  }
  function leave() { pointerX = 0; pointerY = 0; }
  function contextLost(event: Event) { event.preventDefault(); lost = true; availability(false); schedule(); }
  function contextRestored() { lost = false; availability(true); schedule(); }
  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
  const themeObserver = new MutationObserver(() => { rebuild(); schedule(); });
  rebuild();
  sizeObserver.observe(host);
  visibilityObserver.observe(host);
  for (let parent: HTMLElement | null = host; parent; parent = parent.parentElement) themeObserver.observe(parent, { attributes: true, attributeFilter: ["style", "class", "data-color-scheme"] });
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("blur", leave);
  document.addEventListener("pointerleave", leave);
  motion.addEventListener("change", schedule);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  resize();
  availability(true);

  return {
    update(next: SceneState) { state = next; rebuild(); schedule(); },
    greet() { happyUntil = performance.now() + 1600; schedule(); },
    turn(dx: number, dy = 0) { yaw += dx; tilt = THREE.MathUtils.clamp(tilt + dy, -0.4, 0.4); schedule(); },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      sizeObserver.disconnect(); visibilityObserver.disconnect(); themeObserver.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      document.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", schedule);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      disposeModel(model.root);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
