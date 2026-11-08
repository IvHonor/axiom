import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.addInitScript(() => {
  window.colourMetrics = { uploads: 0, writes: 0 };
  const upload = WebGL2RenderingContext.prototype.bufferData;
  WebGL2RenderingContext.prototype.bufferData = function (...args) { window.colourMetrics.uploads++; return upload.apply(this, args); };
  const save = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) { if (key === "axiom.lemma.look") window.colourMetrics.writes++; return save.call(this, key, value); };
});
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html?admin", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  const choose = name => page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
  await choose("Pyramid"); await choose("Crown"); await choose("Sunglasses"); await choose("Bow tie"); await choose("Glitch core");
  await page.waitForTimeout(500);
  for (const [label, field] of [["Facewear colour", "facewearColor"], ["Headwear colour", "headwearColor"], ["Crown jewel colour", "jewelColor"], ["Bow tie colour", "neckwearColor"]]) {
  const result = await page.getByLabel(label, { exact: true }).evaluate(async (input, field) => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    window.colourMetrics.uploads = window.colourMetrics.writes = 0;
    const start = performance.now(), frames = [];
    for (let i = 0; i < 16; i++) {
      const at = performance.now();
      const color = `#${(0x220011 + i * 0x050103).toString(16).padStart(6, "0")}`;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, color);
      input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
      await frame(); await frame(); frames.push(performance.now() - at);
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    return { ...window.colourMetrics, elapsed: Math.round(performance.now() - start), maxFrame: Math.round(Math.max(...frames)), selected: input.value, saved: JSON.parse(localStorage.getItem("axiom.lemma.look"))?.[field] };
  }, field);
  console.log(JSON.stringify({ label, ...result }));
  assert.equal(result.selected, result.saved, "Final colour is saved");
  assert.ok(result.uploads <= 12, `Dragging colour must reuse geometry; saw ${result.uploads} GPU buffer uploads`);
  assert.ok(result.writes <= 4, `Continuous dragging must batch persistence; saw ${result.writes} writes`);
  }
  const reset = await page.evaluate(async () => {
    const { Color } = await import("/node_modules/three/build/three.module.js");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const glow = new Color("#2ec4ff");
    const look = { ...STANDARD, accessory: "crown", facewear: "sunglasses", neckwear: "bow", holding: "plant" };
    const model = buildCompanion(look, glow, new Color("#444444"));
    const snapshot = () => {
      const parts = [];
      model.root.traverse(part => { if (part.material?.color) parts.push([part.geometry.uuid, part.material.uuid, part.material.color.getHexString(), part.material.emissive?.getHexString(), part.material.emissiveIntensity]); });
      return parts;
    };
    const original = snapshot();
    model.updateColours({ ...look, headwearColor: "#ff00ff", facewearColor: "#ff0000", neckwearColor: "#00ff00", jewelColor: "#0000ff" }, glow);
    const coloured = snapshot(); model.updateColours(look, glow);
    const restored = snapshot(); disposeModel(model.root); return { original, coloured, restored };
  });
  assert.notDeepEqual(reset.original, reset.coloured, "Material colours change in place");
  assert.deepEqual(reset.original, reset.restored, "Auto restores original colours and glow without replacing geometry or materials");
  assert.deepEqual(errors, []);
  console.log("PASS: live colour dragging reuses geometry and batches saving");
} finally { await browser.close(); }
