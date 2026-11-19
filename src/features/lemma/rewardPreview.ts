// Little pictures of the rewards: each item drawn once from its real 3D model,
// on its own, and kept as an image. One short-lived renderer does them all, so a
// page of achievements doesn't cost a live 3D view per card.
import * as THREE from "three";
import type { RewardId } from "./achievements/catalog";
import { performItem } from "./itemPerformance";
import { EVERYDAY_FACEWEAR, EVERYDAY_HEADWEAR, EVERYDAY_NECKWEAR, STANDARD, type Look } from "./look";
import { buildCompanion, disposeModel, type CompanionModel } from "./model";

const SIZE = 168;
const FULL_BODY = { center: new THREE.Vector3(0, 0, 0), radius: 1 };

/** What to dress Lemma in, which part to show, and (if not that part's own bounds) how to frame it. */
type Item = { look: Partial<Look>; part: (m: CompanionModel) => THREE.Object3D | THREE.Object3D[]; frame?: { center: THREE.Vector3; radius: number } };
const itemsFor = <K extends string>(ids: readonly K[], item: (id: K) => Item) => Object.fromEntries(ids.map(id => [id, item(id)])) as Record<K, Item>;
const ITEMS: Record<RewardId, Item> = {
  tie: { look: { neckwear: "tie" }, part: m => m.neckwear },
  fedora: { look: { accessory: "fedora" }, part: m => m.hat },
  "cog-bolo": { look: { neckwear: "cog-bolo" }, part: m => m.neckwear },
  "gearwright-hat": { look: { accessory: "gearwright-hat" }, part: m => m.hat },
  loupe: { look: { facewear: "loupe" }, part: m => m.facewear },
  "long-hour": { look: { holding: "long-hour" }, part: m => m.prop },
  skeleton: { look: { finish: "skeleton" }, part: m => m.body, frame: FULL_BODY },
  verdigris: { look: { glowEffect: "verdigris" }, part: m => m.glowEffect.group, frame: { center: new THREE.Vector3(0, 0, 0), radius: 1.42 } },
  automaton: { look: {}, part: m => m.face },
  "ribbon-bookmark": { look: { neckwear: "ribbon-bookmark" }, part: m => m.neckwear },
  "scribe-cap": { look: { accessory: "scribe-cap" }, part: m => m.hat },
  "last-word": { look: { holding: "last-word" }, part: m => [m.prop, m.ink!.quill] },
  "living-ink": { look: { finish: "living-ink" }, part: m => m.body, frame: FULL_BODY },
  "mood-ink": { look: { glowEffect: "mood-ink" }, part: m => m.glowEffect.group, frame: { center: new THREE.Vector3(0, 0, 0), radius: 1.42 } },
  muse: { look: {}, part: m => m.face },
  "griffin-goggles": { look: { facewear: "griffin-goggles" }, part: m => m.facewear },
  "three-realms": { look: { facewear: "three-realms" }, part: m => m.facewear },
  jekyll: { look: {}, part: m => m.face },
  deerstalker: { look: { accessory: "deerstalker" }, part: m => m.hat },
  "counts-collar": { look: { neckwear: "counts-collar" }, part: m => m.neckwear },
  "dragon-helm": { look: { accessory: "dragon-helm" }, part: m => m.hat },
  "pack-of-cards": { look: { glowEffect: "pack-of-cards" }, part: m => m.glowEffect.group, frame: { center: new THREE.Vector3(0, 0, 0), radius: 1.42 } },
  voyage: { look: { finish: "voyage" }, part: m => m.body, frame: FULL_BODY },
  "gyges-ring": { look: { holding: "gyges-ring" }, part: m => [m.prop, m.gyges!.ring] },
  "true-compass": { look: { holding: "true-compass" }, part: m => m.compass!.compass },
  ...itemsFor(EVERYDAY_HEADWEAR, id => ({ look: { accessory: id }, part: m => m.hat })),
  ...itemsFor(EVERYDAY_NECKWEAR, id => ({ look: { neckwear: id }, part: m => m.neckwear })),
  ...itemsFor(EVERYDAY_FACEWEAR, id => ({ look: { facewear: id }, part: m => m.facewear })),
};

const pictures = new Map<RewardId, string>();

function draw(renderer: THREE.WebGLRenderer, id: RewardId) {
  const item = ITEMS[id];
  const model = buildCompanion({ ...STANDARD, ...item.look }, new THREE.Color("#2ec4ff"), new THREE.Color("#3c4250"));
  performItem(model, null, 0);
  model.glowEffect.update(3);
  // Its flakes and cogs are tiny at this size, so they're drawn larger here.
  model.tickers.forEach(tick => tick(3, 1));
  if (id === "verdigris" || id === "mood-ink") model.glowEffect.group.children.forEach(piece => piece.scale.multiplyScalar(2.8));
  if (id === "pack-of-cards") model.glowEffect.group.children.forEach(piece => piece.scale.multiplyScalar(1.9));
  if (id === "voyage") model.face.visible = false;
  if (id === "jekyll") {
    // One eye narrowed, one brow up: not quite the same person.
    model.eyes[1].group.scale.y = 0.62;
    model.eyes[1].brow.rotation.z = 0.34;
  }
  if (id === "muse") {
    // Its contented, closed-eyed look.
    for (const eye of model.eyes) {
      eye.open.visible = false;
      eye.happy.visible = true;
      (eye.happy.material as THREE.Material).opacity = 1;
    }
  }
  if (model.watch) model.watch.lid.rotation.y = Math.PI * 0.84;
  if (id === "automaton") {
    // Its level, unsmiling face.
    for (const [name, mouth] of Object.entries(model.mouths)) {
      mouth.visible = name === "flat";
      (mouth.material as THREE.Material).opacity = name === "flat" ? 1 : 0;
    }
  }
  const scene = new THREE.Scene();
  scene.add(model.root);
  const lights = [new THREE.HemisphereLight("#e8f6ff", "#3a4a5c", 2.6), new THREE.DirectionalLight("#ffffff", 3.2), new THREE.DirectionalLight("#9fdcff", 1.2)];
  lights[1].position.set(-3, 4, 5);
  lights[2].position.set(3, 1, -2);
  scene.add(...lights);
  // Only the part being shown is on the layer the camera sees.
  const parts = [item.part(model)].flat();
  parts.forEach(part => part.traverse(object => object.layers.enable(1)));
  lights.forEach(light => light.layers.enable(1));
  model.root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  parts.forEach(part => bounds.expandByObject(part));
  const sphere = item.frame ? new THREE.Sphere(item.frame.center, item.frame.radius) : bounds.getBoundingSphere(new THREE.Sphere());
  const reach = sphere.radius * 1.04;
  const camera = new THREE.OrthographicCamera(-reach, reach, reach, -reach, 0.1, 40);
  camera.position.copy(sphere.center).add(new THREE.Vector3(0.12, 0.16, 1).normalize().multiplyScalar(12));
  camera.lookAt(sphere.center);
  camera.layers.set(1);
  renderer.render(scene, camera);
  pictures.set(id, renderer.domElement.toDataURL("image/png"));
  disposeModel(model.root);
}

let queue: Promise<unknown> = Promise.resolve();

/** Pictures of these rewards. Without 3D graphics there are none, and the caller shows icons instead. */
export function rewardPreviews(ids: RewardId[]): Promise<Partial<Record<RewardId, string>>> {
  const result = queue.then(() => {
    const missing = ids.filter(id => !pictures.has(id));
    if (missing.length) {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      try {
        renderer.setPixelRatio(1);
        renderer.setSize(SIZE, SIZE, false);
        renderer.setClearColor(0, 0);
        missing.forEach(id => draw(renderer, id));
      } finally {
        renderer.dispose();
        renderer.forceContextLoss();
      }
    }
    return Object.fromEntries(ids.flatMap(id => pictures.has(id) ? [[id, pictures.get(id)!]] : []));
  });
  queue = result.catch(() => {});
  return result;
}
