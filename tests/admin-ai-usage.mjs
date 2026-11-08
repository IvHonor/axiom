// The admin panel's AI usage: totals, charts, and each person's use, for
// every period, at desktop and narrow widths, with nothing used yet too.
// Run against Vite on port 1427: node tests/admin-ai-usage.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const url = process.env.ADMIN_USAGE_TEST_URL || "http://localhost:1427/tests/admin-ai-usage-preview.html";
await mkdir(".qa.local", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

  await page.locator(".chart-metric").first().waitFor();
  const labels = await page.locator(".chart-metric-label").allInnerTexts();
  assert.deepEqual(labels, ["Questions", "Tokens", "Failed calls", "Recordings"]);
  assert.equal(await page.getByText("$").count(), 0, "no costs: nothing is paid for");
  assert.equal(await page.locator(".admin-usage-row:not(.admin-row-head)").count(), 3, "a row each");
  assert.match(await page.locator(".admin-usage-error").innerText(), /Last failure: .*Groq is busy/);
  assert.equal(await page.locator(".chart-legend").count(), 1, "only the two-series chart has a legend");

  // Hovering a day shows its numbers.
  const bars = page.locator(".chart-card").first().locator("svg");
  const box = await bars.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.locator(".chart-tooltip").first().waitFor();
  await page.screenshot({ path: ".qa.local/admin-ai-usage-30.png", fullPage: true });

  for (const days of [7, 90]) {
    await page.getByRole("radio", { name: `${days} days` }).click();
    await page.waitForFunction((d) => document.querySelector(".admin-usage-charts svg") && document.querySelector('[aria-checked="true"]')?.textContent === `${d} days`, days);
    await page.screenshot({ path: `.qa.local/admin-ai-usage-${days}.png`, fullPage: true });
  }

  // Narrow: nothing spills past the window.
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(200);
  const spill = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(spill <= 0, `the page scrolls sideways by ${spill}px`);
  await page.screenshot({ path: ".qa.local/admin-ai-usage-narrow.png", fullPage: true });

  // Nothing used yet.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${url}?empty`, { waitUntil: "domcontentloaded" });
  await page.locator(".chart-empty").first().waitFor();
  assert.match(await page.locator(".admin-none").innerText(), /Nobody has used Lemma/);

  assert.deepEqual(errors, []);
  console.log("PASS: totals, charts, people, periods, narrow layout and an empty period");
} finally {
  await browser.close();
}
