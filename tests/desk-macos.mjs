import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
await mkdir(".qa.local/desk-macos", { recursive: true });
const errors = [];
try {
  for (const scale of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 500, height: 720 }, deviceScaleFactor: scale, colorScheme: "dark" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:1427/tests/desk-preview.html?mac&idle&quiet&theme=shadow-dark");
    const desk = page.locator(".desk");
    await desk.locator('.lemma-face[data-renderer="3d"]').waitFor();
    await page.mouse.move(490, 710);
    assert.equal(await desk.getAttribute("data-native-os"), "macos");
    await page.waitForFunction(() => window.pointerReads.local > 0);
    assert.equal(await page.evaluate(() => window.pointerReads.global), 0, "Mac never combines global physical cursor coordinates with window coordinates");
    for (const [dx, dy] of [[-240, -190], [240, -190], [-240, 190], [240, 190]]) {
      await page.evaluate(([dx, dy]) => {
        const face = document.querySelector(".desk-lemma .lemma-face").getBoundingClientRect();
        Object.assign(window.cursor, { x: face.x + face.width / 2 + dx, y: face.y + face.height / 2 + dy });
      }, [dx, dy]);
      await page.waitForFunction(([dx, dy]) => {
        const node = document.querySelector(".desk");
        return Math.sign(Number(node.dataset.gazeX)) === Math.sign(dx) && Math.sign(Number(node.dataset.gazeY)) === Math.sign(dy);
      }, [dx, dy]);
    }
    await page.locator(".desk-lemma").click({ button: "right" });
    await page.locator(".desk-menu").waitFor();
    await page.waitForFunction(() => window.glassFrames.some(frame => frame.length > 0));
    const native = await page.evaluate(() => window.glassFrames.at(-1));
    const menu = await page.locator(".desk-menu").boundingBox();
    assert.ok(native.some(panel => Math.abs(panel.x - menu.x) < 2 && Math.abs(panel.width - menu.width) < 2), "native glass follows the panel's logical bounds at scale " + scale);
    assert.ok(native.every(panel => panel.radius >= 0 && panel.width > 0 && panel.height > 0));
    assert.equal(await page.locator(".desk-menu").evaluate(node => getComputedStyle(node).color), "rgb(244, 245, 247)");
    await page.screenshot({ path: `.qa.local/desk-macos/dark-${scale}x.png` });
    await page.emulateMedia({ colorScheme: "light" });
    assert.equal(await page.locator(".desk-menu").evaluate(node => getComputedStyle(node).color), "rgb(32, 33, 38)");
    assert.equal(await desk.evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)", "floating Lemma has no surrounding glass rectangle");
    await page.screenshot({ path: `.qa.local/desk-macos/light-${scale}x.png` });
    assert.ok(await page.evaluate(() => window.nativeThemes.length > 0 && window.nativeThemes.every(theme => theme === null)), "Mac window follows system appearance");
    await page.getByRole("menuitem", { name: "Tuck into the edge" }).click();
    await page.mouse.move(490, 710);
    await page.locator(".desk.is-tucked").waitFor();
    await page.waitForFunction(() => {
      const box = document.querySelector(".desk").getBoundingClientRect();
      const panels = window.glassFrames.at(-1);
      return panels?.length === 1 && Math.abs(panels[0].width - box.width) < 2;
    });
    await page.screenshot({ path: `.qa.local/desk-macos/notch-${scale}x.png` });
    await context.close();
  }
  console.log("PASS: Mac local cursor direction in all quadrants at 1x and Retina scale; system light/dark glass, panel bounds and tucked sidebar");
  for (const side of ["left", "right"]) {
    const context = await browser.newContext({ viewport: { width: 500, height: 720 }, deviceScaleFactor: 2, colorScheme: "dark" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:1427/tests/desk-preview.html?mac&notch&idle&quiet&theme=shadow-dark" + (side === "left" ? "&left" : ""));
    await page.mouse.move(250, 710);
    await page.locator(`.desk.is-tucked.side-${side}`).waitFor();
    await page.waitForFunction(side => {
      const node = document.querySelector(".desk"), panel = window.glassFrames.at(-1)?.[0];
      return panel?.outline?.start[0] === (side === "left" ? 0 : node.getBoundingClientRect().width);
    }, side);
    const shape = await page.locator(".desk").evaluate((node, side) => {
      const css = getComputedStyle(node), box = node.getBoundingClientRect(), panel = window.glassFrames.at(-1)[0];
      const attachedX = side === "right" ? box.width - 1 : 1;
      const outerX = side === "right" ? 1 : box.width - 1;
      const hit = (x, y) => node.contains(document.elementFromPoint(box.x + x, box.y + y));
      return { border: css.borderWidth, shadow: css.boxShadow, radius: panel.radius, outline: panel.outline,
        clipped: css.clipPath.startsWith("path("), topCornerClear: !hit(outerX, 1), bottomCornerClear: !hit(outerX, box.height - 1),
        edgeJoined: hit(attachedX, box.height / 2), shoulderJoined: hit(attachedX, 7), width: box.width, height: box.height };
    }, side);
    assert.equal(shape.border, "0px");
    assert.equal(shape.shadow, "none");
    assert.equal(shape.radius, 0, "the native material uses the shared outline rather than a second corner radius");
    for (const key of ["clipped", "topCornerClear", "bottomCornerClear", "edgeJoined", "shoulderJoined"]) assert.equal(shape[key], true, `${side}: ${key}`);
    assert.equal(shape.outline.start[0], side === "right" ? shape.width : 0);
    const before = await page.evaluate(() => window.glassFrames.length);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.glassFrames.length), before, "a stable outline does not continually resend glass frames");
    const originalPanel = await page.evaluate(() => window.glassFrames.at(-1));
    await page.setViewportSize({ width: 500, height: 760 });
    await page.waitForFunction(before => window.glassFrames.length > before, before);
    assert.deepEqual(await page.evaluate(() => window.glassFrames.at(-1)), originalPanel,
      "window resizing refreshes native bounds even when the DOM panel is unchanged");
    await page.evaluate(side => {
      document.documentElement.style.background = "linear-gradient(125deg, #1f2937, #688177 60%, #d8c9ad)";
      const node = document.querySelector(".desk");
      Object.assign(node.style, { position: "fixed", top: "220px", [side]: "0" });
    }, side);
    await page.screenshot({ path: `.qa.local/desk-macos/attached-${side}.png` });
    await context.close();
  }
  console.log("PASS: one shared smooth outline, clear corners, joined shoulders and no glass-frame churn on both screen edges");
  {
    for (const scenario of ["&idle", "", "&idle&meeting&later"]) {
      const context = await browser.newContext({ viewport: { width: 500, height: 720 } });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("http://localhost:1427/tests/desk-preview.html?mac&notch&quiet" + scenario);
      await page.locator(".desk.is-tucked").waitFor();
      await page.locator(".desk-lemma").hover();
      await page.locator(".desk-peek-text").first().waitFor();
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction(scheme => [...document.querySelectorAll(".desk-tab-time, .desk-peek-text, .desk-peek-actions button")]
          .every(node => getComputedStyle(node).color === (scheme === "light" ? "rgb(32, 33, 38)" : "rgb(244, 245, 247)")), colorScheme);
        const labels = await page.locator(".desk-tab-time, .desk-peek-text, .desk-peek-actions button").evaluateAll(nodes => nodes.map(node => {
          const css = getComputedStyle(node);
          return { text: css.color, background: css.backgroundColor };
        }));
        assert.ok(labels.length > 0);
        for (const label of labels) {
          assert.equal(label.text, colorScheme === "light" ? "rgb(32, 33, 38)" : "rgb(244, 245, 247)");
          const rgba = label.background.match(/[\d.]+/g).map(Number);
          const fg = label.text.match(/[\d.]+/g).map(Number);
          const luminance = rgb => rgb.map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
            .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
          for (const wallpaper of [0, 255]) {
            const bg = rgba.slice(0, 3).map(n => n * rgba[3] + wallpaper * (1 - rgba[3]));
            const a = luminance(fg), b = luminance(bg);
            assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, "label contrast on black and white wallpaper");
          }
        }
      }
      await context.close();
    }
    console.log("PASS: greeting, timer, meeting labels and actions retain readable contrast in both appearances over black and white backgrounds");
  }
  {
    const context = await browser.newContext({ viewport: { width: 500, height: 720 }, colorScheme: "light" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:1427/tests/desk-preview.html?mac&quiet&theme=shadow-dark");
    await page.locator(".desk-controls").waitFor({ state: "attached" });
    await page.mouse.move(490, 710);
    await page.locator(".desk").hover();
    await page.waitForFunction(() => {
      const box = document.querySelector(".desk-controls").getBoundingClientRect();
      return window.glassFrames.at(-1)?.some(panel => Math.abs(panel.x - box.x) < 1 && Math.abs(panel.y - box.y) < 1 && Math.abs(panel.width - box.width) < 1);
    });
    assert.equal(await page.locator(".desk-controls .icon-btn").first().evaluate(node => getComputedStyle(node).color), "rgb(32, 33, 38)");
    await page.mouse.move(490, 710);
    await page.waitForFunction(() => {
      const node = document.querySelector(".desk-controls"), box = node.getBoundingClientRect();
      return getComputedStyle(node).visibility === "hidden" && !window.glassFrames.at(-1)?.some(panel => Math.abs(panel.width - box.width) < 1 && Math.abs(panel.y - box.y) < 5);
    });
    await context.close();
    console.log("PASS: hover-only timer controls gain and release native glass and keep light-mode icons readable");
  }
  {
    const context = await browser.newContext({ viewport: { width: 500, height: 720 }, colorScheme: "light" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:1427/tests/desk-preview.html?idle&quiet");
    await page.waitForFunction(() => window.pointerReads.global > 0);
    assert.equal(await page.locator(".desk").getAttribute("data-native-os"), null);
    assert.equal(await page.evaluate(() => window.pointerReads.local), 0);
    assert.deepEqual(await page.evaluate(() => window.glassFrames), []);
    await context.close();
    console.log("PASS: Windows keeps the existing cursor path and never requests native glass");
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
