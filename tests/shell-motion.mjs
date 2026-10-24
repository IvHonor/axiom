import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: "no-preference"});
const base = process.env.SHELL_MOTION_TEST_ORIGIN || "http://localhost:1427";
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const cell = name => page.locator(".tile-cell").filter({has: page.getByRole("button", {name: `Move ${name}`, exact: true})});
const settle = () => page.evaluate(async () => {
  await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
await mkdir(".qa.local", {recursive: true});
try {
  await page.goto(`${base}/tests/overview-movement-preview.html`);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole("button", {name: "Move Daily Plan", exact: true}).waitFor();
  const begin = () => page.evaluate(() => {
    const handle = document.querySelector('[aria-label="Move Daily Plan"]');
    const rect = handle.getBoundingClientRect();
    const step = (document.querySelector(".tile-grid").clientWidth + 16) / 12;
    window.motionDrag = {x: rect.x + 10, y: rect.y + 10, step};
    handle.setPointerCapture = () => {};
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, pointerId: 99, pointerType: "touch", isPrimary: true, button: 0, clientX: rect.x + 10, clientY: rect.y + 10}));
  });
  const end = () => page.evaluate(() => document.querySelector('[aria-label="Move Daily Plan"]').dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 99, isPrimary: true})));
  // Read the animation's starting position rather than relying on frame timing.
  const move = async key => page.evaluate(async key => {
    const cells = [...document.querySelectorAll(".tile-cell")];
    const board = cells.find(node => node.querySelector(".tile-move-handle").getAttribute("aria-label") === "Move Project Board");
    const before = board.getBoundingClientRect().top;
    const {x, y, step} = window.motionDrag;
    document.querySelector('[aria-label="Move Daily Plan"]').dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 99, pointerType: "touch", isPrimary: true, clientX: x + (key === "ArrowLeft" ? -step : 0), clientY: y}));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const active = board.getAnimations();
    const current = new DOMMatrixReadOnly(getComputedStyle(board).transform).m42;
    const initial = active.length ? new DOMMatrixReadOnly(active[0].effect.getKeyframes()[0].transform).m42 : 0;
    const start = board.getBoundingClientRect().top - current + initial;
    // Pause partway through to guarantee the next move interrupts a visible transition.
    if (active[0]) { active[0].pause(); active[0].currentTime = 70; }
    return {before, start, row: parseInt(board.style.gridRow),
      animations: active.map(animation => ({duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes()}))};
  }, key);
  await begin();
  const first = await move("ArrowLeft");
  assert.ok(first.animations.length > 0, "A displaced tile has an actual running animation");
  assert.equal(first.row, 5);
  assert.ok(Math.abs(first.before - first.start) < 1, "The displaced tile starts at its previous visible position");
  assert.ok(first.animations[0].duration >= 180 && first.animations[0].duration <= 300);
  const reversed = await move("ArrowRight");
  assert.equal(reversed.row, 1);
  assert.ok(Math.abs(reversed.before - reversed.start) < 1, "Reversing a collision retargets without jumping");
  await page.locator(".tile-cell").evaluateAll(nodes => nodes.flatMap(node => node.getAnimations()).forEach(animation => animation.play()));
  await end();
  await settle();
  assert.equal(await cell("Project Board").evaluate(node => getComputedStyle(node).transform), "none");
  await page.screenshot({path: ".qa.local/overview-motion-settled.png"});
  const dragHandle = page.getByRole("button", {name: "Move Daily Plan", exact: true});
  const box = await dragHandle.boundingBox();
  const step = await page.locator(".tile-grid").evaluate(node => (node.clientWidth + 16) / 12);
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 10 - step, box.y + 10);
  assert.equal(await cell("Daily Plan").evaluate(node => node.getAnimations().length), 0, "The grabbed tile has no movement lag");
  await page.keyboard.press("Escape"); await page.mouse.up(); await settle();
  await begin(); await move("ArrowLeft"); await page.emulateMedia({reducedMotion: "reduce"});
  await page.waitForFunction(() => [...document.querySelectorAll(".tile-cell")].every(node => node.getAnimations().length === 0));
  const reduced = await move("ArrowRight"); assert.equal(reduced.animations.length, 0);
  await end();
  console.log("PASS: actual collision animation, interruption/reversal continuity, pointer responsiveness, settling and live reduced motion");

  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.goto(`${base}/tests/overview-visibility-preview.html`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("axiom.installed", JSON.stringify(["daily_plan", "reading"])); });
  await page.reload(); await page.locator(".sidebar-frame.is-open .nav-item").first().waitFor(); await settle();
  const frame = page.locator(".sidebar-frame");
  const toggle = async () => page.evaluate(async () => {
    document.querySelector('[aria-label="Areas (Ctrl+B)"]').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const frame = document.querySelector(".sidebar-frame");
    return {width: frame.getBoundingClientRect().width, inert: frame.inert, animations: frame.getAnimations().length,
      hasPanel: !!frame.querySelector(".sidebar"), mainWidth: document.querySelector(".main").getBoundingClientRect().width};
  });
  await page.locator(".sidebar .nav-item").first().focus();
  const closed = await toggle();
  assert.equal(closed.inert, true); assert.equal(closed.hasPanel, true, "Keep content visible while sliding closed");
  assert.ok(closed.animations > 0 && closed.width > 0);
  assert.equal(await page.getByRole("button", {name: "Areas (Ctrl+B)", exact: true}).evaluate(node => node === document.activeElement), true);
  await settle(); await page.waitForFunction(() => !document.querySelector(".sidebar-frame .sidebar"));
  assert.equal((await frame.boundingBox()).width, 0);
  const opened = await toggle(); assert.equal(opened.inert, false); assert.equal(opened.hasPanel, true);
  assert.ok(opened.animations > 0 && opened.width < 300);
  await page.getByRole("button", {name: "Preview dialog", exact: true}).evaluate(node => node.click());
  await page.getByRole("dialog", {name: "Motion preview", exact: true}).waitFor();
  const overlay = await page.locator(".modal-backdrop").boundingBox();
  assert.equal(overlay.x, 0); assert.equal(overlay.y, 0); assert.equal(overlay.width, 1440); assert.equal(overlay.height, 1000);
  assert.ok(await page.locator(".modal").evaluate(node => node.getAnimations().length > 0));
  await page.keyboard.press("Escape"); await settle();
  assert.equal(Math.round((await frame.boundingBox()).width), 300);
  await toggle(); await toggle(); await settle();
  assert.equal(Math.round((await frame.boundingBox()).width), 300, "Rapid reversal restores the open sidebar");
  await page.waitForTimeout(320); assert.equal(await frame.locator(".sidebar").count(), 1, "No stale close timer clears a reopened panel");
  await page.getByRole("button", {name: "Extensions (Ctrl+Shift+X)", exact: true}).click(); await settle();
  await page.getByRole("button", {name: "Areas (Ctrl+B)", exact: true}).click(); await settle();
  assert.equal(Math.round((await frame.boundingBox()).width), 300);
  await page.setViewportSize({width: 700, height: 500}); await toggle(); await settle(); await toggle(); await settle();
  assert.equal(await page.locator(".workbench").evaluate(node => node.scrollWidth > node.clientWidth), false);
  await page.locator(".activitybar").getByRole("button", {name: "Reading Tracker", exact: true}).click({button: "right"});
  assert.ok(await page.getByRole("menu").evaluate(node => node.getAnimations().length > 0));
  await page.keyboard.press("Escape");
  await page.emulateMedia({reducedMotion: "reduce"});
  await toggle(); assert.equal(await frame.locator(".sidebar").count(), 0);
  await toggle(); assert.equal(Math.round((await frame.boundingBox()).width), 300);
  assert.equal(await frame.evaluate(node => node.getAnimations({subtree: true}).length), 0);
  await page.getByRole("button", {name: "Preview dialog", exact: true}).click();
  assert.equal(await page.locator(".modal").evaluate(node => node.getAnimations().length), 0); await page.keyboard.press("Escape");
  await page.locator(".activitybar").getByRole("button", {name: "Reading Tracker", exact: true}).click({button: "right"});
  assert.equal(await page.getByRole("menu").evaluate(node => node.getAnimations().length), 0);
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log("PASS: sidebar opening/closing, focus and inert content, rapid reversals, panel switches, narrow windows, menu motion and reduced motion");
} finally { await browser.close(); }
