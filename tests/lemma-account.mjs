// Lemma's chat with no account yet: asking is fine, the answer waits for an
// account, and it's sent the moment there is one (after asking which areas
// Lemma may see, if none yet).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, colorScheme: "dark" });
const base = process.env.LEMMA_ACCOUNT_TEST_URL || "http://localhost:1427/tests/lemma-account-preview.html";
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultNavigationTimeout(45000);
const out = ".qa.local/lemma-account";
await mkdir(out, { recursive: true });
const sends = () => page.evaluate(() => window.calls.filter((c) => c.command === "assistant_send").map((c) => c.args));

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });

  // Before asking: why an account's needed, and that the rest of Axiom doesn't need one.
  await page.getByText("To chat with me you'll need a free account").waitFor();
  await page.screenshot({ path: `${out}/welcome.png`, animations: "disabled" });

  // Asking: kept, not sent, with the reason in Lemma's own words.
  await page.getByPlaceholder(/^Ask /).fill("Plan my day");
  await page.keyboard.press("Enter");
  await page.getByText("I need a free account to answer that").waitFor();
  assert.equal(await page.locator(".lemma-bubble.is-user", { hasText: "Plan my day" }).count(), 1);
  assert.deepEqual(await sends(), [], "nothing is sent without an account");
  await page.screenshot({ path: `${out}/held.png`, animations: "disabled" });

  // The buttons ask the shell for the Account panel, on creating an account or signing in.
  await page.getByRole("button", { name: "Create a free account" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  assert.deepEqual(await page.evaluate(() => window.panels), [{ panel: "account", signUp: true }, { panel: "account" }]);

  // Signed in with no areas allowed: Lemma asks before it looks, then answers.
  await page.evaluate(() => window.signIn());
  await page.getByText("may I see Daily Plan and Notes").waitFor();
  assert.deepEqual(await sends(), [], "waits for the answer about areas");
  await page.screenshot({ path: `${out}/may-i-see.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Yes, have a look" }).click();
  await page.getByText("Here's your day.").waitFor();
  const [sent] = await sends();
  assert.equal(sent.text, "Plan my day", "the question that waited is the one sent");
  assert.deepEqual([...sent.areas].sort(), ["daily_plan", "notes"]);
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("axiom.assistant.areas"))).sort(), ["daily_plan", "notes"]);
  assert.equal(await page.getByText("I need a free account").count(), 0);

  // "Just chat for now" sends it without letting Lemma see anything.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByPlaceholder(/^Ask /).fill("Hello");
  await page.keyboard.press("Enter");
  await page.evaluate(() => window.signIn());
  await page.getByRole("button", { name: "Just chat for now" }).click();
  await page.getByText("Here's your day.").waitFor();
  const [chatOnly] = await sends();
  assert.equal(chatOnly.text, "Hello");
  assert.deepEqual(chatOnly.areas, []);

  // Narrow and light.
  await page.evaluate(() => localStorage.clear());
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 420, height: 760 });
  await page.reload();
  await page.getByPlaceholder(/^Ask /).fill("Plan my day");
  await page.keyboard.press("Enter");
  await page.getByText("I need a free account to answer that").waitFor();
  await page.screenshot({ path: `${out}/narrow-light.png`, animations: "disabled" });

  assert.deepEqual(errors, []);
  console.log("PASS: Lemma keeps a question until there's an account, asks before looking, then answers it");
} finally {
  await browser.close();
}
