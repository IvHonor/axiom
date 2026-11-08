// Checks the Analytics view against tests/analytics-preview.html (Vite on port 1427).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const base = process.env.ANALYTICS_TEST_URL || "http://localhost:1427/tests/analytics-preview.html";
const out = ".qa.local/analytics";
const AREAS = ["birthdays", "daily_plan", "finance", "goals", "journal", "learning", "notes", "project_board", "reading", "uni", "lemma"];
await mkdir(out, { recursive: true });

async function open(query = "", width = 1400) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?${query}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator(".analytics-score-value").first().waitFor();
  await page.waitForFunction(() => !document.querySelector(".analytics.is-loading"));
  return { page, errors };
}

/** Shows one area's tab, or the overview. */
async function show(page, id) {
  await page.locator(`#analytics-tab-${id}`).click();
  await page.locator(`#analytics-${id}`).waitFor();
}

const overflow = (page) => page.evaluate(() => {
  const main = document.querySelector(".main");
  return main.scrollWidth - main.clientWidth;
});

try {
  // Every area: a scorecard tile and a tab, the assistant last.
  {
    const { page, errors } = await open("theme=modern-dark");
    await page.evaluate(() => ["unit", "tab"].forEach((k) => localStorage.removeItem(`axiom.analytics.${k}.v1`)));
    await page.reload();
    await page.locator(".analytics-score-value").first().waitFor();
    const ids = await page.locator(".analytics-tab").evaluateAll((els) => els.map((el) => el.id.replace("analytics-tab-", "")));
    assert.equal(ids[0], "overview", "the overview is the first tab");
    assert.deepEqual(ids.slice(1).sort(), [...AREAS].sort());
    assert.equal(ids.at(-1), "lemma", "the assistant comes after the life areas");
    assert.equal(await page.locator(".analytics-area").count(), 0, "the overview shows no area's charts");
    assert.equal(await page.locator(".analytics-score").count(), AREAS.length);
    assert.equal(await page.locator(".analytics-score .chart-spark path").count(), AREAS.length, "each tile has a trend line");
    assert.equal(await page.locator(".analytics-period b").innerText(), "This week");
    assert.ok(await page.getByRole("button", { name: "Next week" }).isDisabled(), "no going past this week");
    assert.match(await page.locator(".analytics > .analytics-note").innerText(), /same number of days/);

    // Changes: good up in green, fewer check-ins in red, a neutral count in grey.
    await show(page, "daily_plan");
    assert.ok(await page.locator("#analytics-daily_plan .chart-delta.is-good").first().isVisible());
    assert.equal(await page.locator(".analytics-area").count(), 1, "one area at a time");
    await show(page, "goals");
    assert.ok(await page.locator("#analytics-goals .chart-delta.is-bad").first().isVisible());
    await show(page, "project_board");
    assert.ok(await page.locator("#analytics-project_board .chart-delta.is-neutral").first().isVisible(), "tasks added is neither good nor bad");
    await show(page, "uni");
    assert.match(await page.locator("#analytics-uni .chart-delta").first().innerText(), /pts/, "a share changes in points");

    // Arrow keys move along the tabs.
    await page.locator("#analytics-tab-uni").press("ArrowLeft");
    await page.locator("#analytics-reading").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "analytics-tab-reading");
    await page.locator("#analytics-tab-reading").press("Home");
    await page.locator("#analytics-overview").waitFor();

    // A day's numbers on hover.
    await show(page, "project_board");
    await page.locator("#analytics-project_board .chart-day").nth(1).hover();
    const tip = await page.locator("#analytics-project_board .chart-tooltip").innerText();
    assert.match(tip, /Completed/);
    assert.match(tip, /Added/);

    // Clicking a tile opens its tab; Open opens the area.
    await show(page, "overview");
    await page.locator(".analytics-score").filter({ hasText: "Reading Tracker" }).click();
    await page.locator("#analytics-reading .chart-metrics").waitFor();
    await page.getByRole("button", { name: /^Open Reading Tracker/ }).click();
    assert.equal(await page.locator("body").getAttribute("data-opened"), "reading");

    // Back a week, then forward again.
    await page.getByRole("button", { name: "Previous week" }).click();
    await page.waitForFunction(() => document.querySelector(".analytics-period b")?.textContent === "Last week");
    assert.equal(await page.locator(".analytics > .analytics-note").count(), 0, "a finished week is compared whole");
    await page.getByRole("button", { name: "This week" }).click();
    await page.waitForFunction(() => document.querySelector(".analytics-period b")?.textContent === "This week");

    // Month, remembered after a reload.
    await page.getByRole("radio", { name: "Month" }).click();
    await page.waitForFunction(() => document.querySelector(".analytics-period b")?.textContent === "This month");
    await page.waitForFunction(() => !document.querySelector(".analytics.is-loading"));
    assert.ok((await page.locator("#analytics-reading .chart-daygrid-cell").count()) >= 28, "a month of days");
    await show(page, "finance");
    assert.ok(await page.locator("#analytics-finance .chart-barlist-target").first().isVisible(), "budgets show on a month");
    await page.reload();
    await page.locator("#analytics-finance .chart-metrics").waitFor();
    assert.equal(await page.locator(".analytics-period b").innerText(), "This month");
    assert.equal(await page.locator(".analytics-tab.is-active").innerText(), "Finance", "the tab is remembered");
    await page.screenshot({ path: `${out}/month-dark.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // One area failing leaves the rest.
  {
    const { page, errors } = await open("fail&theme=modern-dark");
    await show(page, "overview");
    assert.equal(await page.locator(".analytics-score").filter({ hasText: "Finance" }).locator(".analytics-score-label").innerText(), "Set up Finance first.");
    await show(page, "finance");
    assert.equal(await page.locator("#analytics-finance .analytics-error").innerText(), "Set up Finance first.");
    await show(page, "reading");
    assert.ok(await page.locator("#analytics-reading .chart-metrics").isVisible());
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Nothing yet: friendly words where charts would be, and no number made up.
  {
    const { page, errors } = await open("empty&theme=modern-light");
    await show(page, "daily_plan");
    assert.ok((await page.locator(".chart-empty").count()) >= 2);
    assert.equal(await page.locator("#analytics-daily_plan .chart-metric").nth(1).locator(".chart-metric-value").innerText(), "—", "no tasks planned: no share done");
    assert.equal(await page.locator("#analytics-daily_plan .chart-dotrow-dots i.is-on").count(), 0);
    await page.screenshot({ path: `${out}/empty-light.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Narrow windows and other themes: nothing wider than the window.
  for (const [query, width] of [["theme=modern-dark", 420], ["theme=wireframe-dark", 820], ["theme=catppuccin-latte", 1000], ["theme=gruvbox-dark", 1600]]) {
    const { page, errors } = await open(query, width);
    const strip = page.locator(".analytics-tabs");
    assert.equal(await strip.evaluate((el) => el.offsetHeight - el.clientHeight), 0, `${query} at ${width}px shows a scrollbar under the tabs`);
    if (width < 1000) {
      // Tabs that don't fit: faded at the end, and the wheel brings them in.
      assert.match(await strip.getAttribute("class"), /more-after/);
      await strip.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => document.querySelector(".analytics-tabs").scrollLeft > 0);
      assert.match(await strip.getAttribute("class"), /more-before/);
    }
    for (const id of ["overview", "finance", "reading"]) {
      await show(page, id);
      await page.waitForFunction(() => !document.querySelector(".analytics.is-loading"));
      assert.ok((await overflow(page)) <= 0, `${query} at ${width}px scrolls sideways on ${id}`);
      const outside = await page.evaluate(() => [...document.querySelectorAll(".chart-card, .chart-metric, .analytics-score, .analytics-open")].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.right > window.innerWidth + 0.5 || box.left < -0.5;
      }).length);
      assert.equal(outside, 0, `${query} at ${width}px has a card outside the window on ${id}`);
      await page.screenshot({ path: `${out}/${query.replace(/\W/g, "-")}-${width}-${id}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Analytics checks passed.");
} finally {
  await browser.close();
}
