import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark", reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  Object.defineProperty(window, "speechSynthesis", { value: {
    getVoices: () => [], cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {}, speak: utterance => { window.testUtterance = utterance; },
  } });
});
await mkdir(".qa.local/lemma-expressions", { recursive: true });
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  const preview = page.locator(".lemma-wardrobe-preview .lemma-face");
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  await preview.screenshot({ path: ".qa.local/lemma-expressions/clean-orb.png" });
  await page.getByRole("button", { name: "Crown", exact: true }).click();
  await preview.screenshot({ path: ".qa.local/lemma-expressions/crown.png" });
  await page.getByRole("button", { name: "None", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const face = page.locator('.lemma-face[role="button"]').first();
  const pictures = [];
  for (const mood of ["idle", "thinking", "looking", "preparing", "listening", "speaking", "happy", "concerned"]) {
    await page.getByRole("button", { name: mood, exact: true }).click();
    await page.waitForTimeout(80);
    pictures.push(await face.screenshot({ path: `.qa.local/lemma-expressions/${mood}.png` }));
  }
  for (let i = 1; i < pictures.length; i++) assert.notDeepEqual(pictures[i], pictures[0], "Each activity has a visible expression, even with reduced motion");
  await page.getByRole("button", { name: "idle", exact: true }).click();
  await page.getByRole("button", { name: "Stream answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.lemma-face[role="button"]').dataset.mood === "speaking");
  await page.getByRole("button", { name: "Finish answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.lemma-face[role="button"]').dataset.mood !== "speaking");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Read replies aloud", exact: true }).click();
  await page.getByRole("textbox", { name: "Message Lemma" }).fill("Hello");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".lemma-chat-companion .lemma-face").dataset.mood === "speaking");
  await page.evaluate(() => window.testUtterance.onend());
  await page.waitForFunction(() => document.querySelector(".lemma-chat-companion .lemma-face").dataset.mood !== "speaking");
  await page.getByRole("textbox", { name: "Message Lemma" }).fill("Again");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".lemma-chat-companion .lemma-face").dataset.mood === "speaking");
  await page.getByRole("button", { name: "Read replies aloud", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".lemma-chat-companion .lemma-face").dataset.mood !== "speaking");
  assert.deepEqual(errors, []);
  console.log("PASS: distinct automatic expressions, streamed-answer state, spoken replies and stopping speech");
} finally { await browser.close(); }
