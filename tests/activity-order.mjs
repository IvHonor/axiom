import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const bar = page.locator(".activitybar");
const item = name => bar.getByRole("button", { name, exact: true });
const order = () => bar.locator(".activity-sortable").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
const key = "axiom.activityOrder.v1";
try {
  await page.goto(process.env.ACTIVITY_ORDER_TEST_URL || "http://localhost:1427/tests/overview-visibility-preview.html");
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await item("University").waitFor();
  const original = await order();
  for (const fixed of ["Areas (Ctrl+B)", "Extensions (Ctrl+Shift+X)", "Admin", "Account", "Themes (Ctrl+K Ctrl+T)"]) {
    assert.equal(await item(fixed).evaluate(node => node.classList.contains("activity-sortable")), false, fixed + " stays fixed");
  }
  const start = await item("University").boundingBox(), target = await item(original[0]).boundingBox();
  await page.mouse.move(start.x + 19, start.y + 19); await page.mouse.down();
  await page.mouse.move(start.x + 19, start.y + 10, { steps: 3 });
  await page.mouse.move(target.x + 19, target.y + 19, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.activity-sortable').getAttribute('aria-label') === 'University');
  const moved = await order();
  assert.equal(await item("University").getAttribute("aria-pressed"), "false", "Dragging does not open the sidebar");
  await page.reload(); assert.deepEqual(await order(), moved, "Order survives reload");

  await item("University").focus(); await page.keyboard.press("Space");
  await page.locator(".activity-sortable.is-dragging").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelectorAll('.activity-sortable')[1]?.getAttribute('aria-label') === 'University');
  assert.equal((await order())[1], "University", "Keyboard sorting works");
  const saved = await page.evaluate(key => localStorage.getItem(key), key);
  await item("University").focus(); await page.keyboard.press("Space"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved, "Escape does not persist a preview");

  await item("University").click();
  assert.equal(await item("University").getAttribute("aria-pressed"), "true", "A normal click still opens the sidebar");
  await item("University").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide from overview", exact: true }).click();
  assert.ok(await item("University").locator(".activity-hidden").count(), "Context menu is preserved");
  const beforeDisable = await order();
  await page.evaluate(() => localStorage.setItem("axiom.disabled", JSON.stringify(["uni"]))); await page.reload();
  assert.ok(!(await order()).includes("University"));
  await page.evaluate(() => localStorage.setItem("axiom.disabled", "[]")); await page.reload();
  assert.deepEqual(await order(), beforeDisable, "Re-enabling restores the saved slot");

  await page.evaluate(key => localStorage.setItem(key, JSON.stringify([null, 42, "admin", "areas", "area:uni", "area:uni", "area:missing"])), key);
  await page.reload();
  assert.equal((await order())[0], "University");
  assert.equal((await order()).length, original.length, "Invalid preferences do not remove or duplicate icons");
  await item("Admin").click(); assert.equal(await page.getByTestId("opened").textContent(), "admin");
  await page.evaluate(async () => {
    const { EXTENSIONS } = await import('/src/extensions/index.ts');
    EXTENSIONS.find(ext => ext.id === 'uni').required = true;
  });
  await item("Areas (Ctrl+B)").click();
  assert.equal(await item("University").evaluate(node => node.classList.contains("activity-sortable")), false, "Required extensions cannot be dragged");
  assert.deepEqual(errors, []);
  console.log("PASS: pointer/keyboard ordering, reload, cancellation, fixed controls, normal clicks, context menus, disabled slots and corrupt preferences");
} finally { await browser.close(); }
