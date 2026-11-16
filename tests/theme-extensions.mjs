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
    const ids = [
      "catppuccin_themes", "tokyo_night_themes", "rose_pine_themes", "gruvbox_themes", "nord_themes",
      "evergreen_themes",
      "ocean_glass_themes",
      "velvet_themes",
      "copper_themes",
      "sakura_themes",
      "graphite_themes",
      "desert_themes",
      "lagoon_themes",
      "electric_iris_themes",
      "midnight_gold_themes",
      "ruby_themes",
      "shadow_themes",
    ];
    const allIds = EXTENSIONS.flatMap(ext => [ext.id, ...(ext.themes || []).map(t => t.id)]);
    if (new Set(allIds).size !== allIds.length) throw new Error("Duplicate registry IDs");
    return EXTENSIONS.filter(ext => ids.includes(ext.id)).map(ext => ({ id: ext.id, builtIn: !!ext.builtIn, themes: ext.themes }));
  });
  assert.equal(packages.length, 17);
  assert.equal(packages.flatMap(p => p.themes).length, 37);
  const customPacks = packages.filter(pack => pack.id !== "shadow_themes").slice(-11);
  assert.equal(new Set(customPacks.map(pack => pack.themes[0].fonts.ui)).size, 11, "each new pack has its own interface font");
  assert.equal(new Set(customPacks.map(pack => JSON.stringify([pack.themes[0].style, pack.themes[0].labels]))).size, 11, "each new pack has its own shapes and label styling");
  const status = page.getByTestId("status");
  const item = label => page.locator(".theme-item").filter({ has: page.locator(".theme-name").getByText(label, { exact: true }) });
  // Every theme of every pack is listed: packs are built in and can't be switched off.
  const total = await page.evaluate(async () => (await import("/src/extensions/index.ts")).EXTENSIONS.flatMap(ext => ext.themes || []).length);
  assert.equal(await status.getAttribute("data-options"), String(total), "every theme is there to pick");
  for (const name of ["Wireframe Dark", "Wireframe Light"]) {
    await item(name).click();
    assert.equal(await page.locator(".topbar .box-hatch").count(), 0, name + " has no decorative top-bar squares");
  }
  const search = page.getByRole("searchbox", { name: "Search themes" });
  await search.fill("  rUbY  ");
  assert.deepEqual(await page.locator(".theme-name").allTextContents(), ["Ruby Dark", "Ruby Light"], "search ignores case and surrounding spaces");
  assert.deepEqual(await page.locator(".section-count").allTextContents(), ["01", "01"], "section counts reflect matches");
  await item("Ruby Dark").click();
  await search.fill("Modern Themes");
  assert.deepEqual(await page.locator(".theme-name").allTextContents(), ["Modern Dark", "Modern Light"], "search matches pack names");
  await search.fill("light");
  const lightCount = await page.evaluate(async () => (await import("/src/extensions/index.ts")).EXTENSIONS.flatMap(ext => ext.themes || []).filter(theme => theme.type === "light").length);
  assert.equal(await page.locator(".theme-item").count(), lightCount, "search matches appearance");
  assert.equal(await page.getByRole("button", { name: /^Dark/ }).count(), 0, "empty groups are hidden");
  await search.fill("no-such-theme");
  assert.equal(await page.locator(".theme-item").count(), 0);
  assert.equal(await page.getByRole("status").filter({ hasText: "No themes match your search." }).count(), 1);
  assert.equal(await status.getAttribute("data-theme"), "ruby-dark", "search never changes the selected theme");
  await search.press("Escape");
  assert.equal(await search.inputValue(), "");
  assert.equal(await page.locator(".theme-item").count(), total, "Escape restores the full list");
  await page.getByRole("button", { name: /^Dark/ }).click();
  await search.fill("crimson");
  assert.equal(await item("Crimson").isVisible(), true, "search opens matching groups even if previously collapsed");
  await item("Crimson").click();
  assert.equal(await status.getAttribute("data-theme"), "shadow-dark");
  await page.reload();
  assert.equal(await status.getAttribute("data-theme"), "shadow-dark", "Crimson persists across reload");
  assert.equal(await search.inputValue(), "", "a fresh panel starts with all themes");
  const shadow = packages.find(pack => pack.id === "shadow_themes").themes[0];
  assert.equal(shadow.style.brackets, false, "Crimson has smooth panels without wireframe corners");
  assert.equal(shadow.style.buttons, "filled");
  assert.equal(shadow.colors.pattern, "transparent");
  console.log("PASS: theme search, empty state, clearing, counts and selection; Crimson has no wireframe decoration");
  for (const pack of packages) {
    assert.equal(pack.builtIn, true, pack.id + " is built in");
    for (const theme of pack.themes) {
      await item(theme.label).click();
      assert.equal(await status.getAttribute("data-theme"), theme.id);
      assert.equal(await page.locator(".topbar .box-hatch").count(), 0, theme.id + " has no decorative top-bar squares");
      const rendering = await page.evaluate(async theme => {
        const root = getComputedStyle(document.documentElement);
        const families = [...new Set([theme.fonts.ui, theme.fonts.label, theme.fonts.mono])].map(stack => stack.split(",")[0].trim());
        const loaded = await Promise.all(families.map(f => document.fonts.load("13px " + f, "Axiom 12:30")));
        await Promise.all(document.getAnimations().map(animation => animation.finished));
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
          appearance: {
            labelFont: root.getPropertyValue("--font-label").trim(),
            monoFont: root.getPropertyValue("--font-mono").trim(),
            radius: getComputedStyle(document.querySelector("[data-testid=style-preview] .panel")).borderRadius,
            brackets: document.documentElement.dataset.brackets,
            buttons: document.documentElement.dataset.buttons,
            buttonBackground: getComputedStyle(document.querySelector("[data-testid=preview-button]")).backgroundColor,
            buttonText: getComputedStyle(document.querySelector("[data-testid=preview-button]")).color,
            labelCase: getComputedStyle(document.querySelector("[data-testid=preview-button]")).textTransform,
            tracking: root.getPropertyValue("--tracking").trim(),
            pattern: root.getPropertyValue("--pattern").trim(),
            label: document.querySelector("[data-testid=preview-label]").textContent,
          },
          loaded: loaded.every(faces => faces.length > 0 && faces.every(face => face.status === "loaded")),
          contrast: Math.min(...["background", "surface", "panel", "hover"].flatMap(bg => ["text", "textDim"].map(text => ratio(theme.colors[text], theme.colors[bg]))), ratio(theme.colors.accent, theme.colors.onAccent)),
        };
      }, theme);
      assert.equal(rendering.background, theme.colors.background);
      assert.equal(rendering.font, theme.fonts.ui);
      const label = text => text.replaceAll(" ", theme.labels.joiner);
      const rgb = hex => "rgb(" + hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(", ") + ")";
      assert.deepEqual(rendering.appearance, {
        labelFont: theme.fonts.label,
        monoFont: theme.fonts.mono,
        radius: theme.style.radius + "px",
        brackets: theme.style.brackets ? "on" : "off",
        buttons: theme.style.buttons,
        buttonBackground: theme.style.buttons === "filled" ? rgb(theme.colors.accent) : "rgba(0, 0, 0, 0)",
        buttonText: rgb(theme.style.buttons === "filled" ? theme.colors.onAccent : theme.colors.text),
        labelCase: theme.labels.uppercase ? "uppercase" : "none",
        tracking: String(theme.labels.tracking),
        pattern: theme.colors.pattern,
        label: label("Workspace overview") + " " + theme.labels.separator + " " + label("Ready to plan"),
      }, theme.id + " applies its typography, shape, decoration and label choices");
      assert.equal(rendering.loaded, true, theme.id + " fonts must load locally");
      assert.ok(rendering.contrast >= 4.5, theme.id + " text/button contrast: " + rendering.contrast);
      await page.screenshot({ path: ".qa.local/theme-" + theme.id + ".png" });
    }
    const last = pack.themes.at(-1).id;
    await page.reload();
    assert.equal(await status.getAttribute("data-theme"), last, "Theme persists across reload");
    const dark = pack.themes.find(theme => theme.type === "dark");
    const light = pack.themes.find(theme => theme.type === "light");
    await item(dark.label).click();
    await page.getByRole("checkbox").check();
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.colorScheme === "light");
    if (light) await item(light.label).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(id => document.querySelector("output").dataset.theme === id, dark.id);
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.colorScheme === "light");
    if (light) assert.equal(await status.getAttribute("data-theme"), light.id);
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("data-color-scheme"), "light", "System preference persists across reload");
    if (light) assert.equal(await status.getAttribute("data-theme"), light.id);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(id => document.querySelector("output").dataset.theme === id, dark.id);
    console.log("PASS: " + pack.id + " variants, appearance, fonts, contrast and persistence");
  }
  // A pack switched off back when packs could be is listed again.
  await page.evaluate(() => localStorage.setItem("axiom.disabled", JSON.stringify(["nord_themes", "ruby_themes"])));
  await page.reload();
  assert.equal(await status.getAttribute("data-options"), String(total), "a pack switched off before is listed again");
  // System mode follows the saved choice for each appearance.
  await item("Ruby Dark").click();
  await page.getByRole("checkbox").check();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.querySelector("output").dataset.theme === "ruby-light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.querySelector("output").dataset.theme === "ruby-dark");
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
        if (theme.id.startsWith("ruby-") || theme.id === "shadow-dark") {
          await page.screenshot({ path: ".qa.local/theme-" + theme.id + "-" + fixture + "-" + size.replaceAll("&", "-") + ".png" });
        }
      }
    }
  }
  console.log("PASS: all 37 themes fit compact and wide planner/board overview tiles");
  assert.deepEqual(errors, []);
  console.log("PASS: system light/dark preferences; no browser errors");
} finally { await browser.close(); }
