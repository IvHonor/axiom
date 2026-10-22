// Run against `npm run dev -- --port 1427`; requires Playwright and Chromium.
// PLAYWRIGHT_MODULE may point to an existing Playwright index.mjs installation.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = process.env.OVERVIEW_TEST_URL || "http://localhost:1427/tests/overview-preview.html";
await mkdir(".qa.local", { recursive: true });
await page.clock.install({ time: new Date("2026-10-22T14:15:00+01:00") });

async function open(w, h, query = "") {
  await page.goto(`${base}?w=${w}&h=${h}${query}`);
  await page.locator(".dp-ov-root").waitFor();
  await page.waitForTimeout(100);
}
async function noOverflow(label) {
  const overflow = await page.locator(".tile-fitted").evaluate((tile) => {
    const nodes = [...tile.querySelectorAll(".panel-body, .dp-ov-root, .dp-ov-content, .dp-ov-list, .dp-ov-calendar, .dp-ov-range")];
    return nodes.filter((node) => node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2)
      .map((node) => ({ className: node.className, width: node.clientWidth, scrollWidth: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight }));
  });
  assert.deepEqual(overflow, [], `${label}: content exceeds the tile`);
  const scrollbars = await page.locator(".tile-fitted").evaluate((tile) => [...tile.querySelectorAll("*")].filter((node) => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight).map((node) => node.className));
  assert.deepEqual(scrollbars, [], `${label}: nested scrollbar`);
}
async function select(name) {
  await page.getByRole("button", { name: "Daily Plan display options", exact: true }).click({ button: "right" });
  await page.getByRole("radio", { name, exact: false }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
}
try {
  for (const [w, h] of [[2, 2], [3, 3], [4, 4], [8, 5], [4, 9], [8, 9], [12, 16]]) {
    await open(w, h);
    await noOverflow(`${w}x${h} auto`);
    console.log(`${w}x${h}: ${await page.locator(".dp-ov-root").getAttribute("data-view")}`);
    await page.screenshot({ path: `.qa.local/overview-${w}x${h}.png` });
  }
  await open(8, 9);
  for (const name of ["At a glance", "Now & next", "Today's agenda", "Task list", "Top priorities", "Daily progress", "Day strip", "Fitted timeline", "Schedule + tasks", "Week overview", "Month overview"]) {
    await select(name);
    if (name === "Week overview" || name === "Month overview") await page.locator(".dp-ov-range-day").first().waitFor();
    await noOverflow(name);
    await page.screenshot({ path: `.qa.local/${name.replace(/[^a-z]+/gi, "-")}.png` });
  }
  await open(3, 3);
  await page.getByRole("button", { name: "Daily Plan display options", exact: true }).click({ button: "right" });
  assert.equal(await page.getByRole("radio", { name: "Fitted timeline", exact: false }).isDisabled(), true);
  await page.getByRole("radio", { name: "Task list", exact: false }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".dp-ov-root").getAttribute("data-view"), "tasks");
  await noOverflow("3x3 tasks");
  const first = await page.locator(".dp-ov-row-text").first().textContent();
  await page.getByRole("button", { name: "Next tasks page" }).click();
  assert.notEqual(await page.locator(".dp-ov-row-text").first().textContent(), first);
  await page.reload(); await page.locator(".dp-ov-root[data-view=tasks]").waitFor();
  await page.getByRole("checkbox").first().click();
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator(".dp-ov-row-text").first().textContent(), first);
  await noOverflow("task completion");
  await open(4, 4);
  assert.equal(await page.locator(".dp-ov-root").getAttribute("data-view"), "agenda", "A 3x3 preference must not change 4x4");
  await open(8, 9, "&theme=light&empty=true");
  await select("Schedule + tasks"); await noOverflow("empty light theme");
  await open(8, 9, "&edge=true");
  await noOverflow("overlaps and midnight");
  await select("Fitted timeline");
  const clipped = await page.locator(".dp-ov-calendar-events").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll(".dp-ov-calendar-event")].filter((event) => {
      const block = event.getBoundingClientRect();
      return block.bottom > rect.bottom + 1 || block.top < rect.top - 1 || block.height < 18;
    }).map((event) => event.getAttribute("aria-label"));
  });
  assert.deepEqual(clipped, [], "Short events at midnight must remain visible");
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator(".dp-ov-root").getAttribute("data-view"), "timeline", "Narrow viewport must fall back");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(120);
  assert.equal(await page.locator(".dp-ov-root").getAttribute("data-view"), "timeline", "Saved view must restore when space returns");
  for (const [w, h] of [[3, 3], [4, 4], [8, 5], [4, 9], [6, 7], [8, 9]]) {
    await open(w, h);
    await page.getByRole("button", { name: "Daily Plan display options", exact: true }).click();
    await page.getByLabel("List density", { exact: true }).selectOption("comfortable");
    const available = await page.getByRole("radio").evaluateAll((radios) => radios.filter((r) => !r.disabled).map((r) => r.getAttribute("aria-label")));
    await page.keyboard.press("Escape");
    for (const name of available) {
      await select(name);
      if (/Week|Month/.test(name)) await page.locator(".dp-ov-range-day").first().waitFor();
      await noOverflow(`${w}x${h} ${name}, comfortable`);
    }
  }
  console.log("PASS: every available view at six tile sizes with comfortable density");
  // Sweep the actual grid limits at several viewport widths. Preferences are reset
  // to Auto so this checks resizing rather than the preceding manual selections.
  await page.evaluate(() => localStorage.removeItem("axiom.dailyPlan.overviewLayouts.v2"));
  for (const viewport of [700, 1100, 1440]) {
    await page.setViewportSize({ width: viewport, height: 1100 });
    await open(4, 4);
    for (const w of [2, 3, 4, 6, 8, 12]) {
      for (const h of [2, 3, 4, 5, 8, 9, 16]) {
        await page.getByLabel("Grid width", { exact: true }).fill(String(w));
        await page.getByLabel("Grid height", { exact: true }).fill(String(h));
        await page.waitForTimeout(40);
        await noOverflow(`${viewport}px, ${w}x${h} auto`);
      }
    }
    console.log(`PASS: 42 tile sizes at ${viewport}px`);
  }
  assert.deepEqual(errors, [], "Browser errors");
  console.log("PASS: sizes, all 11 views, overflow, paging, completion, persistence, theme, empty state and resize fallback");
} finally { await browser.close(); }
