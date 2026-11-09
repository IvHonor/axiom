// Axiom's first run, in the real app (the web build's demo mode, so nothing
// leaves the browser): only the starter areas on, Lemma's tour, and anyone
// who had Axiom before (or an account that existed already) left as they were.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const base = process.env.FIRST_RUN_TEST_URL || "http://localhost:1430/app/";
const errors = [];
const out = ".qa.local/first-run";
await mkdir(out, { recursive: true });

async function open(query, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark", ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(30000);
  await page.goto(base + query, { timeout: 90000 });
  return { context, page };
}
const areaIcons = (page) => page.locator('.activitybar [data-tour^="area:"]').evaluateAll((els) => els.map((el) => el.dataset.tour.slice(5)).sort());

try {
  // ---------- A new account: the starter set, and the tour ----------
  {
    const { context, page } = await open("?demo&newaccount");
    const card = page.locator(".tour-card");
    await card.waitFor();
    assert.deepEqual(await areaIcons(page), ["daily_plan", "lemma", "notes"], "only the starter areas are on");
    assert.equal(await page.getByRole("dialog", { name: /What.s new/ }).count(), 0, "no back catalogue of news");
    await page.screenshot({ path: `${out}/1-welcome.png` });

    await card.getByRole("button", { name: "Show me around" }).click();
    await card.getByText("This is your overview").waitFor();
    // A step that talks keeps clicks off the app.
    assert.equal(await page.locator(".tour-block").count(), 1);

    await card.getByRole("button", { name: "Next" }).click();
    await card.getByText("You're starting with Daily Plan and Notes").waitFor();
    await page.screenshot({ path: `${out}/2-areas.png` });

    await card.getByRole("button", { name: "Next" }).click();
    await card.getByText("There's more when you want it").waitFor();
    assert.equal(await card.getByRole("button", { name: "Next" }).count(), 0, "waits for Extensions to be opened");
    assert.equal(await page.locator(".tour-block").count(), 0, "lets the click through");

    // Doing it: open Extensions, switch Journal on.
    await page.locator('[data-tour="extensions"]').click();
    await card.getByText("Pick one to try").waitFor();
    await page.screenshot({ path: `${out}/3-switch.png` });
    await page.locator('[data-tour="extensions-panel"] .ext-item', { hasText: "Journal" }).getByRole("switch").click();
    await card.getByText("Journal is ready").waitFor();
    assert.deepEqual(await areaIcons(page), ["daily_plan", "journal", "lemma", "notes"]);

    await card.getByRole("button", { name: "Next" }).click();
    await card.getByText("And I'm always here").waitFor();
    await page.screenshot({ path: `${out}/4-lemma.png` });
    await card.getByRole("button", { name: "Done" }).click();
    await card.waitFor({ state: "detached" });

    // Finished: not again, and what was switched on stays on.
    await page.reload();
    await page.locator(".activitybar").waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await card.count(), 0, "the tour shows once");
    assert.deepEqual(await areaIcons(page), ["daily_plan", "journal", "lemma", "notes"]);

    // Replayed from the Account panel; Escape ends it.
    await page.locator('[data-tour="account"]').click();
    await page.getByRole("button", { name: "Replay the tour" }).click();
    await card.waitFor();
    await page.keyboard.press("Escape");
    await card.waitFor({ state: "detached" });
    await context.close();
  }

  // ---------- Skipping, and "Later" ----------
  {
    const { context, page } = await open("?demo&newaccount");
    const card = page.locator(".tour-card");
    await card.getByRole("button", { name: "Skip" }).click();
    await card.waitFor({ state: "detached" });
    await page.reload();
    await page.locator(".activitybar").waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await card.count(), 0, "skipped counts as seen");

    await page.locator('[data-tour="account"]').click();
    await page.getByRole("button", { name: "Replay the tour" }).click();
    await card.getByRole("button", { name: "Show me around" }).click();
    await card.getByRole("button", { name: "Next" }).click();
    await card.getByRole("button", { name: "Next" }).click();
    await card.getByRole("button", { name: "Later" }).click();
    await card.getByText("And I'm always here").waitFor();
    await context.close();
  }

  // ---------- An account from before: its own areas (all of them), no tour ----------
  {
    const { context, page } = await open("?demo");
    await page.locator(".activitybar").waitFor();
    await page.waitForTimeout(3000);
    assert.equal(await page.locator(".tour-card").count(), 0, "no tour for an existing account");
    assert.equal((await areaIcons(page)).length, 11, "everything stays on");
    await context.close();
  }

  // ---------- Axiom was here before this version: untouched ----------
  {
    const { context, page } = await open("?demo&newaccount");
    // Settled first, so nothing of this run is written after the clear-out.
    await page.locator(".tour-card").waitFor();
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("axiom.disabled", "[]");
      localStorage.setItem("axiom.whatsNew.seen", JSON.stringify("0.8.1"));
    });
    await page.reload();
    await page.locator(".activitybar").waitFor();
    await page.waitForTimeout(3000);
    assert.equal(await page.locator(".tour-card").count(), 0, "no tour for an existing install");
    assert.equal(await page.evaluate(() => localStorage.getItem("axiom.firstRun")), null);
    assert.equal((await areaIcons(page)).length, 11);
    await context.close();
  }

  // ---------- A phone, in the light theme ----------
  {
    const { context, page } = await open("?demo&newaccount", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" });
    const card = page.locator(".tour-card");
    await card.getByRole("button", { name: "Show me around" }).click();
    await card.getByRole("button", { name: "Next" }).click();
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator('[data-tour="extensions"]').click();
    await card.getByText("Pick one to try").waitFor();
    await page.screenshot({ path: `${out}/phone-switch.png` });
    const box = await card.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, "the card fits a phone");
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log("PASS: a first run starts small with Lemma's tour; existing installs and accounts are left as they were");
} finally {
  await browser.close();
}
