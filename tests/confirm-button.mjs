// A delete button in a form arms, then deletes; it never submits the form.
// Run against Vite on port 1427: node tests/confirm-button.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(process.env.CONFIRM_BUTTON_TEST_URL || "http://localhost:1427/tests/confirm-button-preview.html");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Click again" }).waitFor();
  assert.equal(await page.getByTestId("saved").textContent(), "0", "The first click arms it, without saving the form");
  await page.getByRole("button", { name: "Click again" }).click();
  assert.equal(await page.getByTestId("deleted").textContent(), "1");
  assert.equal(await page.getByTestId("saved").textContent(), "0", "Deleting never submits the form");
  await page.getByLabel("Name").press("Enter");
  assert.equal(await page.getByTestId("saved").textContent(), "1", "Enter still saves");
  console.log("PASS: a confirm button in a form deletes, and never saves the form");
} finally {
  await browser.close();
}
