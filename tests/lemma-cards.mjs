// Lemma's change cards and streamed replies, in the real chat view with mocked desktop calls.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
const url = process.env.LEMMA_TEST_URL || "http://localhost:1427/tests/lemma-cards-preview.html";
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && !message.text().startsWith("Failed to load resource") && errors.push(message.text()));
page.on("response", (response) => response.status() >= 400 && errors.push(`${response.status()} ${response.url()}`));
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(45000);
const out = ".qa.local/lemma-cards";
await mkdir(out, { recursive: true });
const card = (title) => page.locator(".lemma-card", { hasText: title });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await card("Add a book").waitFor();
  await page.screenshot({ path: `${out}/cards-dark.png`, fullPage: true });

  // Undo where it was confirmed; a note where it wasn't.
  assert.ok(await card("Ada Lovelace").getByRole("button", { name: "Undo" }).isVisible());
  const elsewhere = card("Run 5k").locator(".lemma-card-note");
  assert.equal(await elsewhere.textContent(), "Undo is on the computer where you confirmed it");
  assert.equal(await card("Run 5k").getByRole("button", { name: "Undo" }).count(), 0);
  await card("Ada Lovelace").screenshot({ path: `${out}/undo.png` });
  await card("Run 5k").screenshot({ path: `${out}/elsewhere.png` });

  // The book card shows what Open Library gave.
  for (const value of ["Dune", "Frank Herbert", "1965", "412", "Want to read", "From Open Library, with its cover"]) {
    assert.ok(await card("Add a book").getByText(value, { exact: true }).isVisible(), value);
  }
  await card("Add a book").screenshot({ path: `${out}/book.png` });
  console.log("PASS: Undo, the note for another computer, and the book card");

  // Asking twice points back to the waiting card.
  await page.getByRole("button", { name: "Same change as the card above" }).click();
  await page.waitForFunction(() => document.getElementById("lemma-card-dune")?.classList.contains("is-shown"));
  console.log("PASS: a repeated change points to the card still waiting");

  await card("Ada Lovelace").getByRole("button", { name: "Undo" }).click();
  await card("Ada Lovelace").getByText("Undone").waitFor();

  // Two waiting: one click confirms both.
  const all = page.locator(".lemma-confirm-all");
  assert.equal(await all.locator("span").first().textContent(), "2 changes waiting for you");
  await all.screenshot({ path: `${out}/confirm-all.png` });
  await all.getByRole("button", { name: "Confirm all" }).click();
  await all.waitFor({ state: "detached" });
  assert.ok(await page.evaluate(() => window.calls.includes("assistant_confirm_all")));
  assert.equal(await card("Plan Thursday").getByText("Done").count(), 1);
  assert.equal(await card("Add a book").getByText("Done").count(), 1);
  console.log("PASS: Confirm all");

  // Words show as they're written, and stay while Lemma carries on.
  await page.getByRole("textbox", { name: /Message/ }).fill("What's next?");
  await page.keyboard.press("Enter");
  await page.locator(".lemma-status").waitFor();
  await page.evaluate(() => window.progress({ text: "Let me" }));
  const draft = page.locator(".lemma-bubble.is-lemma").last();
  await page.waitForFunction(() => [...document.querySelectorAll(".lemma-bubble.is-lemma")].at(-1)?.textContent === "Let me");
  assert.equal(await page.locator(".lemma-status").count(), 0, "no 'thinking' under words being written");
  await page.evaluate(() => window.progress({ text: "Let me check your **plan**." }));
  await page.waitForFunction(() => [...document.querySelectorAll(".lemma-bubble.is-lemma")].at(-1)?.textContent === "Let me check your plan.");
  assert.equal(await draft.locator("strong").textContent(), "plan");
  await page.screenshot({ path: `${out}/streaming.png` });
  await page.evaluate(() => window.progress({ state: "looking", area: "daily_plan", step: 0 }));
  await page.locator(".lemma-status", { hasText: "Looking at Daily Plan…" }).waitFor();
  assert.equal(await draft.textContent(), "Let me check your plan.", "earlier words stay while it looks");
  await page.evaluate(() => window.progress({ step: 1, text: "Here's your" }));
  await page.waitForFunction(() => [...document.querySelectorAll(".lemma-bubble.is-lemma")].at(-1)?.textContent === "Here's your");
  await page.evaluate(() => window.finishTurn());
  await page.getByText("Here's your plan for the morning.").waitFor();
  assert.equal(await page.getByText("Here's your", { exact: true }).count(), 0, "drafts give way to the saved answer");
  console.log("PASS: streamed words");

  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: `${out}/cards-light.png`, fullPage: true });
  await page.setViewportSize({ width: 560, height: 900 });
  await page.screenshot({ path: `${out}/narrow.png`, fullPage: true });
  assert.ok(await page.locator(".lemma-thread").evaluate((n) => n.scrollWidth <= n.clientWidth + 1), "nothing wider than the chat");

  assert.deepEqual(errors, []);
  console.log("PASS: no errors");
} finally {
  await browser.close();
}
