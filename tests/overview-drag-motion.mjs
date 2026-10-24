import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = process.env.OVERVIEW_MOVEMENT_TEST_URL || "http://localhost:1427/tests/overview-movement-preview.html";
const handle = () => page.getByRole("button", { name: "Move Daily Plan", exact: true });
const cell = () => page.locator(".tile-cell").filter({ has: handle() });
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const settle = () => page.evaluate(async () => {
  await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  await new Promise(resolve => requestAnimationFrame(resolve));
});
const saved = () => page.evaluate(() => localStorage.getItem("axiom.tilePositions.v1"));
async function begin() {
  return handle().evaluate(element => {
    const rect = element.getBoundingClientRect();
    const tile = element.closest(".tile-cell").getBoundingClientRect();
    const point = { x: rect.x + 10, y: rect.y + 10, left: tile.left, top: tile.top,
      step: (document.querySelector(".tile-grid").clientWidth + 16) / 12 };
    window.dragTestPoint = point;
    element.setPointerCapture = () => {};
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, isPrimary: true, button: 0, clientX: point.x, clientY: point.y }));
    return point;
  });
}
async function move(dx, dy = 0) {
  await handle().evaluate((element, { dx, dy }) => {
    const point = window.dragTestPoint;
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 77, isPrimary: true, clientX: point.x + dx, clientY: point.y + dy }));
  }, { dx, dy });
  await frames();
}
const end = () => handle().evaluate(element => element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 77, isPrimary: true })));
const position = () => cell().evaluate(node => ({ col: parseInt(node.style.gridColumn), row: parseInt(node.style.gridRow) }));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1.5, `${message}: ${a} vs ${b}`);
async function clean() {
  await frames();
  await settle();
  assert.equal(await page.locator(".tile-drop-target").count(), 0);
  assert.equal(await page.locator(".tile-cell.is-moving, .tile-cell.is-settling").count(), 0);
  assert.equal(await cell().evaluate(node => node.style.transform), "");
  assert.equal(await page.locator(".tile-grid").evaluate(node => node.style.minHeight), "");
}
try {
  await mkdir(".qa.local", { recursive: true });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear()); await page.reload(); await handle().waitFor();
  const initial = await saved();
  await begin(); await move(2, 1);
  assert.equal(await page.locator(".tile-drop-target").count(), 0, "Click jitter does not lift a tile");
  await end(); assert.equal(await saved(), initial, "A click does not write positions"); await clean();

  const point = await begin();
  await move(-point.step * .30, 22);
  let box = await cell().boundingBox();
  close(box.x, point.left - point.step * .30, "Sub-cell horizontal tracking");
  close(box.y, point.top + 22, "Sub-cell vertical tracking");
  assert.deepEqual(await position(), { col: 5, row: 1 });
  assert.equal(await page.locator(".tile-drop-target").count(), 1);
  assert.equal(await cell().evaluate(node => node.getAnimations().length), 0);
  await move(-point.step * .55);
  assert.equal((await position()).col, 5, "Snap tolerance holds before deliberate crossing");
  await move(-point.step * .68);
  assert.equal((await position()).col, 4);
  for (const fraction of [.49, .55, .42, .58, .48]) {
    await move(-point.step * fraction);
    assert.equal((await position()).col, 4, "Boundary jitter cannot churn neighboring tiles");
  }
  assert.equal(await saved(), initial, "Collision previews do not persist");
  await page.screenshot({ path: ".qa.local/overview-drag-preview.png" });
  await move(-point.step * .28, 23);
  assert.equal((await position()).col, 5, "Reversing intentionally restores neighbors");
  box = await cell().boundingBox();
  await end(); await frames();
  const landing = await cell().evaluate(node => {
    const animation = node.getAnimations()[0];
    if (!animation) return null;
    animation.pause(); animation.currentTime = 65;
    return animation.effect.getKeyframes()[0].transform;
  });
  assert.ok(landing, "Dropping between cells animates into the landing slot");
  const landingOffset = await page.evaluate(value => {
    const matrix = new DOMMatrixReadOnly(value); return { x: matrix.m41, y: matrix.m42 };
  }, landing);
  close(landingOffset.x, box.x - point.left, "Landing starts at painted horizontal position");
  close(landingOffset.y, box.y - point.top, "Landing starts at painted vertical position");

  const pickup = await begin(); await move(12, 8);
  box = await cell().boundingBox();
  close(box.x, pickup.left + 12, "Picking up a settling tile preserves its visual position");
  close(box.y, pickup.top + 8, "Picking up a settling tile preserves its vertical position");
  assert.equal(await cell().evaluate(node => node.getAnimations().length), 0);
  await page.keyboard.press("Escape"); await clean();

  // Press, move and release in a single frame must still commit and clean up.
  await begin();
  await handle().evaluate(element => {
    const { x, y } = window.dragTestPoint;
    const init = { bubbles: true, pointerId: 77, isPrimary: true, clientX: x + 13, clientY: y + 17 };
    element.dispatchEvent(new PointerEvent("pointermove", init));
    element.dispatchEvent(new PointerEvent("pointerup", init));
  });
  await clean();

  await begin();
  await handle().evaluate(element => {
    const { x, y, step } = window.dragTestPoint;
    const init = { bubbles: true, pointerId: 77, isPrimary: true, clientX: x - step, clientY: y + 128 };
    element.dispatchEvent(new PointerEvent("pointermove", init));
    element.dispatchEvent(new PointerEvent("pointerup", init));
  });
  await clean();
  assert.deepEqual(await position(), { col: 4, row: 3 }, "A fast drop flushes the latest destination before saving");

  const beforeCancel = await saved();
  await begin(); await move(-point.step * 1.4, 90);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await clean(); assert.equal(await saved(), beforeCancel);
  await begin(); await move(-point.step * 1.4, 90);
  await page.setViewportSize({ width: 1100, height: 900 });
  await clean(); assert.equal(await saved(), beforeCancel, "Window changes cancel without saving a bad drop");
  await begin(); await move(-20, 20);
  await page.locator(".tile-grid").evaluate(node => node.style.width = "80%");
  await frames(); await clean(); assert.equal(await saved(), beforeCancel, "Sidebar geometry changes cancel safely");
  await page.locator(".tile-grid").evaluate(node => node.style.removeProperty("width"));

  // Different tile proportions and window widths keep their content size while floating.
  for (const width of [700, 1100, 1920]) for (const [w, h] of [[2, 2], [4, 4], [8, 3], [3, 12], [12, 16]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(({ w, h }) => {
      localStorage.removeItem("axiom.tilePositions.v1");
      localStorage.setItem("axiom.tileSizes", JSON.stringify({ daily_plan: { w, h } }));
    }, { w, h });
    await page.reload(); await handle().waitFor(); await frames();
    const before = await cell().boundingBox();
    await begin(); await move(10, 20);
    const during = await cell().boundingBox();
    close(before.width, during.width, "Dragging never scales content");
    close(before.height, during.height, "Dragging never changes tile height");
    assert.equal(await page.locator(".main").evaluate(node => node.scrollWidth > node.clientWidth), false, "No horizontal overflow");
    await page.keyboard.press("Escape"); await clean();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await begin(); await move(0, 24); await end(); await frames();
  assert.equal(await cell().evaluate(node => node.getAnimations().length), 0);
  await clean(); assert.deepEqual(errors, []);
  console.log("PASS: continuous pointer tracking, snap tolerance, landing/pickup continuity, single-frame release, no-op clicks, cancellation, 15 size/window combinations and reduced motion");
} finally { await browser.close(); }
