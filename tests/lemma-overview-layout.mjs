import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const base = process.env.LEMMA_OVERVIEW_TEST_URL || "http://localhost:1427/tests/lemma-overview-preview.html";
await mkdir(".qa.local/lemma-overview", { recursive: true });
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const open = async (w, h, extra = "") => { await page.goto(`${base}?w=${w}&h=${h}${extra}`); await page.locator(".lemma-brief").waitFor(); await page.waitForSelector(".lemma-say:not(.is-status)"); await settle(); };
const resize = async (w, h) => { await page.getByLabel("Grid width", { exact: true }).fill(String(w)); await page.getByLabel("Grid height", { exact: true }).fill(String(h)); await settle(); await settle(); };
const layout = () => page.locator(".lemma-brief").getAttribute("data-layout");

/** Everything shown sits inside the tile: the face, each thing said, the numbers and every button. */
const fit = async label => {
  const result = await page.evaluate(() => {
    const issues = [];
    const body = document.querySelector(".panel-body").getBoundingClientRect();
    const inside = (node, what) => {
      const box = node.getBoundingClientRect();
      if (!box.width && !box.height) return;
      if (box.left < body.left - 1 || box.right > body.right + 1 || box.top < body.top - 1 || box.bottom > body.bottom + 1) issues.push({ what, bounds: [box.x, box.y, box.width, box.height].map(Math.round) });
    };
    const root = document.querySelector(".lemma-brief");
    if (root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1) issues.push({ what: "root overflow", w: [root.clientWidth, root.scrollWidth], h: [root.clientHeight, root.scrollHeight] });
    for (const node of root.querySelectorAll(".lemma-brief-face, .lemma-speech, .lemma-stat, button")) {
      if (!node.closest(".lemma-speech-probe")) inside(node, node.getAttribute("aria-label") || node.className);
    }
    // What's said fits its bubble (the probe is the hidden copy used for measuring).
    const words = root.querySelector(".lemma-speech-words");
    const room = words.getBoundingClientRect();
    for (const said of words.querySelectorAll(":scope > .lemma-say")) {
      const box = said.getBoundingClientRect();
      if (box.bottom > room.bottom + 1 || box.right > room.right + 1) issues.push({ what: `said past the bubble: ${said.textContent.slice(0, 40)}`, bottom: [Math.round(box.bottom), Math.round(room.bottom)] });
      const text = said.querySelector(":scope > span");
      if (text.scrollWidth > text.clientWidth + 1) issues.push({ what: `said too wide: ${said.textContent.slice(0, 40)}` });
    }
    if (!words.querySelector(":scope > .lemma-say")) issues.push({ what: "nothing said" });
    if (root.querySelector("input, textarea, form")) issues.push({ what: "a text box on the tile" });
    return { layout: root.dataset.layout, issues };
  });
  assert.deepEqual(result.issues, [], `${label} (${result.layout}): ${JSON.stringify(result.issues)}`);
  return result.layout;
};

try {
  // ---------- Behaviour, with motion: it talks ----------
  await open(6, 6);
  const face = page.locator(".lemma-brief-face .lemma-face");
  await page.waitForSelector(".lemma-speech-words > .lemma-say .lemma-unsaid", { state: "attached" });
  assert.match(await face.getAttribute("aria-label"), /speaking/, "The face talks while the words arrive");
  await page.waitForFunction(() => !document.querySelector(".lemma-speech-words > .lemma-say .lemma-unsaid"), null, { timeout: 15000 });
  await page.waitForFunction(() => !/speaking/.test(document.querySelector(".lemma-brief-face .lemma-face").getAttribute("aria-label")));
  console.log("PASS: types the words out with a talking face, then stops");
  // How many parts depends on the time of day (evenings say a little more).
  const second = page.getByRole("button", { name: /^Part 2 of \d+$/ });
  const firstText = await page.locator(".lemma-speech-words > .lemma-say").last().textContent();
  await second.click();
  await page.locator(".lemma-speech-words > .lemma-say").last().waitFor();
  assert.notEqual(await page.locator(".lemma-speech-words > .lemma-say").last().textContent(), firstText, "The pager moves on");
  await page.locator(".lemma-speech-words .lemma-unsaid").first().waitFor({ state: "attached" });
  await page.locator(".lemma-speech-words").click();
  assert.equal(await page.locator(".lemma-speech-words > .lemma-say .lemma-unsaid").count(), 0, "Clicking the bubble finishes the sentence");
  await page.getByRole("button", { name: /^Part 1 of \d+$/ }).click();
  assert.equal(await page.locator(".lemma-speech-words > .lemma-say .lemma-unsaid").count(), 0, "A bubble already said isn't typed again");
  await page.locator(".lemma-speech-words > button.lemma-say", { hasText: "Next up at" }).click();
  assert.equal(await page.getByTestId("opened").textContent(), "daily_plan", "A line opens its area");
  await page.locator(".lemma-brief-face").click();
  assert.equal(await page.getByTestId("opened").textContent(), "lemma", "The face opens the chat");
  await page.getByRole("button", { name: "Read it aloud", exact: true }).waitFor();
  console.log("PASS: pager, finish on click, no retyping, line and face navigation, read aloud");

  await resize(12, 10);
  await page.locator(".lemma-stat").first().click();
  assert.equal(await page.getByTestId("opened").textContent(), "daily_plan", "A number opens its area");
  await page.screenshot({ path: ".qa.local/lemma-overview/talking.png" });

  // ---------- Every size, at three window widths ----------
  await page.emulateMedia({ reducedMotion: "reduce" });
  const seen = {};
  for (const viewport of [1100, 1440, 1920]) {
    await page.setViewportSize({ width: viewport, height: 1100 });
    await open(4, 4);
    for (let w = 2; w <= 12; w++) {
      for (let h = 2; h <= 16; h++) {
        await resize(w, h);
        const name = await fit(`${w}x${h} at ${viewport}px`);
        (seen[name] ??= []).push(`${w}x${h}@${viewport}`);
      }
    }
  }
  console.log(`PASS: 165 sizes at 3 window widths (495 combinations): ${Object.entries(seen).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
  for (const name of ["pill", "ribbon", "column", "card", "wide", "stage"]) assert.ok(seen[name], `${name} is used at some size`);

  // ---------- What's said, and how ----------
  await page.setViewportSize({ width: 1440, height: 1100 });
  const sizes = [[2, 2], [3, 2], [2, 3], [4, 3], [2, 4], [3, 4], [4, 4], [3, 6], [6, 4], [4, 8], [8, 8], [12, 10], [12, 16]];
  for (const extra of ["&quiet", "&long", "&none", "&theme=light", "&name=Eco&personality=witty", "&personality=direct"]) {
    for (const [w, h] of sizes) {
      await open(w, h, extra);
      await fit(`${w}x${h} ${extra}`);
      if (extra === "&theme=light" || extra === "&long") await page.locator(".tile-cell").screenshot({ path: `.qa.local/lemma-overview/${w}x${h}${extra.replace(/\W+/g, "-")}.png` });
    }
  }
  await open(8, 8, "&quiet");
  // An empty plan, put for the time of day: "Nothing's planned yet", or in the evening "Tomorrow's a blank page".
  assert.match(await page.locator(".lemma-speech-words").textContent(), /Nothing|blank page/, "A quiet day says so");
  await open(8, 8, "&name=Eco&personality=witty");
  assert.match(await page.locator(".lemma-speech-words").textContent(), /Eco here.*minus the small print/, "The chosen name and personality are used");
  await open(4, 4, "&none");
  assert.match(await page.locator(".lemma-speech-words").textContent(), /Nothing/, "With no areas, it still says something");
  console.log("PASS: quiet, long names, no areas, light theme, names and personalities");

  for (const [w, h] of sizes) {
    await open(w, h);
    console.log(`${w}x${h}: ${await layout()}`);
    await page.locator(".tile-cell").screenshot({ path: `.qa.local/lemma-overview/${w}x${h}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("PASS: no page errors");
} finally {
  await browser.close();
}
