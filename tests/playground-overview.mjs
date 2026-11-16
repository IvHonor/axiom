import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = "http://localhost:1427/tests/playground-tile-preview.html";
await mkdir(".qa.local/playground-overview", { recursive: true });
async function open(query) {
  await page.goto(`${base}?${query}`);
  await page.locator(".pg-ov").first().waitFor();
  await page.waitForFunction(() => !document.querySelector(".pg-ov-wait"));
}
async function fitted(label) {
  const overflow = await page.locator("[data-size]").evaluateAll(tiles => tiles.flatMap(tile =>
    [...tile.querySelectorAll(".panel-body, .pg-ov, .pg-ov-content, .pg-ov-toolbar, .pg-ov-standings, .pg-ov-board, .pg-ov-dash, .pg-ov-cell, .pg-ov-pulse")]
      .filter(n => n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)
      .map(n => ({ size: tile.dataset.size, class: n.className, w: n.clientWidth, sw: n.scrollWidth, h: n.clientHeight, sh: n.scrollHeight }))));
  assert.deepEqual(overflow, [], label);
  assert.equal(await page.getByText(/Nexus|Enter Nexus/).count(), 0);
  assert.equal(await page.evaluate(() => window.calls.some(c => c.command === "hub_peek")), false);
}
try {
  const sizes = [];
  for (let w = 2; w <= 12; w++) for (let h = 2; h <= 16; h++) sizes.push(`${w}x${h}`);
  await open(`sizes=${sizes.join(",")}`);
  await fitted("all 165 supported grid sizes at desktop width");
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.command === "playground_board").length), 1,
    "tiles share one request for the same board");
  console.log("PASS: every supported tile size fits without Nexus or Nexus polling");
  for (const width of [375, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await open("sizes=2x1,2x2,3x3,4x3,4x5,6x2,6x4,8x5,12x7,12x16");
    await fitted(`viewport ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const view of ["pulse", "flame", "rival", "race", "board", "podium", "cheers", "dashboard", "hub"]) {
    await open(`sizes=2x2,4x3,8x5,12x7&view=${view}`);
    await fitted(`selected ${view}, with smaller-size fallbacks`);
    if (view === "hub") assert.equal(await page.locator('[data-size="12x7"] .pg-ov').getAttribute("data-view"), "board", "legacy Nexus layout migrates");
  }
  console.log("PASS: narrow, wide, short and tall tiles; saved layouts fall back safely and Nexus preferences migrate");
  await open("sizes=8x5");
  await page.getByRole("button", { name: "Global", exact: true }).click();
  await page.waitForFunction(() => window.calls.some(c => c.command === "playground_board" && c.args.scope === "global"));
  await page.waitForFunction(() => !document.querySelector(".pg-ov-wait"));
  assert.equal(await page.locator(".pg-ov").getAttribute("data-scope"), "global");
  assert.ok(await page.locator(".pg-ov-board li[data-you]").count(), "your separate server rank stays visible on global boards");
  await fitted("global board");
  await page.screenshot({ path: ".qa.local/playground-overview/global.png" });
  await page.goto(`${base}?sizes=8x5&keep`);
  await page.locator('.pg-ov[data-scope="global"]').waitFor();
  await page.getByRole("button", { name: "Playground display options", exact: true }).click();
  await page.getByRole("combobox", { name: "Board", exact: true }).selectOption("daily_plan.done");
  await page.keyboard.press("Escape");
  await page.locator('.pg-ov[data-scope="friends"]').waitFor();
  assert.equal(await page.getByRole("button", { name: "Global", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Playground display options", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: /Nexus/ }).count(), 0);
  await page.getByRole("combobox", { name: "Board", exact: true }).selectOption("active");
  await page.keyboard.press("Escape");
  await page.locator('.pg-ov[data-scope="global"]').waitFor();
  await page.locator(".pg-ov-board button").first().click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.playground.mode"))), "boards");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.playground.view")).scope), "global");
  console.log("PASS: Friends/Global, persisted audience, friends-only metrics, separate personal rank and opening the matching full board");
  await page.goto(`${base}?sizes=8x5&boarderror`);
  await page.getByRole("button", { name: /Couldn't load rankings/ }).click();
  await page.locator(".pg-ov-board li").first().waitFor();
  await fitted("request failure and recovery");
  console.log("PASS: failed requests show Retry and recover successfully");
  for (const query of ["lonely", "handle"]) {
    await open(`sizes=2x2,4x3,8x5,12x7&${query}`);
    await fitted(query);
    if (query === "handle") assert.equal(await page.getByText("Join the boards", { exact: true }).count(), 0, "participation off still allows browsing");
  }
  await open("sizes=4x3,8x5,12x7");
  await page.screenshot({ path: ".qa.local/playground-overview/friends.png", fullPage: true });
  await open("sizes=4x3,8x5,12x7&theme=shadow-dark");
  await fitted("dark theme");
  await page.screenshot({ path: ".qa.local/playground-overview/dark.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS: no-friends and handle-only states; no browser errors");
} finally { await browser.close(); }
