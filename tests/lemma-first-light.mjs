// Run Vite on port 1427; all accounts and preferences belong to the local fixture.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem("axiom.lemma.look", JSON.stringify({ holding: "coffee" }));
  localStorage.setItem("axiom.lemma.persona", JSON.stringify({ name: "117" }));
});
await mkdir(".qa.local/lemma-first-light", { recursive: true });
const dialog = () => page.getByRole("dialog");
const choose = name => dialog().getByRole("button", { name, exact: true }).click();
const tab = name => dialog().getByRole("tab", { name, exact: true }).click();
const preview = () => page.locator(".lemma-wardrobe-preview .lemma-face");
const advance = async milliseconds => { await page.clock.fastForward(milliseconds); await page.clock.runFor(80); };
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  await dialog().getByRole("button", { name: "First Light", exact: true }).waitFor();
  assert.equal(await preview().getAttribute("data-holding"), "coffee", "Automatic unlock preserves the current outfit");
  // The award still belongs to early accounts after the cutoff and on a different device clock.
  await page.clock.install({ time: new Date("2030-04-01T12:00:00Z") });
  const pure = await page.evaluate(async () => {
    const { STANDARD, hasFirstLight, lookForRole } = await import("/src/features/lemma/look.ts");
    const { createIdleDirector, routineFor } = await import("/src/features/lemma/itemIdle.ts");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { performItem } = await import("/src/features/lemma/itemPerformance.ts");
    const { Color } = await import("/node_modules/three/build/three.module.js");
    const account = createdAt => ({ state: "signed_in", email: "fixture@example.test", admin: false, createdAt });
    const dates = ["2027-03-20T23:59:59.999Z", "2027-03-21T00:00:00Z", "2027-03-22T00:00:00Z", "2027-03-21T01:00:00+02:00", "2027-03-20T23:00:00-02:00", "bad", null, undefined];
    const eligibility = dates.map(date => hasFirstLight(account(date)));
    const look = { ...STANDARD, holding: "first-light" };
    const gates = [lookForRole(look, false, true).holding, lookForRole(look, true, false).holding, lookForRole(look, false).holding];
    const routines = [routineFor("first-light", false, true), routineFor("first-light", true, false)];
    const director = createIdleDirector(() => 0);
    const input = { now: 0, eligible: true, holding: "first-light", admin: false, firstLight: true };
    const initial = director.tick(input), started = director.tick({ ...input, now: 60 });
    const revoked = director.tick({ ...input, now: 61, firstLight: false });
    const models = [];
    for (const shape of ["orb", "prism", "pyramid", "drop"]) {
      const model = buildCompanion({ ...look, shape }, new Color("#2ec4ff"), new Color("#444444"), false, true);
      performItem(model, null, 0);
      const resting = model.lantern.star.position.clone();
      performItem(model, { kind: "first-light", progress: 0.5 }, 3.5);
      const flying = { x: model.lantern.star.position.x, trail: model.lantern.sparks.visible, lifted: model.held.position.y > model.heldOrigin.y };
      performItem(model, { kind: "first-light", progress: 0.89 }, 6.23);
      const flare = model.lantern.starMaterial.emissiveIntensity;
      performItem(model, null, 0);
      models.push({ shape, flying, flare, restored: model.lantern.star.position.distanceTo(resting) < 1e-6 && !model.lantern.sparks.visible && model.held.position.equals(model.heldOrigin) });
      disposeModel(model.root);
    }
    const denied = buildCompanion(look, new Color("#2ec4ff"), new Color("#444444"), true, false);
    const deniedModel = denied.lantern === null && !denied.held.visible;
    disposeModel(denied.root);
    return { eligibility, gates, routines, initial, started, revoked, models, deniedModel, signedOut: hasFirstLight({ state: "signed_out" }), absent: hasFirstLight(null) };
  });
  assert.deepEqual(pure.eligibility, [true, false, false, true, false, false, false, false]);
  assert.deepEqual(pure.gates, ["first-light", "none", "none"]);
  assert.deepEqual(pure.routines, ["first-light", null]);
  assert.equal(pure.initial, null); assert.equal(pure.started.kind, "first-light"); assert.equal(pure.revoked, null);
  assert.equal(pure.signedOut, false); assert.equal(pure.absent, false); assert.equal(pure.deniedModel, true);
  for (const model of pure.models) {
    assert.ok(model.flying.x < 0 && model.flying.trail && model.flying.lifted, `${model.shape}: star circles the head with sparks and a lifted lantern`);
    assert.ok(model.flare > 2 && model.restored, `${model.shape}: catch glows, and interruption restores the resting pose`);
  }
  await choose("First Light");
  assert.equal(await dialog().getByRole("status").innerText(), "First Light: Given to users who created an account before 21 March 2027.");
  await choose("Preview item animation"); await advance(3500);
  assert.equal(await preview().getAttribute("data-idle-routine"), "first-light");
  await preview().screenshot({ path: ".qa.local/lemma-first-light/orbit.png" });
  await advance(2800);
  await preview().screenshot({ path: ".qa.local/lemma-first-light/catch.png" });
  await advance(1500);
  assert.equal(await preview().getAttribute("data-idle-routine"), "");
  await page.screenshot({ path: ".qa.local/lemma-first-light/wardrobe-dark.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: ".qa.local/lemma-first-light/wardrobe-light.png" });
  await preview().press("Enter"); await advance(300);
  assert.equal(await preview().getAttribute("data-idle-routine"), "first-light", "Petting plays the lantern animation");
  await page.emulateMedia({ reducedMotion: "reduce" }); await advance(80);
  assert.equal(await preview().getAttribute("data-idle-routine"), "");
  assert.equal(await dialog().getByRole("button", { name: "Preview item animation", exact: true }).isDisabled(), true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(async () => { const { setLemma } = await import("/src/features/lemma/state.ts"); setLemma({ focused: true }); });
  await advance(80);
  assert.equal(await dialog().getByRole("button", { name: "Preview item animation", exact: true }).isDisabled(), true);
  await page.evaluate(async () => { const { setLemma } = await import("/src/features/lemma/state.ts"); setLemma({ focused: false }); });
  await advance(80);
  await tab("Outfits");
  await dialog().getByRole("textbox", { name: "Outfit name" }).fill("Early light"); await choose("Save outfit");
  await tab("Appearance");
  await page.getByRole("button", { name: "Use later account", exact: true }).evaluate(button => button.click());
  await advance(80);
  assert.equal(await dialog().getByRole("button", { name: "First Light", exact: true }).count(), 0);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Account switching removes an ineligible live lantern");
  await tab("Outfits"); await choose("Wear Early light"); await advance(80);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Saved outfits cannot grant the lantern to a later account");
  await tab("Appearance");
  await page.evaluate(() => {
    const key = "axiom.lemma.look", newValue = JSON.stringify({ holding: "first-light" });
    localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  });
  await advance(80);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Editing local preferences cannot grant the lantern");
  await page.getByRole("button", { name: "Use member account", exact: true }).evaluate(button => button.click());
  await advance(80);
  await choose("First Light");
  await page.setViewportSize({ width: 390, height: 740 });
  assert.ok(await dialog().evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  await page.screenshot({ path: ".qa.local/lemma-first-light/narrow.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: automatic early-account unlock, exact UTC cutoff/timezones, missing dates, existing outfit preservation, all body shapes, seven-second flight/catch/reset, petting, reduced motion/focus, account and outfit gates, narrow layout");
} catch (error) {
  await page.screenshot({ path: ".qa.local/lemma-first-light/failure.png", timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
