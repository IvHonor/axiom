import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(30000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const tab = label => page.getByRole("tab").filter({ has: page.locator(".tab-label", { hasText: new RegExp(`^${label}$`) }) });
const order = () => page.locator(".tab-label").allTextContents();
const expectOrder = async expected => {
  try {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll(".tab-label")].map(node => node.textContent)) === JSON.stringify(expected), expected);
  } catch {
    assert.deepEqual(await order(), expected);
  }
};
const settle = () => page.evaluate(async () => {
  await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const active = () => page.getByTestId("active").textContent();
const saved = () => page.evaluate(() => localStorage.getItem("axiom.tabs"));
const drag = async (source, target, cancel = false) => {
  const start = await tab(source).boundingBox(), end = await tab(target).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + 18);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 8, start.y + 18, { steps: 2 });
  await page.mouse.move(end.x + end.width / 2, end.y + 18, { steps: 15 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.locator(".tab.is-dragging").waitFor({ state: "detached" });
  await settle();
};
try {
  await page.goto(process.env.TAB_ORDER_TEST_URL || "http://localhost:1427/tests/tab-order-preview.html");
  await page.evaluate(() => {
    localStorage.clear();
    // An existing installation's saved tabs have no Overview entry.
    localStorage.setItem("axiom.tabs", JSON.stringify([{ kind: "extension", id: "reading" }, { kind: "assistant" }, { kind: "admin" }]));
    localStorage.setItem("axiom.activeTab", JSON.stringify({ kind: "assistant" }));
  });
  await page.reload();
  await expectOrder(["Overview", "Reading Tracker", "Lemma", "Admin"]);
  await drag("Admin", "Reading Tracker");
  await expectOrder(["Overview", "Admin", "Reading Tracker", "Lemma"]);
  assert.equal(await active(), "assistant", "Dragging an inactive tab preserves the selected page");
  await drag("Overview", "Lemma");
  await expectOrder(["Admin", "Reading Tracker", "Lemma", "Overview"]);
  const moved = await order();
  await page.reload();
  await expectOrder(moved);
  assert.equal(await active(), "assistant");
  const beforeCancel = await saved();
  await drag("Lemma", "Admin", true);
  assert.equal(await saved(), beforeCancel, "Escape cancels without persisting the temporary order");
  await expectOrder(moved);

  await tab("Lemma").focus(); await page.keyboard.press("Space");
  await page.locator(".tab.is-dragging").waitFor();
  await settle();
  await page.keyboard.press("ArrowLeft");
  await settle();
  await page.keyboard.press("Space");
  await expectOrder(["Admin", "Lemma", "Reading Tracker", "Overview"]);
  await settle();
  await tab("Lemma").focus(); await page.keyboard.press("Space");
  await page.locator(".tab.is-dragging").waitFor(); await settle();
  await page.keyboard.press("ArrowLeft"); await settle(); await page.keyboard.press("Escape");
  await expectOrder(["Admin", "Lemma", "Reading Tracker", "Overview"]);
  await tab("Reading Tracker").click(); assert.equal(await active(), "extension:reading");
  await tab("Admin").focus(); await page.keyboard.press("Enter"); assert.equal(await active(), "admin");
  await tab("Lemma").focus();
  await page.getByRole("button", { name: "Close Lemma", exact: true }).focus(); await page.keyboard.press("Space");
  await expectOrder(["Admin", "Reading Tracker", "Overview"]);
  assert.equal(await active(), "admin", "Closing an inactive tab does not select it");
  await page.getByRole("button", { name: "Open Lemma", exact: true }).click();
  await expectOrder(["Admin", "Reading Tracker", "Overview", "Lemma"]);
  await tab("Lemma").click({ button: "middle" });
  await expectOrder(["Admin", "Reading Tracker", "Overview"]);
  assert.equal(await active(), "overview", "Closing an active tab selects its reordered neighbor");
  await page.getByRole("button", { name: "Open Lemma", exact: true }).click();
  await page.getByRole("button", { name: "Close Lemma", exact: true }).click();
  await expectOrder(["Admin", "Reading Tracker", "Overview"]);
  await page.getByRole("button", { name: "Close active", exact: true }).click();
  await expectOrder(["Admin", "Reading Tracker", "Overview"]);

  await page.getByRole("button", { name: "Preview University", exact: true }).click();
  await drag("Extension: University", "Admin");
  await page.getByRole("button", { name: "Preview Reading", exact: true }).click();
  await expectOrder(["Extension: Reading Tracker", "Admin", "Reading Tracker", "Overview"]);
  await tab("Extension: Reading Tracker").dblclick();
  assert.equal(await page.locator(".tab.is-preview").count(), 0, "Double-click still keeps previews open");
  await page.getByRole("button", { name: "Disable Reading", exact: true }).click();
  await expectOrder(["Extension: Reading Tracker", "Admin", "Overview"]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await drag("Admin", "Overview");
  await expectOrder(["Extension: Reading Tracker", "Overview", "Admin"]);
  assert.equal(await tab("Admin").evaluate(node => getComputedStyle(node).transitionDuration), "0s");
  await page.evaluate(() => localStorage.setItem("axiom.tabs", JSON.stringify([null, 42, { kind: "assistant" }, { kind: "assistant" }, { kind: "extension", id: "missing" }])));
  await page.reload();
  await expectOrder(["Overview", "Lemma"]);

  await page.setViewportSize({ width: 700, height: 600 });
  await page.evaluate(() => localStorage.setItem("axiom.tabs", JSON.stringify([
    { kind: "overview" },
    ...["reading", "uni", "daily_plan", "project_board", "goals", "birthdays"].map(id => ({ kind: "extension-info", id })),
  ])));
  await page.reload(); await tab("Overview").waitFor();
  const crowded = await order(), beforeScroll = await saved();
  const first = await tab("Overview").boundingBox(), strip = await page.locator(".tabs").boundingBox();
  await page.mouse.move(first.x + 20, first.y + 18); await page.mouse.down();
  await page.mouse.move(strip.x + strip.width - 4, first.y + 18, { steps: 12 });
  assert.ok(strip.x + strip.width <= 700, "Crowded tabs stay within the window");
  await page.waitForFunction(() => document.querySelector(".tabs").scrollLeft > 0);
  await page.keyboard.press("Escape"); await page.mouse.up(); await settle();
  await expectOrder(crowded);
  assert.equal(await saved(), beforeScroll, "Overflow auto-scroll and cancellation preserve saved order");
  assert.deepEqual(errors, []);
  console.log("PASS: tab dragging, Overview movement, keyboard sorting, cancellation, persistence/migration, selection, closing, previews, reduced motion and overflow auto-scroll");
} finally { await browser.close(); }
