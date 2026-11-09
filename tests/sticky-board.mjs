import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const url = process.env.STICKY_BOARD_TEST_URL || "http://localhost:1427/tests/sticky-board-preview.html";
const key = "axiom.notes.board.v1";
const card = id => page.locator(`.nt-board-slot[data-note-id="${id}"]`);
const position = id => card(id).evaluate(node => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top), z: +node.style.zIndex }));
const xy = async id => { const { x, y } = await position(id); return { x, y }; };
const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function move(id, dx, dy, finish = true) {
  const handle = card(id).locator(".nt-board-move");
  await handle.scrollIntoViewIfNeeded();
  const rect = await handle.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2 + dy, { steps: 8 });
  if (finish) await page.mouse.up();
}
try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await card("note-8").waitFor();
  await page.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)) || {}).length === 8, key);
  const original = await saved();
  await move("note-1", 83, 67);
  assert.deepEqual(await xy("note-1"), { x: original["note-1"].x + 83, y: original["note-1"].y + 67 });
  assert.deepEqual(await xy("note-2"), { x: original["note-2"].x, y: original["note-2"].y });
  // Stack a note partly over another, without grid snapping or collision displacement.
  const first = await xy("note-1"), second = await xy("note-2");
  await move("note-1", second.x - first.x - 35, second.y - first.y + 50);
  const stacked = await xy("note-1");
  assert.deepEqual(stacked, { x: second.x - 35, y: second.y + 50 });
  assert.ok((await position("note-1")).z > (await position("note-2")).z);
  await card("note-2").locator(".nt-board-move").click();
  assert.ok((await position("note-2")).z > (await position("note-1")).z);
  await mkdir(".qa.local/sticky-board", { recursive: true });
  await page.screenshot({ path: ".qa.local/sticky-board/stacked.png" });
  const persisted = await saved();
  await page.reload({ waitUntil: "domcontentloaded" }); await card("note-8").waitFor();
  assert.deepEqual(await saved(), persisted);
  assert.deepEqual(await xy("note-1"), stacked);
  console.log("PASS: free dragging, overlap, selection order, unchanged neighbours and reload persistence");

  const handle = card("note-1").locator(".nt-board-move");
  await handle.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+ArrowDown");
  assert.deepEqual(await xy("note-1"), { x: stacked.x + 10, y: stacked.y + 1 });
  const beforeCancel = await xy("note-1");
  await move("note-1", 90, 70, false);
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.deepEqual(await xy("note-1"), beforeCancel);
  assert.equal(await page.locator(".nt-board-slot.is-moving").count(), 0);
  await move("note-1", 50, 50, false);
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.mouse.up();
  assert.deepEqual(await xy("note-1"), beforeCancel);
  console.log("PASS: keyboard precision and cancellation with Escape or window blur");

  const beforeEdit = await xy("note-1");
  const editor = card("note-1").locator("[contenteditable=true]");
  await editor.fill("A note I can still edit");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("fixture.sticky-notes"))?.find(d => d.note.id === "note-1").note.text.includes("still edit"));
  assert.deepEqual(await xy("note-1"), beforeEdit);
  await card("note-1").getByRole("button", { name: "Colour", exact: true }).click();
  await card("note-1").getByRole("radio", { name: "Pink", exact: true }).click();
  assert.deepEqual(await xy("note-1"), beforeEdit);
  const overview = card("note-1").getByRole("button", { name: "Show on your overview", exact: true });
  await overview.click(); assert.equal(await overview.getAttribute("aria-pressed"), "false");
  await page.getByRole("button", { name: "New sticky note", exact: true }).click();
  await card("note-9").waitFor();
  assert.deepEqual(await xy("note-1"), beforeEdit);
  // New sticky notes stay off the overview unless that's been switched on.
  const onOverview = id => page.evaluate(id => JSON.parse(localStorage.getItem("fixture.sticky-notes")).find(d => d.note.id === id).note.onOverview, id);
  assert.equal(await onOverview("note-9"), false, "a new sticky note isn't put on the overview");
  await page.getByRole("switch", { name: "Put new sticky notes on my overview" }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("axiom.notes.stickyToOverview")), "true");
  await page.getByRole("button", { name: "New yellow sticky note", exact: true }).click();
  await card("note-10").waitFor();
  assert.equal(await onOverview("note-10"), true, "switched on, new ones go on the overview");
  await page.getByRole("switch", { name: "Put new sticky notes on my overview" }).click();
  await card("note-10").getByRole("button", { name: "Sticky note options", exact: true }).click();
  await page.getByRole("button", { name: "Move to the trash", exact: true }).click();
  await card("note-10").waitFor({ state: "detached" });
  await card("note-9").getByRole("button", { name: "Sticky note options", exact: true }).click();
  await page.getByRole("button", { name: "Move to the trash", exact: true }).click();
  await card("note-9").waitFor({ state: "detached" });
  assert.deepEqual(await xy("note-1"), beforeEdit);
  await page.reload({ waitUntil: "domcontentloaded" }); await card("note-1").waitFor();
  await card("note-1").locator("[contenteditable=true]").getByText("A note I can still edit", { exact: true }).waitFor();
  console.log("PASS: editing and saving text, colour, overview toggle, new notes and trash preserve positions");

  // Resizing from the corner: bigger, not smaller than the least, Escape cancels, the keyboard
  // resizes, and the size survives a reload and a move.
  const size = id => card(id).evaluate(node => ({ w: node.offsetWidth, h: node.offsetHeight }));
  const corner = async id => {
    await card(id).hover();
    const grip = card(id).locator(".nt-board-resize");
    await grip.scrollIntoViewIfNeeded();
    const box = await grip.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, grip };
  };
  const pull = async (id, dx, dy, cancel = false) => {
    const { x, y } = await corner(id);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  // Note 6: nothing has been stacked over it.
  const placeBefore = await xy("note-6");
  assert.deepEqual(await size("note-6"), { w: 240, h: 240 });
  await pull("note-6", 100, 60);
  assert.deepEqual(await size("note-6"), { w: 340, h: 300 });
  assert.deepEqual(await xy("note-6"), placeBefore, "resizing doesn't move it");
  assert.deepEqual((await saved())["note-6"].w, 340);
  await pull("note-6", -600, -600);
  assert.deepEqual(await size("note-6"), { w: 160, h: 160 }, "no smaller than the least");
  await pull("note-6", 200, 200, true);
  assert.deepEqual(await size("note-6"), { w: 160, h: 160 }, "Escape cancels a resize");
  const { grip } = await corner("note-6");
  await grip.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+ArrowDown");
  assert.deepEqual(await size("note-6"), { w: 170, h: 161 }, "arrow keys resize");
  await page.reload({ waitUntil: "domcontentloaded" }); await card("note-6").waitFor();
  assert.deepEqual(await size("note-6"), { w: 170, h: 161 }, "the size is kept");
  await move("note-6", 40, 30);
  assert.deepEqual(await size("note-6"), { w: 170, h: 161 }, "moving keeps the size");
  await page.screenshot({ path: ".qa.local/sticky-board/resized.png" });
  console.log("PASS: resizing from the corner, its limits, Escape, the keyboard, and keeping the size");

  const beforeScroll = await xy("note-1");
  await move("note-1", 60, 0, false);
  const boardBounds = await page.locator(".nt-board").boundingBox();
  await page.mouse.move(boardBounds.x + boardBounds.width - 5, boardBounds.y + 100);
  await page.waitForFunction(() => document.querySelector(".nt-board").scrollLeft > 30);
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.deepEqual(await xy("note-1"), beforeScroll);
  assert.equal(await page.locator(".nt-board").evaluate(node => node.scrollLeft), 0);
  console.log("PASS: dragging at the canvas edge scrolls and cancellation restores the viewport");

  // Touch uses the same pointer handlers; native capture is unnecessary for these synthetic events.
  const beforeTouch = await xy("note-1");
  await card("note-1").locator(".nt-board-move").evaluate(button => {
    const slot = button.closest(".nt-board-slot"), capture = slot.setPointerCapture;
    slot.setPointerCapture = () => {};
    const rect = button.getBoundingClientRect();
    const init = { bubbles: true, pointerId: 22, pointerType: "touch", isPrimary: true, button: 0, clientX: rect.x + 10, clientY: rect.y + 10 };
    button.dispatchEvent(new PointerEvent("pointerdown", init));
    slot.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: init.clientX + 37, clientY: init.clientY + 29 }));
    slot.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: init.clientX + 37, clientY: init.clientY + 29 }));
    slot.setPointerCapture = capture;
  });
  assert.deepEqual(await xy("note-1"), { x: beforeTouch.x + 37, y: beforeTouch.y + 29 });
  await move("note-1", -2000, -2000);
  assert.deepEqual(await xy("note-1"), { x: 16, y: 16 });
  await page.setViewportSize({ width: 420, height: 780 });
  await page.goto(url + "?light", { waitUntil: "domcontentloaded" }); await card("note-8").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await card("note-8").locator(".nt-board-move").scrollIntoViewIfNeeded();
  assert.ok(await page.locator(".nt-board").evaluate(node => node.scrollLeft > 0 || node.scrollTop > 0));
  await page.screenshot({ path: ".qa.local/sticky-board/narrow.png" });
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ "note-1": { x: -100, y: 20, z: 1 }, "note-2": { x: "bad", y: 0, z: 0 } })), key);
  await page.reload({ waitUntil: "domcontentloaded" }); await card("note-8").waitFor();
  assert.equal((await xy("note-1")).x, 16);
  assert.ok(Number.isFinite((await xy("note-2")).x));
  assert.deepEqual(errors, []);
  console.log("PASS: touch pointer movement, board boundaries, narrow layout, scrolling and invalid saved positions");
} finally { await browser.close(); }
