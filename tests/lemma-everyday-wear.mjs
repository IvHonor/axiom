// The everyday clothes from Axiom's achievements: locked until their step, shown
// on every body, and earned one step at a time. Run Vite on port 1427.
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
const shots = ".qa.local/lemma-everyday";
const settled = () => page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.renderer === "3d");
const HATS = ["Bucket hat", "Beret", "Flat cap", "Headband", "Sun hat"], NECK = ["Scarf", "Bandana", "Chain necklace", "Lanyard", "Bead necklace"], FACE = ["Round glasses", "Aviators", "Cat-eye glasses", "Tinted glasses"];
const IDS = ["bucket-hat", "beret", "flat-cap", "headband", "sun-hat", "scarf", "bandana", "chain-necklace", "lanyard", "bead-necklace", "round-glasses", "aviators", "cat-eye", "tinted-glasses"];
const unlocked = name => page.waitForFunction(label => { const button = document.querySelector(`button[aria-label="${label}"]`); return button && button.getAttribute("data-locked") !== "true"; }, name);
await mkdir(shots, { recursive: true });
try {
  // Locked, each naming the step that earns it.
  await page.goto("http://localhost:1427/tests/lemma-preview.html?active=0");
  await settled();
  for (const item of [...HATS, ...NECK, ...FACE]) assert.equal(await choice(item).getAttribute("data-locked"), "true", `${item} starts locked`);
  await choice("Round glasses").hover();
  const card = await page.getByRole("tooltip").innerText();
  for (const part of [/Round Glasses/, /Showing Up/, /7 days in a row/, /Axiom/]) assert.match(card, part);
  assert.match(await choice("Beret").getAttribute("aria-description"), /Regular.*20 days/);

  // One step at a time: five days earns the first Regular item, and no more.
  await page.mouse.move(0, 0);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Add activity day" }).evaluate(button => button.click());
  await unlocked("Bandana"); await unlocked("Tie");
  for (const item of ["Round glasses", "Fedora", "Bucket hat"]) assert.equal(await choice(item).getAttribute("data-locked"), "true", `${item} needs a later step`);
  await choice("Bandana").click();
  assert.equal(await preview.getAttribute("data-neckwear"), "bandana");
  // Two more days in a row reach Showing Up's second step.
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Add activity day" }).evaluate(button => button.click());
  await unlocked("Round glasses");
  assert.equal(await choice("Fedora").getAttribute("data-locked"), "true");

  // Everything on every body (admins have the whole wardrobe).
  await page.goto("http://localhost:1427/tests/lemma-preview.html?admin");
  await settled();
  for (const [shape, sets] of [["Orb", [0, 0, 0]], ["Prism", [1, 1, 1]], ["Pyramid", [2, 2, 2]], ["Drop", [3, 3, 3]]]) {
    await choice(shape).click();
    for (const item of [HATS[sets[0]], NECK[sets[1]], FACE[sets[2]]]) await choice(item).click();
    await settled();
    await page.waitForTimeout(250);
    await preview.screenshot({ path: `${shots}/${shape.toLowerCase()}.png` });
  }
  await choice("Sun hat").click(); await choice("Bead necklace").click();
  assert.deepEqual(await preview.evaluate(n => [n.dataset.headwear, n.dataset.neckwear, n.dataset.facewear]), ["sun-hat", "bead-necklace", "tinted-glasses"]);
  assert.equal(await dialog.getByLabel("Bead colour", { exact: true }).count(), 1);

  const { items: results, tieOnPyramid } = await page.evaluate(async ids => {
    let tieOnPyramid;
    const { Color, Box3 } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { STANDARD, normaliseLook } = await import("/src/features/lemma/look.ts");
    const out = [];
    const slot = id => ["bucket-hat", "beret", "flat-cap", "headband", "sun-hat"].includes(id) ? "accessory" : ["scarf", "bandana", "chain-necklace", "lanyard", "bead-necklace"].includes(id) ? "neckwear" : "facewear";
    for (const shape of ["orb", "prism", "pyramid", "drop"]) for (const id of ids) {
      const field = slot(id), look = { ...STANDARD, shape, [field]: id };
      const model = buildCompanion(look, new Color("#2ec4ff"), new Color("#444444"));
      const part = { accessory: model.hat, neckwear: model.neckwear, facewear: model.facewear }[field];
      model.root.updateWorldMatrix(true, true);
      const box = new Box3().setFromObject(part), size = box.max.clone().sub(box.min);
      let meshes = 0; part.traverse(o => { if (o.isMesh) meshes++; });
      // A colour picked for the item reaches it.
      model.updateColours({ ...look, headwearColor: "#ff0000", neckwearColor: "#ff0000", facewearColor: "#ff0000" }, new Color("#00ff00"));
      let recoloured = false; part.traverse(o => { if (o.isMesh && o.material.color?.getHexString() === "ff0000") recoloured = true; });
      out.push({ shape, id, meshes, width: size.x, height: size.y, recoloured, kept: normaliseLook(look)[field] === id });
      disposeModel(model.root);
    }
    // The tie lies on the pyramid's front and stops at its base.
    const tied = buildCompanion({ ...STANDARD, shape: "pyramid", neckwear: "tie" }, new Color("#2ec4ff"), new Color("#444444"));
    tied.root.updateWorldMatrix(true, true);
    const tieBox = new Box3().setFromObject(tied.neckwear);
    tieOnPyramid = { bottom: tieBox.min.y, top: tieBox.max.y, leans: tied.neckwear.children[0].rotation.x < -0.3 };
    disposeModel(tied.root);
    return { items: out, tieOnPyramid };
  }, IDS);
  assert.ok(tieOnPyramid.leans && tieOnPyramid.bottom > -0.96 && tieOnPyramid.top < -0.45, `the pyramid's tie follows its front (${tieOnPyramid.bottom.toFixed(2)} to ${tieOnPyramid.top.toFixed(2)})`);
  for (const r of results) {
    const name = `${r.shape}/${r.id}`;
    assert.ok(r.meshes > 0 && r.kept, `${name}: builds and survives saving`);
    assert.ok(r.recoloured, `${name}: takes its colour`);
    assert.ok(r.width < 2.6 && r.height < 1.6, `${name}: stays a sensible size (${r.width.toFixed(2)} x ${r.height.toFixed(2)})`);
  }

  // The pictures on the achievement cards.
  const pictures = await page.evaluate(async ids => (await import("/src/features/lemma/rewardPreview.ts")).rewardPreviews(ids), IDS);
  assert.equal(Object.keys(pictures).length, IDS.length);
  for (const [id, url] of Object.entries(pictures)) await writeFile(`${shots}/reward-${id}.png`, Buffer.from(url.split(",")[1], "base64"));

  // Themes and areas found on two devices add up: an older copy from elsewhere loses nothing.
  const secrets = await page.evaluate(async () => {
    const { currentSecrets, noteAreaOpened, noteThemeTried } = await import("/src/features/lemma/achievements/secrets.ts");
    const { setLocalSetting } = await import("/src/lib/settings.ts");
    noteThemeTried("here-theme"); noteAreaOpened("notes"); noteAreaOpened("not-an-area");
    setLocalSetting("axiom.achievements.secrets", ["theme:there-theme"]);
    return { live: currentSecrets(), saved: JSON.parse(localStorage.getItem("axiom.achievements.secrets")) };
  });
  for (const list of [secrets.live, secrets.saved]) for (const id of ["theme:here-theme", "theme:there-theme", "area:notes"]) assert.ok(list.includes(id), id);
  assert.ok(!secrets.live.includes("area:not-an-area"));

  assert.deepEqual(errors, []);
  console.log("PASS: locked until their own step, earned one at a time, every item on every body, colours and reward pictures");
} finally { await browser.close(); }
