// The Inkwell rewards: every item on every body, The Muse, and The Last Word
// frame by frame and live. Run Vite on port 1427.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const dialog = page.getByRole("dialog");
const choice = name => dialog.getByRole("button", { name, exact: true });
const preview = page.locator(".lemma-wardrobe-preview .lemma-face");
const shots = ".qa.local/lemma-inkwell";
const settled = () => page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.renderer === "3d");
await mkdir(shots, { recursive: true });
try {
  // Locked for a regular account, with the Journal named on the card.
  await page.goto("http://localhost:1427/tests/lemma-preview.html");
  await settled();
  for (const item of ["Ribbon", "Scribe's cap", "Living ink", "Mood ink", "The Last Word"]) assert.equal(await choice(item).getAttribute("data-locked"), "true", `${item} starts locked`);
  await choice("The Last Word").hover();
  const card = await page.getByRole("tooltip").innerText();
  for (const part of [/The Last Word/, /Ink Streak/, /Write 45 days in a row/, /Journal/]) assert.match(card, part);

  // Everything on, on every body (admins have the whole wardrobe).
  await page.goto("http://localhost:1427/tests/lemma-preview.html?admin");
  await settled();
  for (const item of ["Ribbon", "Scribe's cap", "Living ink", "Mood ink", "The Last Word"]) await choice(item).click();
  assert.deepEqual(await preview.evaluate(n => [n.dataset.headwear, n.dataset.neckwear, n.dataset.finish, n.dataset.holding, n.dataset.glowEffect]), ["scribe-cap", "ribbon-bookmark", "living-ink", "last-word", "mood-ink"]);
  for (const shape of ["Orb", "Prism", "Pyramid", "Drop"]) {
    await choice(shape).click();
    await settled();
    await page.waitForTimeout(250);
    await preview.screenshot({ path: `${shots}/${shape.toLowerCase()}.png` });
  }
  await choice("Orb").click();

  const frames = await page.evaluate(async () => {
    const { Color, Box3 } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { performItem } = await import("/src/features/lemma/itemPerformance.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const results = [];
    for (const shape of ["orb", "prism", "pyramid", "drop"]) for (const finish of ["hologram", "living-ink", "skeleton"]) {
      const look = { ...STANDARD, shape, finish, holding: "last-word", accessory: "scribe-cap", neckwear: "ribbon-bookmark" };
      const model = buildCompanion(look, new Color("#2ec4ff"), new Color("#444444"));
      const plain = buildCompanion({ ...look, holding: "none" }, new Color("#2ec4ff"), new Color("#444444"));
      const tall = root => { const box = new Box3().setFromObject(root); return box.max.y - box.min.y; };
      const at = progress => performItem(model, { kind: "last-word", progress }, 3);
      const shell = model.shellParts[0].object, ink = model.ink;
      performItem(model, null, 3);
      const rest = ink.quill.position.clone();
      const out = { shape, finish, restTall: tall(model.root) / tall(plain.root) };
      if (finish === "living-ink") {
        // Clear glass over ink that's only part-way up, and sloshes when the body turns.
        const { uniforms } = model.globe.material;
        out.glass = model.casing.transparent && model.casing.opacity < 0.3;
        out.partFull = uniforms.level.value < 0.5 && uniforms.rise.value === 0;
        model.globe.tick(1 / 30, 1, 0, 0);
        for (let i = 1; i <= 6; i++) model.globe.tick(1 / 30, 1 + i / 30, i * 0.05, 0);
        out.sloshed = Math.abs(uniforms.tiltX.value) > 0.01;
        for (let i = 0; i < 400; i++) model.globe.tick(1 / 30, 3 + i / 30, 0.3, 0);
        out.settled = Math.abs(uniforms.tiltX.value) < 0.01;
        at(0.36); out.rising = uniforms.rise.value > 0.2 && !ink.flood.visible;
        at(0.6); out.full = uniforms.rise.value === 1;
        performItem(model, null, 3); out.drained = uniforms.rise.value === 0;
      }
      at(0.25); out.drop = ink.drop.visible; out.quillUp = ink.quill.position.y > rest.y + 0.3;
      at(0.36); out.flooding = model.globe ? model.globe.material.uniforms.rise.value > 0 : ink.flood.visible && ink.floodMaterial.uniforms.level.value < 1.2 && ink.floodMaterial.uniforms.level.value > -1.2;
      at(0.6); out.sunk = shell.scale.y < 0.2 * model.shellParts[0].scale.y; out.pool = ink.pool.scale.x > 1; out.eyesLow = model.face.position.y < -0.7; out.hatGone = model.hat.scale.x < 0.01;
      at(0.75); out.writing = ink.written.visible && ink.written.geometry.drawRange.count > 0 && ink.written.geometry.drawRange.count < ink.writtenLength; out.nibOnLine = Math.abs(ink.quill.position.z - 0.98) < 0.01;
      at(0.92); out.flourish = ink.flourish.visible;
      performItem(model, null, 3);
      out.restored = !ink.flood.visible && !ink.written.visible && ink.pool.scale.x === 0 && shell.scale.equals(model.shellParts[0].scale) && model.face.position.equals(model.faceOrigin) && model.hat.scale.equals(model.hatScale) && ink.quill.position.distanceTo(rest) < 1e-9;
      results.push(out);
      disposeModel(model.root); disposeModel(plain.root);
    }
    return results;
  });
  for (const f of frames) {
    const name = `${f.shape}/${f.finish}`;
    assert.ok(f.restTall < 1.5, `${name}: hidden parts don't change Lemma's size`);
    if (f.finish === "living-ink") {
      assert.ok(f.glass && f.partFull, `${name}: clear glass, part-filled with ink`);
      assert.ok(f.sloshed && f.settled, `${name}: the ink sloshes when turned, then settles`);
      assert.ok(f.rising && f.full && f.drained, `${name}: The Last Word fills the globe from inside`);
    }
    assert.ok(f.drop && f.quillUp, `${name}: the quill rises and a drop falls`);
    assert.ok(f.flooding, `${name}: ink runs over the shell`);
    assert.ok(f.sunk && f.pool && f.eyesLow && f.hatGone, `${name}: Lemma sinks into the pool, eyes last`);
    assert.ok(f.writing && f.nibOnLine, `${name}: the quill writes the outline`);
    assert.ok(f.flourish, `${name}: it ends with a flourish`);
    assert.ok(f.restored, `${name}: everything is back afterwards`);
  }

  // Dragging really moves the ink: the picture changes while the body turns.
  const box = await preview.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, { steps: 5 });
  await page.waitForTimeout(120);
  await preview.screenshot({ path: `${shots}/globe-slosh.png` });
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1200);
  await preview.screenshot({ path: `${shots}/globe-settled.png` });

  // The real animation.
  await choice("Preview item animation").click();
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine === "last-word");
  const started = Date.now();
  for (const [at, name] of [[2.7, "1-drop"], [4.2, "2-flood"], [6.3, "3-pool"], [8.2, "4-writing"], [9.7, "5-flourish"]]) {
    await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - started)));
    assert.equal(await preview.getAttribute("data-idle-routine"), "last-word");
    await preview.screenshot({ path: `${shots}/word-${name}.png` });
  }
  await page.waitForFunction(() => !document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine, null, { timeout: 8000 });

  // The Muse.
  await dialog.getByRole("tab", { name: "Personality", exact: true }).click();
  await dialog.getByRole("button", { name: /^The Muse/ }).click();
  assert.equal(await preview.getAttribute("data-personality"), "muse");
  assert.match(await page.locator(".lemma-personality-sample").innerText(), /quietly asking/);

  // The pictures on the achievement cards.
  const pictures = await page.evaluate(async () => {
    const { rewardPreviews } = await import("/src/features/lemma/rewardPreview.ts");
    return rewardPreviews(["ribbon-bookmark", "muse", "scribe-cap", "mood-ink", "living-ink", "last-word"]);
  });
  assert.equal(Object.keys(pictures).length, 6);
  for (const [id, url] of Object.entries(pictures)) await writeFile(`${shots}/reward-${id}.png`, Buffer.from(url.split(",")[1], "base64"));
  assert.deepEqual(errors, []);
  console.log("PASS: locked with their Journal details, every item on every body, The Last Word frame by frame and live, The Muse and the reward pictures");
} finally { await browser.close(); }
