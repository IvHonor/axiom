// The "What's new" window shown once after an update, with the real component.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, colorScheme: "dark" });
const base = process.env.WHATS_NEW_TEST_URL || "http://localhost:1427/tests/whats-new-preview.html";
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultNavigationTimeout(45000);
const out = ".qa.local/whats-new";
await mkdir(out, { recursive: true });
const dialog = () => page.getByRole("dialog", { name: /What.s new in Axiom/ });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("axiom.whatsNew.seen", JSON.stringify("0.6.1")));
  await page.reload();
  await dialog().waitFor();
  assert.deepEqual(await page.evaluate(() => window.cases), { fromOld: 1, sameVersion: 0, laterMinor: 1, alreadySeenLater: 0, fresh: 1 });
  await page.screenshot({ path: `${out}/dark.png`, animations: "disabled" });

  // Opening Lemma closes it for good.
  await dialog().getByRole("button", { name: "Open Lemma" }).click();
  assert.equal(await page.getAttribute("body", "data-opened"), "lemma");
  assert.equal(await dialog().count(), 0);
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await dialog().count(), 0, "shown once");

  // Later and Escape count as seen too; the next version with nothing new shows nothing.
  await page.evaluate(() => localStorage.setItem("axiom.whatsNew.seen", JSON.stringify("0.6.1")));
  await page.reload();
  await dialog().waitFor();
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached" });
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await dialog().count(), 0);
  await page.goto(`${base}?version=0.6.3`);
  await page.waitForTimeout(500);
  assert.equal(await dialog().count(), 0, "nothing new in 0.6.3");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.whatsNew.seen"))), "0.6.3");

  await page.evaluate(() => localStorage.removeItem("axiom.whatsNew.seen"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 420, height: 760 });
  await page.goto(base);
  await dialog().waitFor();
  await page.screenshot({ path: `${out}/narrow-light.png`, animations: "disabled" });
  const box = await dialog().boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 420, "fits a narrow window");

  assert.deepEqual(errors, []);
  console.log("PASS: What's new shows once after an update, opens Lemma, and fits");
} finally {
  await browser.close();
}
