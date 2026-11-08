import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, colorScheme: "dark", reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
await page.addInitScript(() => {
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const voice = { voiceURI: "test-voice", name: "Preview voice", lang: "en-GB", localService: true };
  Object.defineProperty(window, "speechSynthesis", { value: {
    getVoices: () => [voice], cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    speak: utterance => { window.testSpeech = { voice: utterance.voice?.voiceURI, rate: utterance.rate, text: utterance.text }; window.testUtterance = utterance; },
  } });
});
const url = "http://localhost:1427/tests/lemma-preview.html";
const dialog = () => page.getByRole("dialog");
const choose = name => dialog().getByRole("button", { name, exact: true }).click();
const tab = name => dialog().getByRole("tab", { name, exact: true }).click();
const look = () => page.evaluate(() => JSON.parse(localStorage.getItem("axiom.lemma.look")));
const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem("axiom.lemma.preferences")));
const preview = () => page.locator(".lemma-wardrobe-preview .lemma-face");
const color = async (name, value) => {
  await page.getByLabel(name, { exact: true }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
};
const slider = (name, value) => page.getByRole("slider", { name, exact: true }).fill(String(value));
await mkdir(".qa.local/lemma-wardrobe", { recursive: true });
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  for (const label of ["Headwear colour", "Facewear colour", "Bow tie colour", "Crown jewel colour"]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 0, "Only worn accessories expose colour controls");
  await choose("Pyramid"); await choose("Crown"); await choose("Glasses"); await choose("Bow tie"); await choose("Coffee");
  assert.equal((await look()).accessory, "crown"); assert.equal((await look()).facewear, "glasses"); assert.equal((await look()).neckwear, "bow"); assert.equal((await look()).holding, "coffee");
  assert.equal(await page.getByLabel("Held object colour", { exact: true }).count(), 0);
  await color("Headwear colour", "#eac06b"); await color("Crown jewel colour", "#a77bff");
  await color("Facewear colour", "#f4f4f2"); await color("Bow tie colour", "#ff5c8a");
  await choose("None"); assert.equal(await page.getByLabel("Headwear colour", { exact: true }).count(), 0); assert.equal(await page.getByLabel("Crown jewel colour", { exact: true }).count(), 0);
  await choose("Cap"); assert.equal(await page.getByLabel("Headwear colour", { exact: true }).count(), 1); assert.equal(await page.getByLabel("Crown jewel colour", { exact: true }).count(), 0);
  await choose("No facewear"); assert.equal(await page.getByLabel("Facewear colour", { exact: true }).count(), 0);
  await choose("No neckwear"); assert.equal(await page.getByLabel("Bow tie colour", { exact: true }).count(), 0);
  await choose("Crown"); await choose("Glasses"); await choose("Bow tie");
  assert.equal(await page.getByLabel("Crown jewel colour", { exact: true }).inputValue(), "#a77bff", "Wearable colours survive unequipping");
  assert.equal(await page.getByText(/Coffee, book and plant each have/).count(), 0);
  for (const shape of ["Pyramid", "Orb", "Prism", "Drop"]) {
    await choose(shape); await preview().screenshot({ path: `.qa.local/lemma-wardrobe/${shape.toLowerCase()}-outfit.png` });
  }
  await choose("Orb");
  const fitted = await page.evaluate(async () => {
    const { Color } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { STANDARD, normaliseLook } = await import("/src/features/lemma/look.ts");
    const make = (glow, accessory) => buildCompanion({ ...STANDARD, shape: "prism", holding: "plant", accessory, neckwear: "bow", facewear: "glasses", holdingColor: "#ff0000", jewelColor: "#000000" }, new Color(glow), new Color("#444444"));
    const colours = group => { const found = []; group.traverse(object => { if (object.material?.color) found.push(object.material.color.getHexString()); }); return found; };
    const results = [];
    for (const accessory of ["headphones", "cap", "beanie", "crown", "halo"]) {
      const a = make("#ff0000", accessory), b = make("#0000ff", accessory);
      const positions = a.body.children[0].geometry.attributes.position;
      let xy = 0;
      for (let i = 0; i < positions.count; i++) xy += positions.getX(i) * positions.getY(i);
      const top = [], band = [];
      for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0.82) top.push(Math.hypot(positions.getX(i), positions.getZ(i)));
      if (accessory === "headphones") {
        const vertices = a.hat.children[0].geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) band.push(Math.abs(vertices.getX(i)) > 0.755 || vertices.getY(i) > 0.83);
      }
      results.push({ accessory, xy, band, top, palette: [a.hat, a.neckwear, a.facewear, a.prop].map(colours), other: [b.hat, b.neckwear, b.facewear, b.prop].map(colours), plant: colours(a.prop) });
      disposeModel(a.root); disposeModel(b.root);
    }
    const legacy = normaliseLook({ holdingColor: "#ff0000", jewelColor: "#000000" });
    return { results, legacy };
  });
  for (const result of fitted.results) {
    assert.ok(Math.abs(result.xy) < 0.001, "Prism geometry stands upright");
    assert.deepEqual(result.palette, result.other, "Accessories keep their own colours when body glow changes");
    for (const colour of ["64dc95", "493329", "edf8f5"]) assert.ok(result.plant.includes(colour), "Plant retains green leaves, brown soil and pale pot");
  }
  assert.ok(fitted.results[0].band.every(Boolean), "Headphone band clears the square casing");
  assert.ok(Math.max(...fitted.results.find(r => r.accessory === "crown").top) < 0.475, "Prism upper corners fit inside the crown opening");
  assert.equal(fitted.legacy.holdingColor, "auto"); assert.equal(fitted.legacy.jewelColor, "#000000");
  await choose("Prism"); await choose("Headphones"); await choose("Plant");
  await page.screenshot({ path: ".qa.local/lemma-wardrobe/prism-headphones-dark.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: ".qa.local/lemma-wardrobe/prism-headphones-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const headwear of ["Headphones", "Cap", "Beanie", "Crown", "Halo"]) {
    await choose(headwear);
    await preview().screenshot({ path: `.qa.local/lemma-wardrobe/prism-fit-${headwear.toLowerCase()}.png` });
    await preview().press("ArrowRight"); await preview().press("ArrowRight");
    await preview().screenshot({ path: `.qa.local/lemma-wardrobe/prism-fit-${headwear.toLowerCase()}-turned.png` });
    await preview().press("ArrowLeft"); await preview().press("ArrowLeft");
  }
  for (const material of ["Hologram", "Frosted glass", "Polished metal", "Matte"]) {
    await choose(material); await preview().screenshot({ path: `.qa.local/lemma-wardrobe/${material.replaceAll(" ", "-")}.png` });
  }
  await choose("Sunglasses"); await choose("Reset facewear colour");
  for (const body of ["Orb", "Prism", "Pyramid", "Drop"]) {
    await choose(body);
    await preview().screenshot({ path: `.qa.local/lemma-wardrobe/${body.toLowerCase()}-sunglasses.png` });
  }
  const sunglasses = await page.evaluate(async () => {
    const { Color } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const a = buildCompanion({ ...STANDARD, facewear: "sunglasses" }, new Color("#2ec4ff"), new Color("#444444"));
    const b = buildCompanion({ ...STANDARD, facewear: "sunglasses", facewearColor: "#ff00ff" }, new Color("#2ec4ff"), new Color("#444444"));
    const result = { type: a.facewear.children[0].geometry.type, frame: a.facewear.children[0].material.color.getHexString(), tinted: b.facewear.children[0].material.color.getHexString(), lens: a.facewear.children[1].material.color.getHexString(), otherLens: b.facewear.children[1].material.color.getHexString() };
    disposeModel(a.root); disposeModel(b.root); return result;
  });
  assert.equal(sunglasses.type, "ExtrudeGeometry"); assert.equal(sunglasses.frame, "161b20");
  assert.equal(sunglasses.tinted, "ff00ff"); assert.equal(sunglasses.lens, sunglasses.otherLens, "Frame tint leaves the dark lenses intact");
  const outfit = await look();
  await tab("Outfits"); await page.getByRole("textbox", { name: "Outfit name" }).fill("Study"); await choose("Save outfit");
  assert.deepEqual((await prefs()).outfits[0].look, outfit);
  await page.getByRole("textbox", { name: "Outfit name" }).fill("Study"); await choose("Save outfit");
  assert.equal((await prefs()).outfits.length, 1);
  await tab("Appearance"); await choose("Reset look"); await tab("Outfits"); await choose("Wear Study");
  assert.deepEqual(await look(), outfit);
  await tab("Appearance"); await choose("Pyramid"); await tab("Outfits"); await choose("Update Study");
  assert.equal((await prefs()).outfits[0].look.shape, "pyramid");
  await page.reload({ waitUntil: "domcontentloaded" }); await tab("Outfits");
  assert.equal(await page.getByRole("button", { name: "Wear Study", exact: true }).count(), 1);
  await choose("Wear Study"); assert.equal((await look()).shape, "pyramid");
  await tab("Personality"); await dialog().getByRole("button", { name: /Witty/ }).click();
  assert.match(await page.locator(".lemma-personality-sample").innerText(), /I've asked/);
  await page.getByRole("combobox", { name: "Voice", exact: true }).selectOption("test-voice");
  await slider("Speech speed", 0.85); await choose("Preview voice");
  assert.deepEqual(await page.evaluate(() => window.testSpeech), { voice: "test-voice", rate: 0.85, text: "The task probably won't do itself. I've asked. Let's give it ten minutes." });
  await choose("Stop preview");
  await page.evaluate(async () => {
    const { setCompanionPrefs } = await import("/src/features/lemma/preferences.ts");
    setCompanionPrefs({ voice: "missing-voice" });
    const { speak } = await import("/src/lib/voice.ts"); speak("Fallback");
  });
  assert.equal(await page.evaluate(() => window.testSpeech.voice), "test-voice", "Missing device voice falls back");
  await tab("Presence"); await slider("Companion size", 220); await slider("Glow brightness", 0.65); await slider("Idle movement", 0);
  await page.getByRole("combobox", { name: "Companion position" }).selectOption("top-left");
  await page.screenshot({ path: ".qa.local/lemma-wardrobe/presence.png" });
  await choose("Close");
  const dock = page.locator(".lemma-companion-dock");
  assert.equal(await dock.locator(".lemma-face").evaluate(node => node.getBoundingClientRect().width), 220);
  assert.equal(await dock.evaluate(node => getComputedStyle(node).left), "18px");
  assert.equal(await dock.evaluate(node => getComputedStyle(node).top), "54px");
  await dock.getByRole("button", { name: "Customise Lemma", exact: true }).click(); await tab("Presence");
  await page.getByRole("switch", { name: "Follow me between areas" }).click();
  assert.equal(await dialog().count(), 1, "Turning follow off keeps the settings open");
  assert.equal(await dock.count(), 0);
  await page.getByRole("switch", { name: "Follow me between areas" }).click();
  assert.equal(await dock.count(), 1);
  await page.reload({ waitUntil: "domcontentloaded" }); await tab("Presence");
  assert.equal(await page.getByRole("slider", { name: "Companion size" }).inputValue(), "220");
  await page.setViewportSize({ width: 390, height: 740 });
  for (const section of ["Appearance", "Personality", "Presence", "Outfits"]) {
    await tab(section);
    assert.ok(await dialog().evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${section} fits a narrow window`);
    await page.screenshot({ path: `.qa.local/lemma-wardrobe/narrow-${section}.png` });
  }
  await choose("Delete Study"); assert.equal((await prefs()).outfits.length, 0);
  const validated = await page.evaluate(async () => {
    const { normalisePrefs } = await import("/src/features/lemma/preferences.ts");
    const { normaliseLook } = await import("/src/features/lemma/look.ts");
    return { prefs: normalisePrefs({ size: 1e9, brightness: "bad", movement: -10, rate: 1e9, outfits: [null, { id: "a", name: "Test", look: {} }, { id: "a", name: "Duplicate" }] }), look: normaliseLook({ accessory: "bow", shape: "pyramid", facewear: "bogus", finish: "bogus", headwearColor: "url(bad)" }) };
  });
  assert.equal(validated.prefs.size, 240); assert.equal(validated.prefs.brightness, 1); assert.equal(validated.prefs.movement, 0); assert.equal(validated.prefs.rate, 1.4); assert.equal(validated.prefs.outfits.length, 1);
  assert.equal(validated.look.accessory, "none"); assert.equal(validated.look.neckwear, "bow"); assert.equal(validated.look.facewear, "none"); assert.equal(validated.look.finish, "hologram"); assert.equal(validated.look.headwearColor, "auto");
  assert.deepEqual(errors, []);
  console.log("PASS: independent slots, contextual wearable colours and Prism headwear clearance, all body/finish previews, outfits save/update/apply/delete, persistence, presence controls, voice preference/fallback, personality samples, migration, validation and narrow layouts");
} catch (error) {
  await page.screenshot({ path: ".qa.local/lemma-wardrobe/failure.png", timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
