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
const areas = view.getByRole("region", { name: "Areas", exact: true });
const popup = (name) => page.getByRole("dialog", { name, exact: true });
const open = async (name) => {
  await areas.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await popup(name).waitFor();
  return popup(name);
};
const close = async (name) => {
  await page.keyboard.press("Escape");
  await popup(name).waitFor({ state: "detached" });
};
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/of \d+ steps done/).waitFor();
  const earned = Number(await view.locator(".ach-total strong").textContent());
  assert.ok(earned > 0, "past activity counts straight away");

  // The page itself stays simple: tiles, not every achievement at once.
  assert.equal(await view.locator(".ach-card").count(), 0, "no achievement cards until an area is opened");
  assert.ok(await areas.locator(".ach-tile").count() >= 3);
  assert.match(await areas.getByRole("button", { name: /^Daily Plan/ }).innerText(), /\d+ of 21 steps[\s\S]*\d+ of 7 rewards/);
  assert.ok(await view.getByRole("region", { name: "Next up" }).locator("button").count() <= 3);
  await page.screenshot({ path: ".qa.local/achievements/page.png" });

  // Axiom: 40 days in a row finishes Showing Up, and gets Regular to its last step.
  const axiom = await open("Axiom");
  const showingUp = axiom.locator(".ach-card", { hasText: "Showing Up" });
  assert.equal(await showingUp.getAttribute("data-tier"), "diamond");
  await showingUp.getByText("Every step done").waitFor();
  const regular = axiom.locator(".ach-card", { hasText: "Regular" });
  assert.equal(await regular.getAttribute("data-tier"), "platinum");
  await regular.getByText("Step 5 of 5 · 40 / 60").waitFor();
  assert.equal(await regular.locator(".ach-steps li[data-done]").count(), 4);
  assert.equal(await regular.locator(".ach-steps li[data-current]").count(), 1);
  assert.equal(await axiom.getByText("Off the Map").count(), 0, "secrets stay secret");
  // Every step shows its own item, and pressing one shows that item.
  assert.deepEqual(await regular.locator(".ach-steps li").evaluateAll((steps) => steps.map((step) => step.dataset.kind)), ["neckwear", "headwear", "headwear", "neckwear", "headwear"]);
  assert.match(await regular.locator(".ach-reward").innerText(), /Flat Cap\s+Headwear · Step 5 reward: Use Axiom on 60 days/);
  await regular.locator(".ach-step").nth(1).click();
  assert.match(await regular.locator(".ach-reward").innerText(), /Fedora\s+Headwear · earned/);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] .ach-reward-art img')].some((image) => image.alt === "Fedora preview"));
  await regular.locator(".ach-step").nth(1).click();
  // Explorer counts now: five areas have activity in the made-up data.
  const explorer = axiom.locator(".ach-card", { hasText: "Explorer" });
  assert.equal(await explorer.getAttribute("data-state"), "counted");
  await explorer.getByText("Step 3 of 3 · 5 / 6").waitFor();
  const scene = axiom.locator(".ach-card", { hasText: "Change of Scene" });
  await scene.getByText("Step 1 of 3 · 0 / 1").waitFor();
  await page.screenshot({ path: ".qa.local/achievements/axiom.png" });
  await close("Axiom");
  assert.match(await areas.getByRole("button", { name: /^Axiom/ }).innerText(), /of 16 rewards/);

  // Picking a theme counts straight away, and is remembered.
  await page.evaluate(() => {
    const secrets = JSON.parse(localStorage.getItem("axiom.achievements.secrets") ?? "[]");
    localStorage.setItem("axiom.themePrefs", JSON.stringify({ followSystem: false, dark: "shadow-dark", light: "shadow-dark", fixed: "shadow-dark" }));
    return secrets;
  });
  await page.reload();
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/of \d+ steps done/).waitFor();
  await page.waitForFunction(() => (localStorage.getItem("axiom.achievements.secrets") ?? "").includes("theme:shadow-dark"));
  const again = await open("Axiom");
  await again.locator(".ach-card", { hasText: "Change of Scene" }).getByText("Step 2 of 3 · 1 / 3").waitFor();
  await close("Axiom");
  await page.evaluate(() => { localStorage.removeItem("axiom.themePrefs"); localStorage.removeItem("axiom.achievements.secrets"); });
  await page.reload();
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/of \d+ steps done/).waitFor();

  // Every step is listed, and the one that earns the reward says so.
  const plan = await open("Daily Plan");
  await plan.getByText(/the step showing an item's icon earns that item/).waitFor();
  assert.equal(await plan.locator(".ach-card").count(), 7);
  // Each reward is pictured, and its step shows what kind of item it is.
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] .ach-reward-art img').length === 7);
  assert.ok(await plan.locator(".ach-reward-art img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)));
  const kinds = {};
  for (const card of await plan.locator(".ach-card").all()) kinds[await card.locator("strong").first().innerText()] = await card.locator(".ach-steps li[data-reward]").getAttribute("data-kind");
  assert.deepEqual(kinds, { "Creature of Habit": "glow", "Task Crusher": "neckwear", Flawless: "facewear", "Perfect Week": "personality", "Deep Focus": "headwear", "Clocking Off": "material", Planner: "holding" });
  assert.equal(await plan.locator(".lucide-gift").count(), 0, "no generic present boxes left");
  const crusher = plan.locator(".ach-card", { hasText: "Task Crusher" });
  assert.deepEqual(await crusher.locator(".ach-step-count").allTextContents(), ["20", "50", "100"]);
  assert.match(await crusher.locator(".ach-steps li[data-reward] button").getAttribute("aria-label"), /Step 3: Finish 100 tasks.*Earns Cog Bolo/);
  assert.match(await crusher.locator(".ach-reward").innerText(), /Cog Bolo\s+Neckwear · earned/, "120 made-up tasks have earned it");
  const planning = plan.locator(".ach-card", { hasText: "Planner" });
  assert.match(await planning.locator(".ach-reward").innerText(), /The Long Hour\s+Held item · Step 3 reward: Plan your day 21 days in a row/);
  // Pressing a step previews what it takes, and pressing it again goes back.
  const step = (card, n) => card.locator(".ach-step").nth(n - 1);
  assert.equal(await planning.locator(".ach-goal").innerText(), "Plan your day 7 days in a row");
  await step(planning, 3).click();
  assert.equal(await planning.locator(".ach-goal").innerText(), "Plan your day 21 days in a row");
  await planning.getByText("Step 3 of 3 · 0 / 21").waitFor();
  assert.equal(await step(planning, 3).getAttribute("aria-pressed"), "true");
  await step(planning, 2).click();
  assert.equal(await planning.locator(".ach-goal").innerText(), "Plan your day 14 days in a row");
  await page.screenshot({ path: ".qa.local/achievements/daily-plan.png" });
  await step(planning, 2).click();
  assert.equal(await planning.locator(".ach-goal").innerText(), "Plan your day 7 days in a row");
  await planning.getByText("Step 1 of 3 · 0 / 7").waitFor();
  // A finished step can be read too.
  await step(crusher, 1).click();
  assert.equal(await crusher.locator(".ach-goal").innerText(), "Finish 20 tasks");
  await crusher.getByText("Step 1 of 3 · Done").waitFor();
  assert.equal(await crusher.getByText("Every step done").count(), 0);
  await step(crusher, 1).click();
  await crusher.getByText("Every step done").waitFor();
  await close("Daily Plan");

  // Next up opens the area it belongs to.
  await view.getByRole("region", { name: "Next up" }).getByRole("button", { name: /^Flawless/ }).click();
  await popup("Daily Plan").waitFor();
  await close("Daily Plan");

  await view.getByRole("button", { name: "Back to chats" }).click();
  await page.getByRole("button", { name: "New chat" }).waitFor();
  assert.equal(await view.count(), 0);
  console.log("PASS: a simple page of areas, each opening its achievements with steps and previews; past activity counts and secrets stay secret");

  // While customising, only the preview shows Lemma; the one on the page comes back afterwards.
  const pageLemma = page.locator(".lemma-chat-companion .lemma-face");
  const shown = (locator) => locator.evaluate((node) => getComputedStyle(node).visibility);
  assert.equal(await shown(pageLemma), "visible");
  await page.locator(".lemma-chat-companion").getByRole("button", { name: /^Customise/ }).click();
  const wardrobeLemma = page.locator(".lemma-wardrobe-preview .lemma-face");
  await wardrobeLemma.waitFor();
  assert.equal(await shown(pageLemma), "hidden", "no second Lemma behind the wardrobe");
  assert.equal(await shown(wardrobeLemma), "visible");
  await page.keyboard.press("Escape");
  await wardrobeLemma.waitFor({ state: "detached" });
  assert.equal(await shown(pageLemma), "visible");

  // A different person: what the first one earned is remembered, so start clean.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?empty`);
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await view.getByText(/^0$/).first().waitFor();
  assert.equal(await view.getByRole("region", { name: "Next up" }).count(), 0, "nothing to push for yet");
  console.log("PASS: a fresh start shows every area at zero");

  await page.setViewportSize({ width: 560, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  const narrow = await open("Daily Plan");
  assert.ok(await narrow.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "the pop-out fits too");
  await page.screenshot({ path: ".qa.local/achievements/narrow.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: fits a narrow window, no errors");
} finally {
  await browser.close();
}
