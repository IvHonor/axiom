import * as THREE from "three";
import { buildCompanion, disposeModel, type CompanionModel } from "./model";
import type { Look } from "./look";
import type { Mood } from "./Face";
import { expressionOf } from "./expressions";
import type { Personality } from "./persona";
import { createIdleDirector } from "./itemIdle";
import { performItem } from "./itemPerformance";
import { createCompanionMotion } from "./motion";

/**
 * `facing`: which way to turn, from -1 (left, up) to 1 (right, down); left out, he faces the viewer.
 * `gaze`: where his eyes go, likewise (the cursor, wherever it is); left out, they follow the mouse over him.
 * `display`: words in his face socket in place of his face (a timer counting), in `color` or his glow.
 */
export interface SceneState {
  look: Look;
  mood: Mood;
  level: number;
  working: boolean;
  brightness: number;
  movement: number;
  personality: Personality;
  focused: boolean;
  compact: boolean;
  admin: boolean;
  facing?: { x: number; y: number };
  gaze?: { x: number; y: number } | null;
  display?: { text: string; color?: string } | null;
}

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
  let painted = "";
  let visible = true, lost = false, disposed = false;
  let lastFrame = 0, time = 0, nextBlink = 2.8, blinkUntil = 0, sizeCheckedAt = 0;
  let pointerX = 0, pointerY = 0, yaw = 0, tilt = 0;
  let happyUntil = 0;
  let lastMood: Mood | null = null, moodStarted = 0;
  let nextIdle = 5 + Math.random() * 5, idleUntil = 0, idleX = 0, idleY = 0, idleTilt = 0;
  let pointerAt = -Infinity;
  let hovered = false, lastInteraction = performance.now(), awayAt: number | null = null;
  let notice: { x: number; y: number } | null = null;
  const presence = createCompanionMotion();
  const itemIdle = createIdleDirector();
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
  // A little screen in his face socket, for words in place of his face (a
  // timer counting): drawn on a canvas, and redrawn only when they change.
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 512;
  screenCanvas.height = 256;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.49), new THREE.MeshBasicMaterial({ map: screenTexture, transparent: true, depthWrite: false }));
  screen.position.z = 0.125;
  screen.visible = false;
  let screenColor = "#e8fbff";
  let drawn = "";
  function draw(text: string, color: string) {
    const ctx = screenCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, screenCanvas.width, screenCanvas.height);
    // As big as fits across the socket.
    ctx.font = "700 100px system-ui, sans-serif";
    const size = Math.min(150, (100 * screenCanvas.width * 0.86) / Math.max(1, ctx.measureText(text).width));
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillText(text, screenCanvas.width / 2, screenCanvas.height / 2 + size * 0.04);
    screenTexture.needsUpdate = true;
  }

  function rebuild() {
    const glow = resolvedColor("[data-glow]").multiplyScalar(state.brightness), shell = resolvedColor("[data-shell]");
    const { shape, accessory, facewear, neckwear, holding, finish, headwearColor, facewearColor, neckwearColor, jewelColor } = state.look;
    const next = JSON.stringify([shape, accessory, facewear, neckwear, holding, finish, state.admin, state.brightness, glow.getHexString(), shell.getHexString()]);
    const colours = JSON.stringify([headwearColor, facewearColor, neckwearColor, jewelColor]);
    if (signature === next) {
      if (painted !== colours) { model.updateColours(state.look, glow); painted = colours; }
      return;
    }
    if (model) { model.face.remove(screen); scene.remove(model.root); disposeModel(model.root); }
    model = buildCompanion(state.look, glow, shell, state.admin);
    model.face.add(screen);
    screenColor = `#${glow.clone().lerp(new THREE.Color("#ffffff"), 0.6).getHexString()}`;
    drawn = "";
    scene.add(model.root);
    signature = next;
    painted = colours;
  }

  function idleInput(now: number) {
    return { now: now / 1000, holding: state.look.holding, admin: state.admin,
      eligible: !motion.matches && !state.focused && !state.compact && !state.working && !state.display && !["thinking", "preparing", "looking", "listening", "speaking", "patient"].includes(state.mood) && state.movement > 0 && visible && !document.hidden && !lost };
  }

  function render(now = performance.now(), force = false) {
    if (disposed || lost || !visible || document.hidden) return;
    if (!force && now - lastFrame < 1000 / 30) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.08);
    lastFrame = now;
    // Now and then, check the drawing still matches its laid-out size: if
    // something left it squashed (sized mid-transform), it puts itself right.
    if (now - sizeCheckedAt > 1000) {
      sizeCheckedAt = now;
      const drawn = renderer.getSize(new THREE.Vector2());
      if (host.offsetWidth && host.offsetHeight && (Math.abs(drawn.x - host.offsetWidth) > 1 || Math.abs(drawn.y - host.offsetHeight) > 1)) {
        renderer.setSize(host.offsetWidth, host.offsetHeight, false);
      }
    }
    if (!motion.matches) time += dt;
    const moving = !motion.matches && state.movement > 0;
    const t = moving ? time : 0;
    const mood = happyUntil > now && ["idle", "sleepy", "waiting", "happy"].includes(state.mood) ? "happy" : state.mood;
    if (lastMood !== mood) { lastMood = mood; moodStarted = now; }
    const age = (now - moodStarted) / 1000;
    const idle = mood === "idle" && !state.focused && state.movement > 0;
    if (moving && idle && t >= nextIdle) {
      idleUntil = t + 0.8 + Math.random() * 1.3;
      nextIdle = idleUntil + 5 + Math.random() * 8;
      idleX = (Math.random() - 0.5) * 0.9;
      idleY = (Math.random() - 0.5) * 0.45;
      idleTilt = (Math.random() - 0.5) * 0.065;
    }
    const idleGlance = moving && idle && t < idleUntil && now - pointerAt > 1800;
    const routine = itemIdle.tick(idleInput(now));
    const routineName = routine?.kind ?? "";
    if (host.dataset.idleRoutine !== routineName) host.dataset.idleRoutine = routineName;
    const movement = state.movement * (state.focused ? 0.12 : 1);
    const busy = mood === "thinking" || mood === "preparing";
    if (moving && t > nextBlink) { blinkUntil = t + 0.13; nextBlink = t + 3 + Math.random() * 4; }
    const blink = moving && t < blinkUntil;
    const lerp = moving ? 1 - Math.exp(-dt * 7) : 1;
    const looking = mood === "looking" ? Math.sin(t * 1.4) * 0.38 : 0;
    // Turned (by dragging) from where he faces: his own way, or towards `facing`.
    const facing = state.facing;
    const base = yaw + (facing ? facing.x * 0.65 : 0);
    // His eyes (and a little of him) follow `gaze`, or else the mouse over him.
    const px = idleGlance ? idleX : state.gaze ? state.gaze.x : pointerX;
    const py = idleGlance ? idleY : state.gaze ? state.gaze.y : pointerY;
    const pose = presence.tick({ dt, now: now / 1000, mood, personality: state.personality, x: px, y: py,
      hovered, focused: state.focused, enabled: moving && !state.compact && !routine, movement: state.movement, notice });
    const greeting = pose.greeting ? "true" : "false";
    if (host.dataset.greeting !== greeting) host.dataset.greeting = greeting;
    const attentive = ["listening", "speaking", "acknowledged"].includes(mood);
    const targetYaw = (attentive ? base * 0.25 : base) + pose.bodyX * 0.30 + (moving ? looking * movement : 0);
    const nod = pose.nod;
    model.body.rotation.y = THREE.MathUtils.lerp(model.body.rotation.y, targetYaw, lerp);
    model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, tilt + nod - pose.lean + (facing ? facing.y * 0.18 : 0) + pose.bodyY * 0.12, lerp);
    const lean = mood === "concerned" ? -0.07 : mood === "puzzled" ? 0.13 : mood === "waiting" ? 0.07 : idleGlance ? idleTilt : Math.sin(t * 0.65) * 0.025 * movement;
    model.body.rotation.z = THREE.MathUtils.lerp(model.body.rotation.z, lean * (moving ? pose.energy : 0) + pose.tilt, lerp);
    model.body.position.y = (moving ? Math.sin(t * (mood === "sleepy" ? 0.8 : 1.6) * pose.speed) * 0.04 * movement : 0) + pose.bounce + (moving && !state.focused && mood === "happy" && age < 0.9 ? Math.sin(age / 0.9 * Math.PI) * 0.07 * state.movement : 0);
    model.body.position.z = pose.lean;
    const level = Math.min(1, Math.max(0, Number.isFinite(state.level) ? state.level : 0));
    model.body.scale.setScalar(mood === "listening" ? 1 + level * 0.035 : 1);
    model.face.rotation.y = pose.eyeX * 0.055;
    // Words in his face socket take the place of his face.
    const display = state.display;
    screen.visible = !!display;
    model.mouth.visible = !display;
    model.facewear.visible = !display;
    if (display && display.text + (display.color ?? "") !== drawn) {
      draw(display.text, display.color ?? screenColor);
      drawn = display.text + (display.color ?? "");
    }
    const action = performItem(model, routine, t);
    model.body.position.x += pose.shift;
    const normalExpression = expressionOf(mood, state.personality, state.compact);
    const expression = action ? { ...normalExpression, ...action } : normalExpression;
    model.face.scale.setScalar(state.compact ? 1.12 : 1);
    const fade = (part: THREE.Mesh<THREE.BufferGeometry, THREE.Material>, on: boolean) => {
      part.material.opacity = THREE.MathUtils.lerp(part.material.opacity, on ? 1 : 0, lerp);
      part.visible = part.material.opacity > 0.002;
    };
    for (const [i, eye] of model.eyes.entries()) {
      const smilingEyes = action?.happy ?? mood === "happy";
      fade(eye.open, !smilingEyes);
      fade(eye.happy, smilingEyes);
      const closed = blink || !!action?.closed;
      const height = closed ? 0.08 : expression.eyes[i] + (mood === "listening" ? level * 0.2 : 0);
      eye.group.scale.y = THREE.MathUtils.lerp(eye.group.scale.y, height, closed ? 1 : lerp);
      eye.group.rotation.z = THREE.MathUtils.lerp(eye.group.rotation.z, mood === "concerned" ? (i === 0 ? -0.25 : 0.25) : 0, lerp);
      const eyeLerp = moving ? 1 - Math.exp(-dt * 18 * pose.speed) : 1;
      eye.group.position.x = THREE.MathUtils.lerp(eye.group.position.x, (i === 0 ? -0.22 : 0.22) + expression.gaze[0] + (facing ? facing.x * 0.03 : 0) + pose.eyeX * 0.055, eyeLerp);
      eye.group.position.y = THREE.MathUtils.lerp(eye.group.position.y, 0.04 + expression.gaze[1] - pose.eyeY * 0.055, eyeLerp);
      eye.group.visible = !display;
      eye.brow.visible = !display;
      eye.brow.rotation.z = THREE.MathUtils.lerp(eye.brow.rotation.z, expression.brows[i], lerp);
      eye.brow.position.y = THREE.MathUtils.lerp(eye.brow.position.y, expression.browY[i], lerp);
    }
    for (const [name, part] of Object.entries(model.mouths)) fade(part, name === expression.mouth);
    model.mouth.scale.x = THREE.MathUtils.lerp(model.mouth.scale.x, mood === "happy" ? 1.5 : mood === "speaking" ? 1.2 : state.personality === "cheerful" && mood === "idle" ? 1.3 : 1, lerp);
    const talk = mood === "speaking" && moving ? 0.45 + Math.abs(Math.sin(t * 13)) * (0.8 + Math.sin(t * 3.7) * 0.3) : mood === "listening" ? 0.6 : 1;
    model.mouth.scale.y = THREE.MathUtils.lerp(model.mouth.scale.y, talk, lerp);
    model.mouth.position.x = THREE.MathUtils.lerp(model.mouth.position.x, mood === "thinking" ? -0.045 : 0, lerp);
    model.hat.rotation.z = pose.sway * 0.65 + (moving && state.look.accessory === "halo" ? Math.sin(t * 0.8) * 0.04 * movement : 0);
    model.hat.position.y += pose.accessoryLift + Math.abs(pose.sway) * 0.10;
    model.neckwear.rotation.z = pose.sway * 0.8 + pose.accessoryLift * 1.5;
    model.held.visible = state.working || state.look.holding !== "none";
    model.prop.visible = !state.working;
    model.work.visible = state.working;
    if (!routine) {
      model.held.rotation.z = 0.08 + pose.sway * 1.2 + (moving ? Math.sin(t * 1.5) * 0.025 * movement : 0);
      model.held.rotation.y += pose.sway * 1.8;
      if (state.look.holding === "coffee") {
        model.held.rotation.x -= model.body.rotation.x * 0.7;
        model.held.rotation.z -= model.body.rotation.z * 0.7;
      }
      if (state.look.holding === "book") model.held.rotation.z += pose.sway;
      if (state.look.holding === "plant") model.sprout.rotation.z += pose.sway * 2 + pose.accessoryLift;
    }
    model.motes.rotation.y = t * 0.08 * movement;
    model.hologram.uniforms.time.value = t;
    model.pulse.visible = mood === "listening" || busy || mood === "waiting";
    model.pulse.scale.setScalar(mood === "listening" ? 1 + level * 0.28 : 1 + Math.sin(t * 2) * 0.035);
    model.base.rotation.y = (busy ? -t * 1.5 : t * 0.12) * (state.focused ? 0.12 : 1);
    renderer.render(scene, camera);
  }
  function schedule() {
    if (document.hidden || !visible || motion.matches || lost) itemIdle.reset();
    renderer.setAnimationLoop(!disposed && !lost && visible && !document.hidden && !motion.matches ? (now) => render(now) : null);
    render(performance.now(), true);
  }
  function resize() {
    // Its laid-out size, not what's on screen: a transform on the way (a
    // squash as it fades in, a breath, a lean) mustn't set the drawing's
    // resolution, or it stays squashed and blurry once the transform's gone.
    const width = host.offsetWidth || host.getBoundingClientRect().width;
    const height = host.offsetHeight || host.getBoundingClientRect().height;
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    schedule();
  }
  function move(e: PointerEvent) {
    interact();
    if (!visible || document.hidden || motion.matches) return;
    pointerAt = performance.now();
    const bounds = host.getBoundingClientRect();
    hovered = e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom;
    pointerX = THREE.MathUtils.clamp((e.clientX - bounds.left - bounds.width / 2) / (bounds.width * 2), -1, 1);
    pointerY = THREE.MathUtils.clamp((e.clientY - bounds.top - bounds.height / 2) / (bounds.height * 2), -1, 1);
  }
  function interact() {
    const now = performance.now();
    if (now - lastInteraction >= 60_000) presence.greet(now / 1000);
    lastInteraction = now;
  }
  function leave() { hovered = false; pointerX = 0; pointerY = 0; }
  function interrupt(event: Event) {
    interact();
    if (event instanceof KeyboardEvent && ["Enter", " "].includes(event.key) && event.target instanceof Node && host.contains(event.target)) return;
    itemIdle.interrupt(); render(performance.now(), true);
  }
  function away() { if (awayAt === null) awayAt = performance.now(); itemIdle.reset(); leave(); }
  function returned() {
    const now = performance.now();
    if (awayAt !== null && now - awayAt >= 30_000) presence.greet(now / 1000);
    awayAt = null; lastInteraction = now; schedule();
  }
  function visibilityChanged() { if (document.hidden) { away(); schedule(); } else returned(); }
  const panelSelector = '[role="dialog"], [role="menu"], [role="listbox"], [role="alert"], [popover], .lemma-bubble';
  function noticePanels() {
    notice = null;
    const bounds = host.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2;
    let closest = Infinity;
    for (const panel of document.querySelectorAll<HTMLElement>(panelSelector)) {
      if (panel.contains(host) || host.contains(panel)) continue;
      const box = panel.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const x = box.left + box.width / 2 - cx, y = box.top + box.height / 2 - cy;
      const distance = Math.hypot(Math.max(box.left - bounds.right, bounds.left - box.right, 0), Math.max(box.top - bounds.bottom, bounds.top - box.bottom, 0));
      if (distance < 180 && distance < closest) {
        closest = distance;
        notice = { x: THREE.MathUtils.clamp(x / Math.max(bounds.width, 1), -1, 1), y: THREE.MathUtils.clamp(y / Math.max(bounds.height, 1), -1, 1) };
      }
    }
  }
  const panelObserver = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(panelSelector) || node.querySelector(panelSelector))))) noticePanels();
  });
  function contextLost(event: Event) { event.preventDefault(); lost = true; availability(false); schedule(); }
  function contextRestored() { lost = false; availability(true); schedule(); }
  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
  const themeObserver = new MutationObserver(() => { rebuild(); schedule(); });
  rebuild();
  sizeObserver.observe(host);
  visibilityObserver.observe(host);
  for (let parent: HTMLElement | null = host; parent; parent = parent.parentElement) themeObserver.observe(parent, { attributes: true, attributeFilter: ["style", "class", "data-color-scheme"] });
  panelObserver.observe(document.body, { childList: true, subtree: true });
  noticePanels();
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("blur", away);
  window.addEventListener("focus", returned);
  window.addEventListener("pointerdown", interrupt);
  window.addEventListener("keydown", interrupt);
  document.addEventListener("pointerleave", leave);
  motion.addEventListener("change", schedule);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  resize();
  availability(true);

  return {
    update(next: SceneState) {
      if (next.look !== state.look || next.admin !== state.admin) itemIdle.reset();
      state = next; rebuild(); schedule();
    },
    previewIdle() { const started = itemIdle.preview(idleInput(performance.now())); schedule(); return started; },
    greet() {
      const now = performance.now();
      const started = itemIdle.preview(idleInput(now));
      happyUntil = started ? 0 : now + 1600;
      presence.tap(now / 1000); schedule();
    },
    turn(dx: number, dy = 0) { itemIdle.interrupt(); yaw += dx; tilt = THREE.MathUtils.clamp(tilt + dy, -0.4, 0.4); schedule(); },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      sizeObserver.disconnect(); visibilityObserver.disconnect(); themeObserver.disconnect(); panelObserver.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", returned);
      window.removeEventListener("pointerdown", interrupt);
      window.removeEventListener("keydown", interrupt);
      document.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", schedule);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      disposeModel(model.root);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
