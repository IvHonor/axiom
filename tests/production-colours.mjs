// Run after npm run build; checks the CSS shipped in desktop installers.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { applyTheme } from '../src/shell/theme/applyTheme.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assets = new URL('../dist/assets/', import.meta.url);
const files = (await readdir(assets)).filter(name => name.endsWith('.css'));
assert.ok(files.length, 'build the app first');
const css = (await Promise.all(files.map(name => readFile(new URL(name, assets), 'utf8')))).join('\n');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<span class="extension-symbol" style="--extension-accent:var(--area-journal)">Journal</span><span id="success" style="color:var(--success)">Saved</span>');
  await page.addStyleTag({ content: css });
  for (const [scheme, journal, success] of [
    ['light', 'rgb(168, 77, 107)', 'rgb(53, 123, 80)'],
    ['dark', 'rgb(227, 154, 178)', 'rgb(131, 191, 150)'],
    ['light', 'rgb(168, 77, 107)', 'rgb(53, 123, 80)'],
  ]) {
    // Exercise the same theme application that the desktop app uses.
    await page.evaluate(`(${applyTheme.toString()})(${JSON.stringify({
      type: scheme,
      colors: { text: '#333333' },
      fonts: { size: 13 },
      style: { radius: 8, buttons: 'filled' },
      labels: { uppercase: false, tracking: 0 },
    })})`);
    assert.equal(await page.locator('.extension-symbol').evaluate(node => getComputedStyle(node).color), journal, `${scheme}: Journal keeps its identity colour in the production build`);
    assert.equal(await page.locator('#success').evaluate(node => getComputedStyle(node).color), success, `${scheme}: Saved status keeps its colour`);
  }
  console.log('PASS: production icon and status colours in light/dark themes and after switching.');
} finally {
  await browser.close();
}
