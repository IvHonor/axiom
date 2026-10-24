import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = process.env.OVERVIEW_VISIBILITY_TEST_URL || "http://localhost:1427/tests/overview-visibility-preview.html";
const hiddenKey = "axiom.overview.hidden.v1";
const installed = ["daily_plan", "project_board", "reading", "uni", "ember_themes"];
const cells = page.locator(".tile-cell");
const area = name => page.locator(".sidebar .nav-item").filter({hasText: name});
const icon = name => page.locator(".activitybar").getByRole("button", {name, exact: true});
const hidden = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), hiddenKey);
const menuItem = name => page.getByRole("menuitem", {name, exact: true});
await mkdir(".qa.local", {recursive: true});
try {
  await page.goto(base);
  await page.evaluate(ids => {
    localStorage.clear(); localStorage.setItem("axiom.installed", JSON.stringify(ids));
    localStorage.setItem("axiom.tilePositions.v1", JSON.stringify({daily_plan: {col: 1, row: 1}, project_board: {col: 5, row: 1}, reading: {col: 9, row: 1}, uni: {col: 1, row: 6}}));
    localStorage.setItem("axiom.tileSizes", JSON.stringify({reading: {w: 3, h: 5}}));
  }, installed);
  await page.reload(); await cells.nth(3).waitFor();
  const savedPositions = await page.evaluate(() => localStorage.getItem("axiom.tilePositions.v1"));
  const reading = cells.filter({hasText: "Reading Tracker"});
  const readingStyle = await reading.getAttribute("style");
  await reading.locator(".panel-body").click({button: "right"});
  await menuItem("Hide from overview").click();
  assert.equal(await cells.count(), 3);
  assert.deepEqual(await hidden(), ["reading"]);
  assert.equal(await icon("Reading Tracker").count(), 1);
  assert.equal(await area("Reading Tracker").locator(".nav-hidden").count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("axiom.tilePositions.v1")), savedPositions);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.installed"))), installed);
  await page.reload(); await cells.nth(2).waitFor(); assert.equal(await cells.count(), 3);
  await icon("Reading Tracker").click({button: "right"});
  await menuItem("Unhide on overview").click();
  assert.equal(await cells.count(), 4); assert.deepEqual(await hidden(), []);
  assert.equal(await reading.getAttribute("style"), readingStyle);
  await area("Daily Plan").click({button: "right"}); await menuItem("Hide from overview").click();
  await area("Daily Plan").click(); assert.equal(await page.getByTestId("opened").textContent(), "daily_plan");
  await area("Daily Plan").click({button: "right"}); await menuItem("Unhide on overview").click();
  console.log("PASS: overview, icon and area menus; persistence; hidden areas stay accessible; installation and positions preserved");

  await icon("Extensions (Ctrl+Shift+X)").click();
  const card = name => page.locator(".ext-item").filter({has: page.locator(".ext-name", {hasText: name})});
  await card("Project Board").locator(".ext-main").click({button: "right"}); await menuItem("Hide from overview").click();
  await card("Project Board").locator(".ext-main").click({button: "right"}); await menuItem("Uninstall").click();
  assert.equal(await icon("Project Board").count(), 0);
  assert.deepEqual(await hidden(), ["project_board"]);
  await card("Project Board").getByRole("button", {name: "Install", exact: true}).click();
  assert.equal(await icon("Project Board").count(), 1); assert.equal(await cells.count(), 3);
  await card("Project Board").locator(".ext-main").click({button: "right"}); await menuItem("Unhide on overview").click();
  await card("Ember").locator(".ext-main").click({button: "right"}); assert.equal(await menuItem("Hide from overview").count(), 0); await page.keyboard.press("Escape");
  await card("Finance").locator(".ext-main").click({button: "right"}); assert.equal(await menuItem("Hide from overview").count(), 0); await page.keyboard.press("Escape");
  await page.locator(".sidebar-body").evaluate(node => node.scrollTop = 0);
  await page.screenshot({path: ".qa.local/extension-text-hierarchy.png"});
  for (const name of ["Daily Plan", "Project Board", "Reading Tracker", "University"]) {
    await icon(name).click({button: "right"}); await menuItem("Hide from overview").click();
  }
  assert.equal(await cells.count(), 0); await page.getByText("Your overview is clear", {exact: true}).waitFor();
  await page.getByRole("button", {name: "Show all areas", exact: true}).click();
  assert.equal(await cells.count(), 4); assert.deepEqual(await hidden(), []);
  console.log("PASS: installed-area-only controls and restore-all when every tile is hidden");

  await icon("Areas (Ctrl+B)").click();
  await area("Reading Tracker").focus(); await page.keyboard.press("Shift+F10");
  await menuItem("Hide from overview").waitFor();
  await page.keyboard.press("End"); assert.equal(await menuItem("Hide from overview").evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Home"); assert.equal(await menuItem("Open").evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("ArrowUp"); assert.equal(await menuItem("Hide from overview").evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(), 0);
  assert.equal(await area("Reading Tracker").evaluate(node => node === document.activeElement), true);
  await page.setViewportSize({width: 700, height: 500});
  await icon("Reading Tracker").click({button: "right"});
  const bounds = await page.getByRole("menu").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 700 && bounds.y + bounds.height <= 500);
  await page.keyboard.press("Escape");
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify([null, 3, "reading", "reading"])), hiddenKey);
  await page.reload(); await cells.nth(2).waitFor(); assert.deepEqual(await hidden(), ["reading"]);
  await page.evaluate(key => localStorage.setItem(key, "{broken json"), hiddenKey);
  await page.reload(); await cells.nth(3).waitFor(); assert.deepEqual(await hidden(), []);
  await icon("Extensions (Ctrl+Shift+X)").click();
  const themes = await page.evaluate(async () => (await import("/src/extensions/index.ts")).EXTENSIONS.flatMap(ext => ext.themes || []));
  for (const theme of themes) {
    await page.evaluate(async theme => { (await import("/src/shell/theme/applyTheme.ts")).applyTheme(theme); await document.fonts.ready; }, theme);
    const issues = await page.locator(".ext-item").evaluateAll(nodes => nodes.flatMap(node => {
      const text = node.querySelector(".ext-text"), desc = node.querySelector(".ext-desc");
      return text.scrollWidth > text.clientWidth + 1 || desc.scrollWidth > desc.clientWidth + 1 ? [node.querySelector(".ext-name").textContent] : [];
    }));
    assert.deepEqual(issues, [], `${theme.id} extension text fits`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: keyboard invocation/navigation/focus, menu bounds, invalid saved preferences and extension text across ${themes.length} themes`);
} finally { await browser.close(); }
