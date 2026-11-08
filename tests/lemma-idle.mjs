import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await mkdir(".qa.local/lemma-idle", { recursive: true });
const preview = () => page.locator(".lemma-wardrobe-preview .lemma-face");
const choose = name => page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
const advance = async ms => { await page.clock.fastForward(ms); await page.clock.runFor(80); };
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html?admin", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  await page.getByRole("button", { name: "Glitch core", exact: true }).waitFor();
  console.log("PASS: admin-only item is available to an admin");
  await page.clock.install({ time: new Date("2026-11-07T10:00:00Z") });
  assert.equal(await page.getByRole("button", { name: "Rocket", exact: true }).count(), 0, "Future achievement items are not starter choices");
  for (const [label, kind, wait] of [["Coffee", "coffee", 2200], ["Book", "book", 4200], ["Plant", "plant", 6200], ["Glitch core", "glitch", 3500]]) {
    await choose(label); await choose("Preview item animation"); await advance(wait);
    assert.equal(await preview().getAttribute("data-idle-routine"), kind);
    await preview().screenshot({ path: `.qa.local/lemma-idle/${kind}.png` });
    console.log(`PASS: ${kind} routine rendered`);
    await page.mouse.move(30, 30); await advance(100);
    assert.equal(await preview().getAttribute("data-idle-routine"), kind, "Pointer movement lets the full performance play");
    await advance(10000);
    assert.equal(await preview().getAttribute("data-idle-routine"), "", "A routine does not immediately repeat");
    await preview().click(); await advance(250);
    assert.equal(await preview().getAttribute("data-idle-routine"), kind, "Petting plays the equipped item's routine");
    await page.mouse.move(40, 40); await advance(100);
    assert.equal(await preview().getAttribute("data-idle-routine"), kind, "Petting routine survives mouse movement");
    await advance(9000);
    await preview().press("Enter"); await advance(120);
    assert.equal(await preview().getAttribute("data-idle-routine"), kind, "Keyboard activation plays the routine");
    await advance(9000);
  }
  await preview().press(" "); await advance(120);
  assert.equal(await preview().getAttribute("data-idle-routine"), "glitch", "Space activation also plays the routine");
  await advance(9000);
  const bounds = await preview().boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 45, bounds.y + bounds.height / 2, { steps: 5 }); await page.mouse.up(); await advance(120);
  assert.equal(await preview().getAttribute("data-idle-routine"), "", "Dragging turns the companion without petting");
  await choose("Preview item animation"); await advance(3500);
  await page.getByRole("button", { name: "Use member account", exact: true }).evaluate(b => b.click());
  await advance(100);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Role revocation removes a live glitch core");
  assert.equal(await page.getByRole("button", { name: "Glitch core", exact: true }).count(), 0);
  await page.evaluate(async () => {
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    for (const [key, value] of [
      ["axiom.lemma.look", { ...STANDARD, holding: "glitch" }],
      ["axiom.lemma.preferences", { outfits: [{ id: "forged", name: "Forged", look: { ...STANDARD, holding: "glitch" } }] }],
    ]) {
      const newValue = JSON.stringify(value); localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
    }
  });
  await advance(80);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Changing saved preferences cannot grant the admin item");
  await page.getByRole("tab", { name: "Outfits", exact: true }).click();
  await choose("Wear Forged"); await advance(80);
  assert.equal(await preview().getAttribute("data-holding"), "none", "Saved outfits cannot grant the admin item");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click(); await choose("Coffee");
  await page.evaluate(async () => { const { setLemma } = await import("/src/features/lemma/state.ts"); setLemma({ focused: true }); });
  await advance(80);
  assert.equal(await page.getByRole("button", { name: "Preview item animation", exact: true }).isDisabled(), true);
  await preview().click(); await advance(100);
  assert.equal(await preview().getAttribute("data-idle-routine"), "", "Petting respects focus");
  await advance(90000);
  assert.equal(await preview().getAttribute("data-idle-routine"), "", "Focus suppresses routines");
  await page.evaluate(async () => { const { setLemma } = await import("/src/features/lemma/state.ts"); setLemma({ focused: false }); });
  await page.emulateMedia({ reducedMotion: "reduce" }); await advance(80);
  await preview().click(); await advance(100);
  assert.equal(await preview().getAttribute("data-idle-routine"), "", "Petting respects reduced motion");
  assert.equal(await page.getByRole("button", { name: "Preview item animation", exact: true }).isDisabled(), true);
  await advance(90000); assert.equal(await preview().getAttribute("data-idle-routine"), "");

  const pure = await page.evaluate(async () => {
    const { createIdleDirector, routineFor } = await import("/src/features/lemma/itemIdle.ts");
    const director = createIdleDirector(() => 0.5);
    const input = { now: 0, eligible: true, holding: "coffee", admin: false };
    const initial = director.tick(input), early = director.tick({ ...input, now: 119 }), start = director.tick({ ...input, now: 120 });
    const finished = director.tick({ ...input, now: 128 }), cooldown = director.tick({ ...input, now: 200 });
    director.interrupt(); const interrupted = director.tick({ ...input, now: 201 });
    const pending = createIdleDirector(() => 0);
    pending.tick({ ...input, eligible: false });
    const busyDue = pending.tick({ ...input, now: 70, eligible: false });
    const deferred = pending.tick({ ...input, now: 71 });
    const latest = createIdleDirector(() => 1); latest.tick(input);
    const beforeLatest = latest.tick({ ...input, now: 179 });
    const latestStart = latest.tick({ ...input, now: 180 });
    pending.reset(); const resumed = pending.tick({ ...input, now: 2000 });
    const restricted = routineFor("glitch", false), allowed = routineFor("glitch", true), future = routineFor("rocket", true);
    return { initial, early, start, finished, cooldown, interrupted, restricted, allowed, future, busyDue, deferred, beforeLatest, latestStart, resumed };
  });
  assert.equal(pure.initial, null); assert.equal(pure.early, null); assert.equal(pure.start.kind, "coffee");
  for (const key of ["finished", "cooldown", "interrupted", "restricted", "future"]) assert.equal(pure[key], null);
  assert.equal(pure.allowed, "glitch");
  assert.equal(pure.busyDue, null); assert.equal(pure.deferred.kind, "coffee", "Busy activity defers rather than restarts the countdown");
  assert.equal(pure.beforeLatest, null); assert.equal(pure.latestStart.kind, "coffee"); assert.equal(pure.resumed, null, "Returning after suspension cannot replay a queued routine");
  const desktop = await browser.newPage({ viewport: { width: 500, height: 600 } });
  desktop.on("pageerror", error => errors.push(error.message));
  await desktop.addInitScript(() => localStorage.setItem("axiom.lemma.look", JSON.stringify({ holding: "coffee" })));
  try {
    await desktop.goto("http://localhost:1427/tests/desk-preview.html?idle&quiet", { waitUntil: "domcontentloaded", timeout: 60000 });
    await desktop.locator('.desk-lemma [data-renderer="3d"]').waitFor();
    await desktop.locator(".desk-lemma").click();
    await desktop.waitForFunction(() => document.querySelector(".desk-lemma .lemma-face")?.dataset.idleRoutine === "coffee");
    await desktop.screenshot({ path: ".qa.local/lemma-idle/desktop-pet.png" });
  } finally { await desktop.close(); }
  assert.deepEqual(errors, []);
  console.log("PASS: coffee/book/plant/glitch performances, uninterrupted previews and 1-3 minute scheduling, admin rendering/UI/outfit gates, focus/reduced motion, starter items and scheduling");
} catch (error) {
  console.error(error.message);
  await page.screenshot({ path: ".qa.local/lemma-idle/failure.png", timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
