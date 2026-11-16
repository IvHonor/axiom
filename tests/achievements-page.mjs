// Achievements on Lemma's page. Run against Vite on port 1427 (see README).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:1427/tests/achievements-preview.html";
await mkdir(".qa.local/achievements", { recursive: true });
const view = page.getByRole("region", { name: "Achievements", exact: true });
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/of \d+ levels earned/).waitFor();
  const earned = Number(await view.locator(".ach-total strong").textContent());
  assert.ok(earned > 0, "past activity counts straight away");
  // Axiom: 40 days in a row reaches Showing Up's third level (30), and the secret stays hidden.
  const showingUp = view.locator(".ach-card", { hasText: "Showing Up" });
  assert.equal(await showingUp.getAttribute("data-tier"), "gold");
  await showingUp.getByText("40 / 100").waitFor();
  assert.equal(await view.getByText("Off the Map").count(), 0, "secrets stay secret");
  await view.getByRole("region", { name: "Next up" }).locator(".ach-card").first().waitFor();
  // Not counted yet: coming soon, no progress bar.
  const planner = view.locator(".ach-card", { hasText: "Planner" });
  assert.equal(await planner.getAttribute("data-state"), "soon");
  assert.equal(await planner.locator(".ach-bar").count(), 0);
  await page.screenshot({ path: ".qa.local/achievements/page.png", fullPage: true });
  await view.getByRole("button", { name: "Back to chats" }).click();
  await page.getByRole("button", { name: "New chat" }).waitFor();
  assert.equal(await view.count(), 0);
  console.log("PASS: achievements count past activity, show levels, keep secrets and go back to the chat");

  await page.goto(`${base}?empty`);
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/^0$/).first().waitFor();
  assert.equal(await view.getByRole("region", { name: "Next up" }).count(), 0, "nothing to push for yet");
  console.log("PASS: a fresh start shows every achievement at zero");

  await page.setViewportSize({ width: 560, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  assert.deepEqual(errors, []);
  console.log("PASS: fits a narrow window, no errors");
} finally {
  await browser.close();
}
