// The sidebar keeps up: an area brings its own sidebar and the overview the
// list of areas; each area remembers whether you left it open; pinned, it
// stays; closed, an icon's panel peeks out over the page; its edge drags to
// resize (double-click for the usual width); Ctrl+P jumps anywhere; Recent
// lists what was opened lately; badges show what's waiting; and it tucks
// itself away for a narrow window or an area that needs room, coming back
// after (but not from under the pointer, and not if you overrule it).
// Run against Vite on port 1427: node tests/sidebar.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const url = process.env.SIDEBAR_TEST_URL || "http://localhost:1427/tests/sidebar-preview.html";
await mkdir(".qa.local", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}?reviews`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Which sidebar's showing (an area's is labelled with its name), or none.
  const shown = () => page.evaluate(() => {
    const frame = document.querySelector(".sidebar-frame.is-open .sidebar");
    return frame ? frame.getAttribute("aria-label") ?? frame.querySelector(".sidebar-head")?.textContent : null;
  });
  const until = (want) => page.waitForFunction((w) => {
    const frame = document.querySelector(".sidebar-frame.is-open .sidebar");
    const now = frame ? frame.getAttribute("aria-label") ?? frame.querySelector(".sidebar-head")?.textContent : null;
    return now === w;
  }, want, { timeout: 8000 });
  const areasNav = (name) => page.locator(".sidebar-frame .nav-item", { hasText: name }).first();
  await until("Areas");

  // Badges: Learning's reviews due, on its icon.
  await page.locator(".activity[aria-label='Learning'] .activity-count", { hasText: "3" }).waitFor();
  assert.match(await page.locator(".activity[aria-label='Learning']").getAttribute("title"), /3 reviews due/);

  // Following: an area brings its own sidebar; the overview, the list.
  await areasNav("Birthdays").click();
  await until("Birthdays");
  await page.screenshot({ path: ".qa.local/sidebar-follows.png" });
  await page.locator(".tab", { hasText: "Overview" }).first().click();
  await until("Areas");
  // An area's icon opens the area too.
  await page.locator(".activity[aria-label='Goals']").click();
  await until("Goals");
  await page.locator(".tab", { hasText: "Goals" }).first().waitFor();

  // Remembered per area: closed in Goals (Ctrl+B), Goals opens without it; Birthdays still with.
  await page.keyboard.press("Control+b");
  await until(null);
  await page.locator(".activity[aria-label^='Areas']").first().click();
  await until("Areas");
  await areasNav("Birthdays").click();
  await until("Birthdays");
  await page.locator(".tab", { hasText: "Goals" }).first().click();
  await until(null);
  // Closed, switching tabs never brings it out, even to an area that had it open.
  await page.locator(".tab", { hasText: "Birthdays" }).first().click();
  await page.waitForTimeout(500);
  assert.equal(await shown(), null, "switching tabs doesn't open the sidebar");

  // Peeking: with it closed, pointing at an icon slides its panel out; away, it goes.
  await page.locator(".activity[aria-label='Finance']").hover();
  await page.locator(".sidebar-peek .sidebar[aria-label='Finance']").waitFor();
  await page.screenshot({ path: ".qa.local/sidebar-peek.png" });
  await page.mouse.move(900, 500);
  await page.locator(".sidebar-peek").waitFor({ state: "detached" });

  // Pinned: it keeps what it shows.
  await page.locator(".activity[aria-label^='Areas']").first().click();
  await until("Areas");
  await page.locator(".sidebar-frame-content").hover();
  await page.getByRole("button", { name: "Pin the sidebar" }).click();
  await areasNav("Journal").click();
  await page.locator(".tab", { hasText: "Journal" }).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await shown(), "Areas", "pinned, it stays");
  await page.getByRole("button", { name: "Unpin the sidebar" }).click();
  await until("Journal");

  // Resizing: drag the edge wider; double-click for the usual width.
  const edge = await page.locator(".sidebar-resize").boundingBox();
  await page.mouse.move(edge.x + 3, edge.y + 200);
  await page.mouse.down();
  await page.mouse.move(edge.x + 103, edge.y + 200, { steps: 6 });
  await page.mouse.up();
  const wide = await page.evaluate(() => document.querySelector(".sidebar-frame").getBoundingClientRect().width);
  assert.ok(Math.abs(wide - 400) < 6, `dragged to about 400px (${wide})`);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.sidebar.width"))), 400);
  await page.locator(".sidebar-resize").dblclick();
  await page.waitForFunction(() => Math.abs(document.querySelector(".sidebar-frame").getBoundingClientRect().width - 300) < 2);

  // Ctrl+P: a few letters, Enter, and there.
  await page.keyboard.press("Control+p");
  await page.getByRole("textbox", { name: "Go to" }).fill("rdg");
  await page.screenshot({ path: ".qa.local/sidebar-switcher.png" });
  await page.keyboard.press("Enter");
  await page.locator(".tab", { hasText: "Reading" }).first().waitFor();
  await until("Reading Tracker");

  // Recent: what was opened lately, up top of the list of areas.
  await page.locator(".tab", { hasText: "Overview" }).first().click();
  await until("Areas");
  const recent = await page.locator(".sidebar-frame .section", { hasText: "Recent" }).locator(".nav-item").allInnerTexts();
  assert.deepEqual(recent, ["Reading Tracker", "Journal", "Goals"]);
  await page.screenshot({ path: ".qa.local/sidebar-recent.png" });

  // Tucking away: an area that needs the room (the board), and back after.
  await page.mouse.move(900, 500);
  await areasNav("Project Board").click();
  await page.mouse.move(900, 500);
  await until(null);
  await page.locator(".tab", { hasText: "Overview" }).first().click();
  await until("Areas");
  // A narrow window: tucked away; wide again, back.
  await page.setViewportSize({ width: 1000, height: 860 });
  await until(null);
  await page.screenshot({ path: ".qa.local/sidebar-narrow.png" });
  await page.setViewportSize({ width: 1400, height: 860 });
  await until("Areas");
  // Overruled (opened anyway while narrow): it's left open.
  await page.setViewportSize({ width: 1000, height: 860 });
  await until(null);
  await page.keyboard.press("Control+b");
  await until("Areas");
  await page.mouse.move(900, 500);
  await page.waitForTimeout(2600);
  assert.equal(await shown(), "Areas", "opened anyway: it stays");
  await page.setViewportSize({ width: 1400, height: 860 });

  // Its settings: switch tucking away for a narrow window off.
  await page.locator(".sidebar-frame-content").hover();
  await page.getByRole("button", { name: "Sidebar settings" }).click();
  await page.getByRole("switch", { name: "Hide when the window is narrow" }).click();
  await page.screenshot({ path: ".qa.local/sidebar-settings.png" });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.sidebar.prefs")).narrow), false);
  await page.keyboard.press("Escape");
  await page.mouse.move(900, 500);
  await page.setViewportSize({ width: 1000, height: 860 });
  await page.waitForTimeout(2600);
  assert.equal(await shown(), "Areas", "switched off: it stays when narrow");

  assert.deepEqual(errors, []);
  console.log("PASS: following, each area remembering, the icon opening its area, peeking, pinning, resizing, Ctrl+P, Recent, badges, tucking away (room, narrow), overruling and its settings");
} finally {
  await browser.close();
}
