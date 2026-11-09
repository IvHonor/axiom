import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await mkdir(".qa.local", { recursive: true });
try {
  await page.goto(process.env.THEME_TEST_URL || "http://localhost:1427/tests/themes-preview.html");
  const packages = await page.evaluate(async () => {
    const { EXTENSIONS } = await import("/src/extensions/index.ts");
    const ids = ["catppuccin_themes", "tokyo_night_themes", "rose_pine_themes", "gruvbox_themes", "nord_themes"];
    const allIds = EXTENSIONS.flatMap(ext => [ext.id, ...(ext.themes || []).map(t => t.id)]);
    if (new Set(allIds).size !== allIds.length) throw new Error("Duplicate registry IDs");
    return EXTENSIONS.filter(ext => ids.includes(ext.id)).map(ext => ({ id: ext.id, builtIn: !!ext.builtIn, themes: ext.themes }));
  });
  assert.equal(packages.length, 5);
  assert.equal(packages.flatMap(p => p.themes).length, 14);
  const status = page.getByTestId("status");
  const item = label => page.locator(".theme-item").filter({ has: page.locator(".theme-name").getByText(label, { exact: true }) });
  // Every theme of every pack is listed: packs are built in and can't be switched off.
  const total = await page.evaluate(async () => (await import("/src/extensions/index.ts")).EXTENSIONS.flatMap(ext => ext.themes || []).length);
  assert.equal(await status.getAttribute("data-options"), String(total), "every theme is there to pick");
  for (const pack of packages) {
    assert.equal(pack.builtIn, true, pack.id + " is built in");
    for (const theme of pack.themes) {
      await item(theme.label).click();
      assert.equal(await status.getAttribute("data-theme"), theme.id);
      const rendering = await page.evaluate(async theme => {
        const root = getComputedStyle(document.documentElement);
        const families = [theme.fonts.ui, theme.fonts.mono].map(stack => stack.split(",")[0].trim());
        const loaded = await Promise.all(families.map(f => document.fonts.load("13px " + f, "Axiom 12:30")));
        const luminance = hex => {
          const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
        };
        const ratio = (a, b) => {
          const x = luminance(a), y = luminance(b);
          return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
        };
        return {
          background: root.getPropertyValue("--bg").trim(),
          font: root.getPropertyValue("--font-ui").trim(),
          loaded: loaded.every(faces => faces.length > 0 && faces.every(face => face.status === "loaded")),
          contrast: Math.min(...["background", "surface", "panel", "hover"].flatMap(bg => ["text", "textDim"].map(text => ratio(theme.colors[text], theme.colors[bg]))), ratio(theme.colors.accent, theme.colors.onAccent)),
        };
      }, theme);
      assert.equal(rendering.background, theme.colors.background);
      assert.equal(rendering.font, theme.fonts.ui);
      assert.equal(rendering.loaded, true, theme.id + " fonts must load locally");
      assert.ok(rendering.contrast >= 4.5, theme.id + " text/button contrast: " + rendering.contrast);
      await page.screenshot({ path: ".qa.local/theme-" + theme.id + ".png" });
    }
    const last = pack.themes.at(-1).id;
    await page.reload();
    assert.equal(await status.getAttribute("data-theme"), last, "Theme persists across reload");
    console.log("PASS: " + pack.id + " variants, fonts, contrast and persistence");
  }
  // A pack switched off back when packs could be is listed again.
  await page.evaluate(() => localStorage.setItem("axiom.disabled", JSON.stringify(["nord_themes"])));
  await page.reload();
  assert.equal(await status.getAttribute("data-options"), String(total), "a pack switched off before is listed again");
  // System mode follows the saved choice for each appearance.
  await item("Nord Polar Night").click();
  await page.getByRole("checkbox").check();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.querySelector("output").dataset.theme === "nord-snow");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.querySelector("output").dataset.theme === "nord-polar-night");
  // Real overview tiles must still fit after changing font metrics.
  for (const fixture of ["board-overview", "overview"]) {
    for (const size of ["w=3&h=3", "w=8&h=5"]) {
      await page.goto("http://localhost:1427/tests/" + fixture + "-preview.html?" + size);
      await page.locator(".tile-fitted").first().waitFor();
      for (const theme of packages.flatMap(p => p.themes)) {
        await page.evaluate(async theme => {
          const { applyTheme } = await import("/src/shell/theme/applyTheme.ts");
          applyTheme(theme);
          await document.fonts.ready;
        }, theme);
        await page.waitForTimeout(80);
        const overflow = await page.locator(".tile-fitted .panel-body").evaluateAll(nodes => nodes.some(node => node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2));
        assert.equal(overflow, false, fixture + " " + size + " " + theme.id + " must fit");
      }
    }
  }
  console.log("PASS: all 14 themes fit compact and wide planner/board overview tiles");
  assert.deepEqual(errors, []);
  console.log("PASS: system light/dark preferences; no browser errors");
} finally { await browser.close(); }
