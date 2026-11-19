// The Great Library: Reading's rewards on every body, the storm in the globe, the
// two held items frame by frame, and The Interview. Run Vite on port 1427.
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
const shots = ".qa.local/lemma-great-library";
const settled = () => page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.renderer === "3d");
const ITEMS = ["Griffin's goggles", "Three Realms", "Deerstalker", "Dragon helm", "Count's collar", "Voyage of Odysseus", "Pack of cards", "Ring of Gyges"];
await mkdir(shots, { recursive: true });
try {
  // Locked for a regular account, each naming its achievement and its book. The compass isn't even listed.
  await page.goto("http://localhost:1427/tests/lemma-preview.html");
  await settled();
  for (const item of ITEMS) assert.equal(await choice(item).getAttribute("data-locked"), "true", `${item} starts locked`);
  assert.equal(await choice("True Compass").count(), 0, "the secret item stays secret");
  await choice("Ring of Gyges").hover();
  const card = await page.getByRole("tooltip").innerText();
  for (const part of [/The Ring of Gyges/, /Bookworm/, /Plato's Republic/, /12 weeks/, /Reading/]) assert.match(card, part);

  // Everything on, on every body (admins have the whole wardrobe).
  await page.goto("http://localhost:1427/tests/lemma-preview.html?admin");
  await settled();
  for (const [hat, face, shape] of [["Deerstalker", "Griffin's goggles", "Orb"], ["Dragon helm", "Three Realms", "Prism"], ["Deerstalker", "Three Realms", "Pyramid"], ["Dragon helm", "Griffin's goggles", "Drop"]]) {
    for (const item of [hat, face, "Count's collar", "Voyage of Odysseus", "Pack of cards", "Ring of Gyges", shape]) await choice(item).click();
    await settled();
    await page.waitForTimeout(350);
    await preview.screenshot({ path: `${shots}/${shape.toLowerCase()}.png` });
  }
  await choice("Orb").click();
  assert.deepEqual(await preview.evaluate(n => [n.dataset.finish, n.dataset.neckwear, n.dataset.holding, n.dataset.glowEffect]), ["voyage", "counts-collar", "gyges-ring", "pack-of-cards"]);

  const frames = await page.evaluate(async () => {
    const { Color, Box3 } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { performItem } = await import("/src/features/lemma/itemPerformance.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const results = [];
    const tall = root => { const box = new Box3().setFromObject(root); return box.max.y - box.min.y; };
    const build = look => buildCompanion(look, new Color("#2ec4ff"), new Color("#444444"));
    for (const shape of ["orb", "prism", "pyramid", "drop"]) {
      const out = { shape };
      // The storm: the ship rides the waves, and lightning comes and goes.
      const stormy = build({ ...STANDARD, shape, finish: "voyage" });
      out.clearGlass = stormy.casing.transparent && stormy.casing.opacity < 0.3;
      const standard = build({ ...STANDARD, shape });
      out.fullFace = stormy.face.scale.equals(standard.face.scale) && stormy.lensScale.equals(standard.lensScale) && stormy.faceOrigin.equals(standard.faceOrigin)
        && stormy.lens.material.opacity === standard.lens.material.opacity && stormy.lens.material.color.equals(standard.lens.material.color) && stormy.lens.renderOrder === standard.lens.renderOrder;
      disposeModel(standard.root);
      // One sea all the way round, so no separate sheets of water show from the side.
      out.seaPieces = stormy.voyage.group.children.filter(c => c.isMesh && c.geometry.getAttribute("aOut")).length;
      const ship = stormy.voyage.group.children.find(c => c.isGroup);
      stormy.voyage.tick(1, 0); const a = ship.position.clone(), tilt = ship.rotation.z;
      stormy.voyage.tick(4, 0); out.sails = a.distanceTo(ship.position) > 0.01 && tilt !== ship.rotation.z;
      const bolts = () => stormy.voyage.group.children.filter(c => c.isMesh && c.geometry.type === "TubeGeometry" && c.visible).length;
      stormy.voyage.tick(6.55, 0); out.strike = bolts();
      stormy.voyage.tick(9, 0); out.calm = bolts();
      disposeModel(stormy.root);

      // The ring: Lemma turns to dust, and what it's wearing carries on without it.
      const look = { ...STANDARD, shape, finish: "hologram", accessory: "deerstalker", neckwear: "counts-collar" };
      const ringed = build({ ...look, holding: "gyges-ring" }), g = ringed.gyges;
      const plain = build({ ...look, holding: "none" });
      out.ringSize = tall(ringed.root) / tall(plain.root);
      const ringAt = progress => performItem(ringed, { kind: "gyges-ring", progress }, 3);
      performItem(ringed, null, 3);
      const opacity = ringed.casing.opacity, ringRest = g.ring.position.clone();
      ringAt(0.13); out.ringRises = g.ring.position.y > ringRest.y + 0.1 && g.ring.scale.x > 1.3;
      ringAt(0.235); out.stoneTurned = Math.abs(g.bezel.rotation.z - Math.PI) < 0.01 && g.stoneMaterial.emissiveIntensity > 3;
      ringAt(0.34); out.dusting = g.realm.visible && g.dustMaterial.uniforms.amount.value > 0.2;
      const away = ringAt(0.55);
      out.vanished = ringed.casing.opacity < 0.001 && ringed.lens.scale.x < 0.01 && !ringed.mouth.visible && !ringed.palm.visible && away.hidden === true;
      out.clothesStay = ringed.hat.scale.equals(ringed.hatScale) && ringed.neckwear.scale.x === 1 && ringed.hat.rotation.x > 0.3;
      ringAt(0.86); out.rush = g.shock.visible;
      performItem(ringed, null, 3);
      out.ringBack = !g.realm.visible && ringed.casing.opacity === opacity && ringed.mouth.visible && ringed.palm.visible && ringed.hat.rotation.x === 0 && ringed.face.rotation.x === 0 && g.ring.position.distanceTo(ringRest) < 0.03;
      disposeModel(ringed.root); disposeModel(plain.root);
      // With nothing on, its eyes are left.
      const bare = build({ ...STANDARD, shape, holding: "gyges-ring" });
      out.bareEyes = !performItem(bare, { kind: "gyges-ring", progress: 0.55 }, 3).hidden;
      disposeModel(bare.root);

      // The compass: a real box compass, and Lemma dragged under and lifted back.
      const held = build({ ...look, holding: "true-compass" }), c = held.compass;
      const compassAt = progress => performItem(held, { kind: "true-compass", progress }, 3);
      const shell = held.shellParts[0];
      performItem(held, null, 3);
      out.compassRest = !c.shadow.visible && !c.beam.visible && !c.under.visible && !c.veil.visible && c.lid.rotation.x < -1.5 && c.horns[0].scale.x < 0.01;
      compassAt(0.14); out.pool = c.under.visible && c.poolMaterial.uniforms.spread.value > 0.3;
      compassAt(0.3); out.hands = c.tendrils.some(t => t.geometry.drawRange.count > 0) && c.shadowMaterial.opacity > 0.8 && c.part.spin !== 0;
      compassAt(0.41); out.turned = c.veilMaterial.uniforms.dark.value > 0.99 && c.horns[0].scale.x > 0.9 && held.eyes[0].open.material.color.r > 0.9 && held.eyes[0].open.material.color.b < 0.3;
      compassAt(0.58); out.under = shell.object.scale.y < 0.1 * shell.scale.y && !held.face.visible;
      compassAt(0.64); out.broken = c.part.held && c.part.spin === 0 && c.beam.visible;
      compassAt(0.76); out.lifted = c.veilMaterial.uniforms.gold.value > 0.5 && c.columnMaterial.uniforms.strength.value > 0.9 && c.shards.some(s => s.visible);
      compassAt(0.86); out.golden = shell.object.scale.y === shell.scale.y && c.veilMaterial.uniforms.gold.value > 0.9 && held.face.visible;
      compassAt(0.955); out.lidShut = c.lid.rotation.x > -0.1;
      performItem(held, null, 3);
      out.compassBack = !c.shadow.visible && !c.beam.visible && !c.under.visible && !c.veil.visible && !c.part.held && c.part.spin === 0 && shell.object.scale.equals(shell.scale) && held.face.position.equals(held.faceOrigin) && held.eyes[0].open.material.color.equals(c.part.faceColour);

      // The needle wanders, then settles and turns gold once there's progress.
      c.part.steady = false;
      for (let i = 0; i < 90; i++) c.tick(i / 30, 1 / 30);
      const wander = c.needle.rotation.z; c.tick(7, 1 / 30);
      out.wanders = Math.abs(wander - c.needle.rotation.z) > 0.02;
      c.part.steady = true;
      for (let i = 0; i < 240; i++) c.tick(8 + i / 30, 1 / 30);
      out.locked = Math.abs(c.needle.rotation.z) < 0.01 && c.north.color.g > 0.4;
      disposeModel(held.root);
      results.push(out);
    }
    return results;
  });
  for (const f of frames) {
    const name = f.shape;
    assert.ok(f.clearGlass, `${name}: the storm is seen through clear glass`);
    assert.ok(f.fullFace, `${name}: Lemma's face is exactly as on any other material`);
    assert.equal(f.seaPieces, 1, `${name}: the sea is one continuous surface`);
    assert.ok(f.sails, `${name}: the ship moves and pitches`);
    assert.equal(f.strike, 1, `${name}: lightning strikes`);
    assert.equal(f.calm, 0, `${name}: and passes`);
    assert.ok(f.ringSize < 1.5, `${name}: hidden parts don't change Lemma's size`);
    for (const key of ["ringRises", "stoneTurned", "dusting", "vanished", "clothesStay", "rush", "ringBack", "bareEyes"]) assert.ok(f[key], `${name}: ring ${key}`);
    for (const key of ["compassRest", "pool", "hands", "turned", "under", "broken", "lifted", "golden", "lidShut", "compassBack", "wanders", "locked"]) assert.ok(f[key], `${name}: compass ${key}`);
  }

  // Both animations for real.
  for (const [item, routine, moments] of [["Ring of Gyges", "gyges-ring", [[1.7, "1-rise"], [2.9, "2-turn"], [4.4, "3-dust"], [6.6, "4-clothes"], [10.2, "5-return"], [11.2, "6-smug"]]], ["True Compass", "true-compass", [[2.3, "1-pool"], [4, "2-hands"], [5.7, "3-turned"], [7.6, "4-under"], [9, "5-beam"], [10.6, "6-rising"], [12, "7-golden"]]]]) {
    await choice(item).click();
    await choice("Preview item animation").click();
    await page.waitForFunction(id => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine === id, routine);
    const started = Date.now();
    for (const [at, name] of moments) {
      await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - started)));
      await preview.screenshot({ path: `${shots}/${routine}-${name}.png` });
    }
    await page.waitForFunction(() => !document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine, null, { timeout: 15000 });
  }

  // The needle follows what you've really done today.
  assert.equal(await preview.getAttribute("data-compass-steady"), "false");
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Make progress today").click());
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.compassSteady === "true");

  // Jekyll & Hyde.
  await dialog.getByRole("tab", { name: "Personality", exact: true }).click();
  await dialog.getByRole("button", { name: /^Jekyll & Hyde/ }).click();
  assert.equal(await preview.getAttribute("data-personality"), "jekyll");
  assert.match(await page.locator(".lemma-personality-sample").innerText(), /Or burn the list/);

  // The pictures on the achievement cards.
  const pictures = await page.evaluate(async () => {
    const { rewardPreviews } = await import("/src/features/lemma/rewardPreview.ts");
    return rewardPreviews(["griffin-goggles", "three-realms", "jekyll", "deerstalker", "counts-collar", "dragon-helm", "pack-of-cards", "voyage", "gyges-ring", "true-compass"]);
  });
  assert.equal(Object.keys(pictures).length, 10);
  for (const [id, url] of Object.entries(pictures)) await writeFile(`${shots}/reward-${id}.png`, Buffer.from(url.split(",")[1], "base64"));

  // Nothing happens for someone who hasn't finished the book.
  const achievements = "http://localhost:1427/tests/achievements-preview.html";
  const interview = page.getByRole("dialog", { name: "The Interview" });
  const openAchievements = async url => {
    await page.goto(url);
    await page.getByRole("button", { name: "Achievements", exact: true }).click();
    await page.getByRole("region", { name: "Achievements", exact: true }).getByText(/of \d+ steps done/).waitFor();
  };
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("axiom.disabled", "[]"); });
  await openAchievements(achievements);
  await page.waitForTimeout(300);
  assert.equal(await interview.count(), 0);

  // Finishing it brings the shadow. Wrong answers feed it; right ones shrink it.
  await openAchievements(`${achievements}?interview`);
  await interview.waitFor();
  const shadow = () => interview.evaluate(n => Number(getComputedStyle(n).getPropertyValue("--shadow")));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/interview-1.png` });
  const start = await shadow();
  assert.match(await interview.innerText(), /Who steers your days\?/);
  await interview.getByRole("button", { name: "Luck" }).click();
  assert.match(await interview.innerText(), /The shadow grows/);
  assert.match(await interview.innerText(), /Who steers your days\?/, "the question comes back");
  assert.ok(await shadow() > start);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/interview-2-wrong.png` });
  await interview.getByRole("button", { name: "I do" }).click();
  await interview.getByRole("button", { name: "Learn and rise" }).click();
  assert.match(await interview.innerText(), /Where are you going\?/);
  assert.ok(await shadow() < start);
  await interview.getByRole("button", { name: "I've decided" }).click();
  await interview.getByRole("heading", { name: "The Non-Drifter" }).waitFor();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/interview-3-reveal.png` });
  // Written backwards, so searching the code doesn't give the secret away.
  const unnamed = new RegExp(["gnittiwtuo", "noelopan"].map(word => [...word].reverse().join("")).join("|"), "i");
  assert.ok(!unnamed.test(await page.locator("body").innerText()), "the book is never named");
  await interview.getByRole("button", { name: "Hold your course" }).click();
  await interview.waitFor({ state: "detached" });

  // It's revealed, it doesn't come back by itself, and it can be replayed.
  await page.reload();
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  const region = page.getByRole("region", { name: "Achievements", exact: true });
  await region.getByRole("region", { name: "Areas", exact: true }).getByRole("button", { name: /^Reading/ }).click();
  const reading = page.getByRole("dialog", { name: /^Reading/ });
  const secret = reading.locator(".ach-card", { hasText: "The Non-Drifter" });
  await secret.waitFor();
  assert.equal(await interview.count(), 0);
  await secret.getByRole("button", { name: "Replay The Interview" }).click();
  await interview.waitFor();
  await page.keyboard.press("Escape");
  await interview.waitFor({ state: "detached" });

  assert.deepEqual(errors, []);
  console.log("PASS: locked with their books, every item on every body, the storm, the ring and the compass frame by frame and live, the needle, Jekyll & Hyde, the pictures and The Interview");
} finally { await browser.close(); }
