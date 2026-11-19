// Run Vite on port 1427. All activity and wardrobes belong to the fixture.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = "http://localhost:1427/tests/lemma-preview.html";
const dialog = page.getByRole("dialog");
const choice = name => dialog.getByRole("button", { name, exact: true });
const preview = page.locator(".lemma-wardrobe-preview .lemma-face");
const unlocked = async name => {
  await page.waitForFunction(name => {
    const button = document.querySelector(`button[aria-label="${name}"]`);
    return button && button.getAttribute("data-locked") !== "true";
  }, name);
  assert.equal(await choice(name).isEnabled(), true);
};
await mkdir(".qa.local/lemma-rewards", { recursive: true });
try {
  await page.goto(`${base}?admin&active=0`);
  await unlocked("Tie"); await unlocked("Fedora");
  assert.equal(await choice("Tie").getAttribute("aria-description"), "Available to admins");
  await choice("Fedora").click(); await choice("Tie").click();
  assert.equal(await preview.getAttribute("data-headwear"), "fedora");
  assert.equal(await preview.getAttribute("data-neckwear"), "tie");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.achievements.rewards")) ?? []), [], "Admin access never marks rewards as earned");
  await dialog.getByRole("tab", { name: "Outfits", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Outfit name" }).fill("Admin");
  await choice("Save outfit").click();
  await page.getByRole("button", { name: "Use member account", exact: true }).evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.neckwear === "none");
  await choice("Wear Admin").click();
  assert.equal(await preview.getAttribute("data-headwear"), "none");
  assert.equal(await preview.getAttribute("data-neckwear"), "none", "Saved admin outfits cannot bypass achievement requirements after role changes");
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  assert.equal(await choice("Fedora").getAttribute("data-locked"), "true");
  assert.equal(await choice("Tie").getAttribute("data-locked"), "true");
  await page.getByRole("button", { name: "Use admin account", exact: true }).evaluate(button => button.click());
  await unlocked("Tie"); await unlocked("Fedora");
  assert.equal(await preview.getAttribute("data-neckwear"), "tie", "Admin access returns immediately when the role is restored");
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?active=2`);
  await preview.locator('canvas').waitFor();
  assert.equal(await choice("Tie").getAttribute("data-locked"), "true");
  assert.equal(await choice("Fedora").getAttribute("data-locked"), "true");
  assert.match(await choice("Tie").getAttribute("aria-description"), /Showing Up.*3 days in a row/);
  assert.match(await choice("Fedora").getAttribute("aria-description"), /Regular.*10 days/);
  const gates = await page.evaluate(async () => {
    const { STANDARD, normaliseLook, lookForRewards, setLook } = await import("/src/features/lemma/look.ts");
    const look = normaliseLook({ ...STANDARD, accessory: "fedora", neckwear: "tie" });
    setLook(look);
    return [lookForRewards(look, []), lookForRewards(look, ["tie"]), lookForRewards(look, ["fedora", "tie"])];
  });
  assert.deepEqual(gates.map(l => [l.accessory, l.neckwear]), [["none", "none"], ["none", "tie"], ["fedora", "tie"]]);
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.neckwear === "none");
  // An outfit alone cannot grant a reward; earning one doesn't replace what is currently worn.
  await choice("Bow tie").click();
  await page.getByRole("button", { name: "Add activity day", exact: true }).evaluate(button => button.click());
  await unlocked("Tie");
  assert.equal(await preview.getAttribute("data-neckwear"), "bow");
  assert.equal(await choice("Fedora").getAttribute("data-locked"), "true");
  await choice("Tie").click();
  assert.equal(await preview.getAttribute("data-neckwear"), "tie");
  // Nine distinct days are not enough for Regular.
  await page.goto(`${base}?active=9`);
  await unlocked("Tie");
  assert.equal(await choice("Fedora").getAttribute("data-locked"), "true");
  await page.getByRole("button", { name: "Add activity day", exact: true }).evaluate(button => button.click());
  await unlocked("Fedora");
  await choice("Fedora").click();
  await choice("Tie").click();
  for (const shape of ["Orb", "Prism", "Pyramid", "Drop"]) {
    await choice(shape).click();
    await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.renderer === "3d");
    assert.equal(await preview.getAttribute("data-headwear"), "fedora");
    assert.equal(await preview.getAttribute("data-neckwear"), "tie");
    assert.equal(await page.locator('[data-testid="small-face"] svg path[d^="M-5 36"]').count(), 1, "Static illustration includes the tie");
    assert.equal(await page.locator('[data-testid="small-face"] svg ellipse[cy="-52"]').count(), 1, "Static illustration includes the fedora");
    await preview.screenshot({ path: `.qa.local/lemma-rewards/${shape.toLowerCase()}.png` });
  }
  const materials = await page.evaluate(async () => {
    const { Color } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const look = { ...STANDARD, accessory: "fedora", neckwear: "tie" };
    const model = buildCompanion(look, new Color("#2ec4ff"), new Color("#444444"));
    const summarize = group => group.children.map(o => ({ color: o.material.color.getHexString(), glow: o.material.emissiveIntensity, metalness: o.material.metalness }));
    const initial = { hat: summarize(model.hat), tie: summarize(model.neckwear) };
    model.updateColours({ ...look, headwearColor: "#ff0000", neckwearColor: "#0000ff" }, new Color("#00ff00"));
    const tinted = { hat: summarize(model.hat), tie: summarize(model.neckwear) };
    disposeModel(model.root);
    return { initial, tinted };
  });
  assert.ok(materials.initial.hat.slice(0, 2).every(m => m.color === "35343a" && m.metalness === 0));
  assert.ok(materials.initial.tie.every(m => m.color === "7a2e3a" && m.metalness === 0));
  assert.ok(materials.tinted.hat.slice(0, 2).every(m => m.color === "ff0000"));
  assert.equal(materials.tinted.hat[2].color, "19191d", "Ribbon keeps its plain colour");
  assert.ok(materials.tinted.tie.every(m => m.color === "0000ff"));
  assert.ok([...materials.tinted.hat.slice(0, 2), ...materials.tinted.tie].every(m => m.glow === 0), "Colour changes keep these early rewards free of glow effects");
  await dialog.getByRole("tab", { name: "Outfits", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Outfit name" }).fill("Regular");
  await choice("Save outfit").click();
  await page.evaluate(async () => {
    const { setLocalSetting } = await import("/src/lib/settings.ts");
    setLocalSetting("axiom.achievements.rewards", ["fedora"]);
  });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.achievements.rewards")).sort()), ["bandana", "fedora", "round-glasses", "tie"], "An older synced profile preserves every reward earned here");
  // Unlocks survive removed activity, a broken streak, and a full reload.
  await page.goto(`${base}?active=0`);
  await unlocked("Tie"); await unlocked("Fedora");
  await choice("Reset look").click();
  await dialog.getByRole("tab", { name: "Outfits", exact: true }).click();
  await choice("Wear Regular").click();
  assert.equal(await preview.getAttribute("data-headwear"), "fedora");
  assert.equal(await preview.getAttribute("data-neckwear"), "tie");
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 740 });
  assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  await page.screenshot({ path: ".qa.local/lemma-rewards/narrow.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: admin access without achievements, live role changes, no permanent admin grants, exact reward thresholds, live unlocks, outfit gates, permanent rewards, all shapes and renderers, matte materials, colours, saved outfits and narrow layout");
} finally { await browser.close(); }
