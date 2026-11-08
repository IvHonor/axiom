// When Lemma can't answer, it says why, even on a new chat's first message.
// Run against Vite on port 1427: node tests/lemma-errors.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const url = process.env.LEMMA_TEST_URL || "http://localhost:1427/tests/lemma-preview.html";
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}?fail`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByRole("dialog").getByRole("button", { name: /close/i }).first().click();
  await page.getByRole("button", { name: "Toggle chat", exact: true }).click();
  await page.locator(".lemma-composer textarea").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();

  // The new chat is opened, with its question, and the reason stays.
  await page.locator(".lemma-chat-link").first().waitFor();
  await page.waitForTimeout(500);
  assert.match(await page.locator(".lemma-error").innerText(), /Groq is busy/);

  // Picking a chat starts afresh.
  await page.locator(".lemma-chat-link").first().click();
  await page.locator(".lemma-error").waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log("Lemma error checks passed.");
} finally {
  await browser.close();
}
