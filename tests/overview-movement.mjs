import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = process.env.OVERVIEW_MOVEMENT_TEST_URL || "http://localhost:1427/tests/overview-movement-preview.html";
const positionsKey = "axiom.tilePositions.v1";
const cell = name => page.locator(".tile-cell").filter({ has: page.getByRole("button", { name: "Move " + name, exact: true }) });
async function layout() {
  return page.locator(".tile-cell").evaluateAll(nodes => nodes.map(node => ({
    name: node.querySelector(".tile-move-handle").getAttribute("aria-label").slice(5),
    col: parseInt(node.style.gridColumn), row: parseInt(node.style.gridRow),
    w: +node.style.getPropertyValue("--w"), h: +node.style.getPropertyValue("--h"),
  })));
}
async function place(name, col, row, finish = true, pointerType = "mouse") {
  const rect = await page.getByRole("button", { name: "Move " + name, exact: true }).boundingBox();
  const current = (await layout()).find(tile => tile.name === name);
  const step = await page.locator(".tile-grid").evaluate(grid => (grid.clientWidth + 16) / 12);
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  if (pointerType === "mouse") {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + (col - current.col) * step, y + (row - current.row) * 64, { steps: 8 });
    if (finish) await page.mouse.up();
  } else {
    // Touch capture uses the same pointer code, without relying on a native drag API.
    const handle = page.getByRole("button", { name: "Move " + name, exact: true });
    await handle.evaluate((element, point) => {
      element.setPointerCapture = () => {};
      const init = { bubbles: true, pointerId: 99, pointerType: "touch", isPrimary: true, button: 0 };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: point.x, clientY: point.y }));
      element.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: point.tx, clientY: point.ty }));
      element.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: point.tx, clientY: point.ty }));
    }, { x, y, tx: x + (col - current.col) * step, ty: y + (row - current.row) * 64 });
  }
}
function noCollisions(tiles) {
  for (const a of tiles) {
    assert.ok(a.col >= 1 && a.col + a.w <= 13 && a.row >= 1);
    for (const b of tiles) if (a !== b) assert.ok(!(a.col < b.col + b.w && a.col + a.w > b.col && a.row < b.row + b.h && a.row + a.h > b.row), a.name + " overlaps " + b.name);
  }
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Move Daily Plan", exact: true }).waitFor();
  const initial = await layout();
  assert.deepEqual(initial.map(t => [t.col, t.row]), [[1, 1], [5, 1], [9, 1], [1, 5]]);
  await cell("Daily Plan").getByRole("button", { name: "Action 0", exact: true }).click();
  await place("Daily Plan", 3, 3);
  let tiles = await layout();
  assert.deepEqual(tiles.find(t => t.name === "Daily Plan"), { name: "Daily Plan", col: 3, row: 3, w: 4, h: 4 });
  noCollisions(tiles);
  assert.equal(await cell("Daily Plan").getByRole("button", { name: "Action 1" }).count(), 1, "Movement preserves summary state");
  await page.reload();
  assert.deepEqual(await layout(), tiles, "Positions persist across reload");

  const beforeCancel = await page.evaluate(key => localStorage.getItem(key), positionsKey);
  await place("Daily Plan", 6, 5, false);
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.deepEqual(await layout(), tiles, "Escape restores all displaced tiles");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), positionsKey), beforeCancel, "Preview must not persist");
  assert.equal(await page.locator("html").evaluate(el => el.classList.contains("is-moving")), false);

  const handle = page.getByRole("button", { name: "Move Daily Plan", exact: true });
  await handle.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
  tiles = await layout();
  assert.equal(tiles.find(t => t.name === "Daily Plan").col, 4);
  assert.equal(tiles.find(t => t.name === "Daily Plan").row, 4);
  assert.match(await cell("Daily Plan").getByRole("status").textContent(), /column 4, row 4/);
  noCollisions(tiles);
  await page.getByRole("button", { name: "Open Daily Plan", exact: true }).click();
  assert.equal(await page.getByTestId("opened").textContent(), "daily_plan");
  assert.deepEqual(await layout(), tiles, "Open control must not move the tile");

  await place("Daily Plan", -10, -10);
  assert.deepEqual((await layout()).find(t => t.name === "Daily Plan"), { name: "Daily Plan", col: 1, row: 1, w: 4, h: 4 });
  noCollisions(await layout());
  await cell("Daily Plan").getByRole("button", { name: "Resize Daily Plan" }).focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
  tiles = await layout();
  assert.equal(tiles.find(t => t.name === "Daily Plan").w, 5);
  assert.equal(tiles.find(t => t.name === "Daily Plan").h, 5);
  noCollisions(tiles);
  await page.getByRole("button", { name: "Move Daily Plan", exact: true }).focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  assert.equal((await layout()).find(t => t.name === "Daily Plan").col, 8, "Right edge accounts for tile width");
  await cell("Daily Plan").getByRole("button", { name: "Resize Daily Plan" }).press("ArrowRight");
  tiles = await layout();
  assert.equal(tiles.find(t => t.name === "Daily Plan").col, 7, "Growing at right edge remains in the grid");
  noCollisions(tiles);

  const notes = tiles.find(t => t.name === "Notes");
  await page.getByRole("button", { name: "Toggle Notes" }).click();
  assert.equal(await page.getByRole("button", { name: "Move Notes", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Toggle Notes" }).click();
  assert.deepEqual((await layout()).find(t => t.name === "Notes"), notes, "Reinstalled area retains its position");
  await page.setViewportSize({ width: 800, height: 900 });
  noCollisions(await layout());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".qa.local/overview-movable.png", fullPage: true });

  // Isolated model checks for dense mixed-size layouts and corrupt preferences.
  const result = await page.evaluate(async () => {
    const { arrangeTiles } = await import("/src/shell/ui/tileLayout.ts");
    const tiles = Array.from({ length: 24 }, (_, i) => ({ id: String(i), size: { w: 2 + i % 7, h: 2 + i % 8 } }));
    const positions = arrangeTiles(tiles, {});
    const next = arrangeTiles(tiles, positions, { id: "15", position: { col: 3, row: 2 } });
    return tiles.map(tile => ({ name: tile.id, ...next[tile.id], ...tile.size }));
  });
  noCollisions(result);
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ daily_plan: { col: -100, row: 0 }, notes: { col: "2", row: 9 }, project_board: { col: 99, row: null } }));
    localStorage.setItem("axiom.tileSizes", JSON.stringify({ daily_plan: { w: -3, h: 999 }, notes: { w: null, h: 2 } }));
  }, positionsKey);
  await page.reload();
  assert.deepEqual(await layout(), initial, "Invalid saved coordinates/sizes recover safely");
  await place("Daily Plan", 5, 3, true, "touch");
  assert.equal((await layout()).find(t => t.name === "Daily Plan").row, 3);
  noCollisions(await layout());
  // A press alone cannot scroll/move a handle near the viewport edge.
  await page.evaluate(key => localStorage.removeItem(key), positionsKey);
  await page.reload();
  await page.setViewportSize({ width: 1100, height: 500 });
  const startRect = await page.getByRole("button", { name: "Move Daily Plan", exact: true }).boundingBox();
  await page.mouse.move(startRect.x + 10, startRect.y + 10); await page.mouse.down();
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".main").evaluate(el => el.scrollTop), 0);
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.move(startRect.x + 10, 488, { steps: 8 });
  await page.waitForFunction(() => document.querySelector(".main").scrollTop > 30);
  await page.mouse.up();
  noCollisions(await layout());
  assert.ok((await layout()).find(t => t.name === "Daily Plan").row > 3, "Drag auto-scrolls below the fold");
  await page.locator(".main").evaluate(el => el.scrollTop = 0);
  const boardRect = await page.getByRole("button", { name: "Move Project Board", exact: true }).boundingBox();
  await page.mouse.move(boardRect.x + 10, boardRect.y + 10); await page.mouse.down();
  await page.mouse.move(boardRect.x + 110, boardRect.y + 74);
  const savedBeforeCancel = await page.evaluate(key => localStorage.getItem(key), positionsKey);
  await page.getByRole("button", { name: "Move Project Board", exact: true }).evaluate(el =>
    el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, isPrimary: true })));
  await page.mouse.up();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), positionsKey), savedBeforeCancel);
  assert.equal(await page.locator("html").evaluate(el => el.classList.contains("is-moving")), false, "Pointer cancellation clears drag state");
  await page.mouse.move(boardRect.x + 10, boardRect.y + 10); await page.mouse.down();
  await page.mouse.move(boardRect.x + 110, boardRect.y + 74);
  await page.getByRole("button", { name: "Toggle Overview" }).evaluate(el => el.click());
  await page.mouse.up();
  assert.equal(await page.locator("html").evaluate(el => el.classList.contains("is-moving")), false, "Unmount clears drag state");
  await page.getByRole("button", { name: "Toggle Overview" }).click();
  noCollisions(await layout());
  assert.deepEqual(errors, []);
  console.log("PASS: mouse and touch pointers, keyboard, snap/clamp, collisions, resize, persistence, cancellation, reinstallation, narrow windows and invalid settings");
} finally { await browser.close(); }
