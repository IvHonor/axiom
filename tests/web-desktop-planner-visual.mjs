import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, preview } from '../node_modules/vite/dist/node/index.js';

// Compare the production website with the original desktop CSS in a separate document.
export async function checkDesktopPlannerVisual({ browser, page, accounts, today }) {
  const root = fileURLToPath(new URL('../', import.meta.url)), outDir = '.qa.local/desktop-plan-fixture';
  await build({ root, configFile: false, logLevel: 'error', build: { outDir, emptyOutDir: true, rolldownOptions: { input: fileURLToPath(new URL('./desktop-plan-preview.html', import.meta.url)) } } });
  const vite = await preview({ root, configFile: false, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const reference = await browser.newPage();
  reference.setDefaultTimeout(15000);
  const failures = [];
  reference.on('pageerror', error => failures.push(error.message));
  const areas = page.getByRole('navigation', { name: 'Areas', exact: true });
  const properties = ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderTopColor','borderTopWidth','borderRadius','padding','margin','display','gap','boxSizing','width','height'];
  const mainSelectors = ['.dp-toolbar','.pb-segmented','.pb-segmented button','.dp-date','.dp-nav .btn','.dp-capacity','.dp-quick','.dp-quick-field','.dp-quick-field input','.dp-body','.dp-panel','.dp-heading','.dp-row','.dp-title','.dp-check','.dp-star','.dp-timeline','.dp-block','.dp-event'];
  const sideSelectors = ['.sidebar-head','.section','.section-head','.nav-item','.ps-block','.ps-progress','.ps-bar','.dim'];
  const readStyles = async (root, selectors) => root.evaluate((node, { selectors, properties }) => Object.fromEntries(selectors.map(selector => { const el = node.querySelector(selector); return [selector, el ? Object.fromEntries(properties.map(prop => [prop, getComputedStyle(el)[prop]])) : null]; })), { selectors, properties });
  try {
    await reference.goto(`http://127.0.0.1:${vite.httpServer.address().port}/tests/desktop-plan-preview.html`, { waitUntil: 'domcontentloaded' });
    await reference.waitForFunction(() => typeof window.mountPlanner === 'function');
    for (const [theme, label] of [['dark','Modern Dark'],['light','Modern Light'],['ember','Ember']]) {
      await areas.getByRole('button', { name: 'Themes', exact: true }).click();
      await page.getByRole('button', { name: label, exact: true }).click();
      await areas.getByRole('button', { name: 'Daily Plan', exact: true }).click();
      const main = page.locator('.desktop-planner-main'), side = page.locator('.desktop-planner-sidebar');
      await main.locator('.dp-row').first().waitFor();
      await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready);
      const bounds = await main.boundingBox();
      await reference.setViewportSize({ width: Math.round(bounds.width), height: Math.round(bounds.height) });
      await reference.evaluate(args => window.mountPlanner(args), { records: [...accounts.get('a').rows.values()], theme, day: today, sidebar: false });
      await reference.locator('.dp-row').first().waitFor();
      await reference.evaluate(() => document.fonts.ready);
      const actual = await readStyles(main, mainSelectors), expected = await readStyles(reference.locator('#root'), mainSelectors);
      assert.deepEqual(actual, expected, `${label}: web planner must match desktop typography, colours and layout`);
      await main.screenshot({ path: `.qa.local/terminal/planner-web-${theme}.png` });
      await reference.locator('#root').screenshot({ path: `.qa.local/terminal/planner-native-${theme}.png` });
      for (const [name, selectors] of [
        ['Week', ['.dp-week','.dp-week-day','.dp-week-head','.dp-week-load','.dp-agenda-row']],
        ['Month', ['.dp-month','.dp-month-grid','.dp-month-cell','.dp-month-head']],
        ['Year', ['.dp-year','.dp-year-stats','.dp-year-grid','.dp-year-month','.dp-year-day']],
        ['Insights', ['.dp-insights','.pb-stat-row','.pb-stat','.pb-chart-grid','.pb-chart','.pb-chart-body','.pb-axis','.pb-legend']],
      ]) {
        await main.getByRole('tab', { name, exact: true }).click();
        await reference.evaluate(view => window.selectPlannerView(view), name.toLowerCase());
        await main.locator(selectors[0]).waitFor();
        await reference.locator(selectors[0]).waitFor();
        assert.deepEqual(await readStyles(main, selectors), await readStyles(reference.locator('#root'), selectors), `${label}: ${name} layout must match desktop`);
        if (name === 'Insights') assert.equal(await main.locator('.pb-chart').first().evaluate(node => getComputedStyle(node, '::before').display), await reference.locator('.pb-chart').first().evaluate(node => getComputedStyle(node, '::before').display), 'theme switches must also match decorative panel brackets');
      }
      await main.getByRole('tab', { name: 'Day', exact: true }).click();
      await reference.evaluate(() => window.selectPlannerView('day'));
      const sidebarBounds = await side.boundingBox();
      await reference.setViewportSize({ width: Math.round(sidebarBounds.width), height: Math.round(sidebarBounds.height) });
      await reference.evaluate(args => window.mountPlanner(args), { records: [...accounts.get('a').rows.values()], theme, day: today, sidebar: true });
      await reference.locator('.ps-progress').waitFor();
      assert.deepEqual(await readStyles(side, sideSelectors), await readStyles(reference.locator('#root'), sideSelectors), `${label}: web sidebar must match desktop`);
    }
    assert.deepEqual(failures, [], 'no desktop fixture errors');
    await areas.getByRole('button', { name: 'Themes', exact: true }).click();
    await page.getByRole('button', { name: 'Modern Dark', exact: true }).click();
    await areas.getByRole('button', { name: 'Daily Plan', exact: true }).click();
    console.log('PASS: production web/desktop style parity for Day, Week, Month, Year, Insights and sidebar in Modern Dark, Modern Light and Ember');
  } finally { await reference.close(); await vite.close(); }
}
