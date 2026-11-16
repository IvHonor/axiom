import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { IDLE_MOTIONS } from "../src/features/lemma/idleMotion.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir(".qa.local/lemma-rest", { recursive: true });
const names = () => page.locator("[data-context] .lemma-face").evaluateAll(nodes => nodes.map(node => node.dataset.idleMotion));
const settle = () => page.clock.runFor(150);
const start = async () => { await settle(); await page.clock.fastForward(121000); await page.clock.runFor(1500); };
const still = async message => assert.deepEqual(await names(), ["", "", ""], message);
try {
  await page.clock.install({ time: new Date("2026-11-15T12:00:00Z") });
  await page.goto("http://localhost:1427/tests/lemma-rest-preview.html");
  await page.waitForFunction(() => document.querySelectorAll('[data-context] [data-renderer="3d"]').length === 3);
  await page.mouse.move(1100, 700);
  await start();
  const routines = await names();
  for (const [i, context] of ["desktop", "overview", "chat"].entries()) {
    assert.ok(IDLE_MOTIONS[context].includes(routines[i]), context + " plays its own routines");
  }
  await page.screenshot({ path: ".qa.local/lemma-rest/three-surfaces.png", animations: "disabled" });
  await page.clock.runFor(5500);
  await still("short routines finish and rest");
  await start();
  await page.getByRole("textbox", { name: "Message" }).press("a");
  await settle();
  await still("typing interrupts every routine immediately");

  for (const button of ["Focus", "Thinking"]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await start();
    await still(button + " suppresses routines");
    await page.getByRole("button", { name: "Idle", exact: true }).click();
  }
  await page.getByRole("button", { name: "Toggle timer" }).click();
  await start(); await still("a timer suppresses routines");
  await page.getByRole("button", { name: "Toggle timer" }).click();
  await start();
  assert.ok((await names()).every(Boolean), "routines return after the timer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settle(); await still("reduced motion cancels an active routine");
  await start(); await still("reduced motion prevents further routines");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Still", exact: true }).click();
  await start(); await still("zero movement prevents routines");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await start();
  assert.ok((await names()).every(Boolean), "movement preferences take effect live");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await start(); await still("hidden pages stop idle animation");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settle(); await still("returning to the page starts a fresh rest");

  const disposed = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const model = buildCompanion(STANDARD, new THREE.Color("#88ccff"), new THREE.Color("#222222"));
    let geometry = 0, material = 0;
    model.idleTrail.geometry.addEventListener("dispose", () => geometry++);
    model.idleTrail.material.addEventListener("dispose", () => material++);
    disposeModel(model.root);
    return { geometry, material };
  });
  assert.deepEqual(disposed, { geometry: 1, material: 1 }, "the new light trail is disposed with its model");
  console.log("PASS: three repertoires, compact mini, completion, typing, focus, AI activity, timers, reduced motion, zero movement, visibility and resource disposal");

  await page.goto("http://localhost:1427/tests/lemma-preview.html");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Toggle chat" }).click();
  await page.locator('.lemma-chat-companion .lemma-face[data-idle-context="chat"]').waitFor();
  assert.equal(await page.locator('[data-idle-context="desktop"]').count(), 0, "the AI tab has no native desktop mini");
  await page.goto("http://localhost:1427/tests/lemma-overview-preview.html?w=8&h=5&quiet");
  await page.locator('.lemma-face[data-idle-context="overview"]').waitFor();
  await page.goto("http://localhost:1427/tests/desk-preview.html?idle&quiet");
  await page.locator('.lemma-face[data-idle-context="desktop"]').waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: the real AI tab, overview tile and desktop mini select their matching repertoire");
} finally { await browser.close(); }
