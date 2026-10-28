import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
const url = process.env.LEMMA_TEST_URL || "http://localhost:1427/tests/lemma-preview.html";
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); console.error(message.text()); } });
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(45000);
await page.addInitScript(() => {
  const draw = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function (...args) {
    this.canvas.testDraws = (this.canvas.testDraws || 0) + 1;
    return draw.apply(this, args);
  };
});
const preview = () => page.locator(".lemma-wardrobe-preview .lemma-face");
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("axiom.lemma.look")));
const choose = name => page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
const ready = () => page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
await mkdir(".qa.local/lemma", { recursive: true });
try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await ready();
  assert.equal(await preview().getAttribute("data-shape"), "orb");
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview canvas")?.testDraws > 100);
  await page.screenshot({ path: ".qa.local/lemma/orb.png" });
  console.log("PASS: real WebGL rendering in StrictMode");
  if (process.env.LEMMA_SCREENSHOT_ONLY) { process.exitCode = 0; } else {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    const still = await preview().screenshot();
    await preview().focus(); await page.keyboard.press("ArrowRight");
    assert.notDeepEqual(await preview().screenshot(), still, "Keyboard rotation changes the real 3D view");
    const counts = () => preview().locator("canvas").evaluate(canvas => canvas.testDraws);
    const before = await counts();
    await page.waitForTimeout(350);
    assert.equal(await counts(), before, "Reduced motion stops continuous rendering");
    await page.keyboard.press("Enter");
    assert.match(await preview().getAttribute("aria-label"), /happy/);
    await page.waitForTimeout(1700);
    assert.doesNotMatch(await preview().getAttribute("aria-label"), /happy/);
    const position = await preview().boundingBox();
    const front = await preview().screenshot();
    await page.mouse.move(position.x + 120, position.y + 130); await page.mouse.down();
    await page.mouse.move(position.x + 190, position.y + 150, { steps: 8 }); await page.mouse.up();
    assert.notDeepEqual(await preview().screenshot(), front, "Pointer dragging turns the body");
    assert.doesNotMatch(await preview().getAttribute("aria-label"), /happy/, "Dragging does not trigger a greeting");
    await preview().click();
    assert.match(await preview().getAttribute("aria-label"), /happy/, "Tapping greets Lemma");
    await page.waitForTimeout(1700);
    // Reopen at the default angle for visual inspection of each outfit.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Wardrobe", exact: true }).click(); await ready();

    for (const [shape, hat, holding] of [["Orb", "Cap", "Coffee"], ["Prism", "Headphones", "Game"], ["Pyramid", "Crown", "Star"], ["Drop", "Beanie", "Plant"]]) {
      await choose(shape); await choose(hat); await choose(holding);
      assert.equal((await saved()).shape, shape.toLowerCase());
      await page.screenshot({ path: `.qa.local/lemma/${shape.toLowerCase()}-accessories.png` });
    }
    for (const accessory of ["Halo", "Bow tie", "None"]) await choose(accessory);
    for (const holding of ["Book", "Heart", "Rocket", "Music", "Nothing"]) await choose(holding);
    await choose("Orb"); await choose("Cap"); await choose("Coffee"); await choose("Amber");
    const wardrobe = await saved();
    await page.reload(); await ready();
    assert.deepEqual(await saved(), wardrobe, "Wardrobe survives reload");
    assert.equal(await page.getByRole("button", { name: "Coffee", exact: true }).getAttribute("aria-pressed"), "true");
    console.log("PASS: every body, accessory, keepsake, keyboard interaction and persistence");

    await page.setViewportSize({ width: 390, height: 740 });
    await page.screenshot({ path: ".qa.local/lemma/narrow.png" });
    assert.ok(await page.getByRole("dialog").evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 740);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await choose("Reset look");
    await page.screenshot({ path: ".qa.local/lemma/light.png" });
    assert.equal((await saved()).shape, "orb");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    const live = page.locator('.lemma-face[role="button"]').first();
    await page.getByRole("button", { name: "listening", exact: true }).click();
    assert.equal(await live.getAttribute("data-mood"), "listening");
    await page.getByRole("button", { name: "looking", exact: true }).click();
    assert.equal(await live.getAttribute("data-mood"), "looking");
    assert.equal(await live.locator(".lemma-work-badge").count(), 1);
    await page.getByRole("button", { name: "idle", exact: true }).click();
    assert.equal(await live.locator(".lemma-work-badge").count(), 0);
    await page.getByRole("button", { name: "Minimise Lemma", exact: true }).click();
    assert.equal(await page.locator(".lemma-companion-dock").count(), 0);
    await page.reload(); await ready();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Show Lemma companion", exact: true }).click();
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.locator('.lemma-chat-companion [data-renderer="3d"]').waitFor();
    await page.getByRole("textbox", { name: "Message Lemma" }).fill("Hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("I'm here to help.", { exact: true }).waitFor();
    assert.equal(await page.locator(".lemma-chat-companion canvas").count(), 1, "Companion stays throughout a conversation");
    await page.screenshot({ path: ".qa.local/lemma/chat.png" });
    await page.getByRole("button", { name: "Toggle chat", exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Toggle companion", exact: true }).click();
      assert.equal(await page.locator("canvas").count(), 0, "Unmount releases canvases");
      await page.getByRole("button", { name: "Toggle companion", exact: true }).click();
      await page.locator('.lemma-companion-dock [data-renderer="3d"]').waitFor();
      assert.equal(await page.locator("canvas").count(), 2, "Remount creates only the visible renderers");
    }
    console.log("PASS: voice/activity reactions, companion controls, chat presence, remount cleanup, light theme and narrow layout");

    await page.evaluate(() => localStorage.setItem("axiom.lemma.look", JSON.stringify({ shape: "hex", accessory: "bow", holding: "rocket", glow: "#ffb627", shell: "#3a3d44" })));
    await page.reload(); await ready();
    assert.equal(await preview().getAttribute("data-shape"), "prism");
    await choose("Coffee");
    assert.equal((await saved()).accessory, "bow");
    const parsed = await page.evaluate(async () => {
      const { normaliseLook, STANDARD } = await import("/src/features/lemma/look.ts");
      return { standard: STANDARD, invalid: normaliseLook({ shape: "bad", accessory: 5, holding: {}, glow: "url(bad)", shell: null }), arrays: normaliseLook([]), bubble: normaliseLook({ shape: "bubble" }).shape, shield: normaliseLook({ shape: "shield" }).shape };
    });
    assert.deepEqual(parsed.invalid, parsed.standard);
    assert.deepEqual(parsed.arrays, parsed.standard);
    assert.equal(parsed.bubble, "orb"); assert.equal(parsed.shield, "drop");
    await preview().locator("canvas").evaluate(canvas => {
      const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
      window.restoreLemmaContext = () => extension.restoreContext();
      extension.loseContext();
    });
    await preview().locator(".lemma-illustration").waitFor();
    await page.evaluate(() => window.restoreLemmaContext());
    await ready();
    const drawsBeforeHide = await preview().locator("canvas").evaluate(canvas => canvas.testDraws);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(before => document.querySelector(".lemma-wardrobe-preview canvas").testDraws > before, drawsBeforeHide);
    await preview().evaluate(node => { node.style.visibility = "hidden"; node.style.transform = "translateX(-3000px)"; });
    await page.waitForTimeout(150);
    const hiddenDraws = await preview().locator("canvas").evaluate(canvas => canvas.testDraws);
    await page.waitForTimeout(250);
    assert.equal(await preview().locator("canvas").evaluate(canvas => canvas.testDraws), hiddenDraws, "Off-screen companion stops rendering");
    await preview().evaluate(node => { node.style.visibility = ""; node.style.transform = ""; });
    await page.waitForFunction(before => document.querySelector(".lemma-wardrobe-preview canvas").testDraws > before, hiddenDraws);
    assert.deepEqual(errors, []);

    const fallback = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await fallback.addInitScript(() => {
      const context = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.startsWith("webgl") ? null : context.call(this, type, ...args); };
    });
    await fallback.goto(url);
    await fallback.locator(".lemma-wardrobe-preview .lemma-illustration").waitFor();
    await fallback.getByRole("button", { name: "Pyramid", exact: true }).click();
    assert.equal(await fallback.locator(".lemma-wardrobe-preview .lemma-face").getAttribute("data-shape"), "pyramid");
    await fallback.screenshot({ path: ".qa.local/lemma/fallback.png" });
    await fallback.close();
    console.log("PASS: old wardrobes migrate, invalid preferences recover, WebGL-unavailable fallback stays usable");
  }
} catch (error) {
  await page.screenshot({ path: ".qa.local/lemma/failure.png", timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
