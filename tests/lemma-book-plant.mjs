// Run Vite on port 1427; inspect the real model at fixed animation times.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const preview = () => page.locator(".lemma-wardrobe-preview .lemma-face");
const choose = name => page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
await mkdir(".qa.local/lemma-book-plant", { recursive: true });
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  await page.clock.install({ time: new Date("2026-11-08T12:00:00Z") });
  for (const [item, milliseconds] of [["Book", 4000], ["Plant", 5500]]) {
    await choose(item); await choose("Preview item animation");
    await page.clock.fastForward(milliseconds); await page.clock.runFor(80);
    await preview().screenshot({ path: `.qa.local/lemma-book-plant/${item.toLowerCase()}.png` });
    await page.clock.fastForward(10000); await page.clock.runFor(80);
  }
  const samples = await page.evaluate(async () => {
    const { Box3, Color, Matrix4, Vector3 } = await import("/node_modules/three/build/three.module.js");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { performItem } = await import("/src/features/lemma/itemPerformance.ts");
    const results = [];
    for (const shape of ["orb", "prism", "pyramid", "drop"]) {
      for (const kind of ["book", "plant"]) {
        const model = buildCompanion({ ...STANDARD, shape, holding: kind }, new Color("#2ec4ff"), new Color("#444444"));
        const bounds = (group, local = false) => {
          model.root.updateMatrixWorld(true);
          const result = new Box3(), inverse = group.matrixWorld.clone().invert();
          group.traverseVisible(part => {
            if (!part.isMesh) return;
            part.geometry.computeBoundingBox();
            const transform = local ? new Matrix4().multiplyMatrices(inverse, part.matrixWorld) : part.matrixWorld;
            result.union(part.geometry.boundingBox.clone().applyMatrix4(transform));
          });
          return result;
        };
        performItem(model, null, 0);
        const closedWidth = bounds(model.prop, true).getSize(new Vector3()).x;
        const frames = [];
        for (const progress of kind === "book" ? [0.35, 0.5, 0.65, 0.75] : [0.4, 0.58, 0.72, 0.85]) {
          performItem(model, { kind, progress }, 0);
          const item = bounds(kind === "book" ? model.prop : model.sprout, kind === "book");
          frames.push({ progress, width: item.getSize(new Vector3()).x, upright: Math.abs(model.held.rotation.z) < 0.3, intersects: item.intersectsBox(bounds(model.body.children[0])) });
        }
        performItem(model, null, 0);
        const restored = Math.abs(bounds(model.prop, true).getSize(new Vector3()).x - closedWidth) < 1e-6 && model.held.position.equals(model.heldOrigin) && model.sprout.scale.y === 1 && !model.page.visible;
        results.push({ shape, kind, closedWidth, frames, restored });
        disposeModel(model.root);
      }
    }
    return results;
  });
  const failures = [];
  for (const sample of samples) {
    for (const frame of sample.frames) {
      if (sample.kind === "book") {
        if (frame.width < sample.closedWidth * 1.4) failures.push(`${sample.shape} book at ${frame.progress}: stays closed while reading`);
        if (!frame.upright) failures.push(`${sample.shape} book at ${frame.progress}: turns upside down`);
      } else if (frame.intersects) failures.push(`${sample.shape} plant at ${frame.progress}: grows into the body`);
    }
    if (!sample.restored) failures.push(`${sample.shape} ${sample.kind}: interruption does not restore its resting pose`);
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  console.log("PASS: books open throughout reading without flipping upside down; growing plants clear all four body shapes; interruption restores both props");
} finally { await browser.close(); }
