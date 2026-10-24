import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}, colorScheme: "dark"});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = process.env.UNI_OVERVIEW_TEST_URL || "http://localhost:1427/tests/uni-overview-preview.html";
const key = "axiom.uni.overviewLayouts.v1";
await mkdir(".qa.local", {recursive: true});
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const open = async (w, h, extra = "") => { await page.goto(`${base}?w=${w}&h=${h}${extra}`); await page.locator(".un-ov-root, .un-ov-status").first().waitFor(); await settle(); };
const resize = async (w, h) => { await page.getByLabel("Grid width", {exact: true}).fill(String(w)); await page.getByLabel("Grid height", {exact: true}).fill(String(h)); await settle(); };
const menu = async () => { await page.getByRole("button", {name: "University display options", exact: true}).click(); await page.getByRole("dialog").waitFor(); };
const choose = async name => { await menu(); await page.getByRole("radio", {name, exact: true}).click(); await page.keyboard.press("Escape"); await settle(); };
const option = async (label, value) => { await menu(); await page.getByLabel(label, {exact: true}).selectOption(value); await page.keyboard.press("Escape"); await settle(); };
const fit = async label => {
  await settle();
  const result = await page.evaluate(() => {
    const selectors = [".panel-body", ".un-ov-root", ".un-ov-content", ".un-ov-collection", ".un-ov-items", ".un-ov-module-copy", ".un-ov-lecture-open", ".un-ov-pulse", ".un-ov-term", ".un-ov-progress", ".un-ov-start", ".un-ov-week", ".un-ov-dashboard-main", ".un-ov-dashboard-side"];
    const issues = [];
    for (const node of document.querySelectorAll(selectors.join(","))) {
      if (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2) issues.push({class: node.className, width: node.clientWidth, sw: node.scrollWidth, height: node.clientHeight, sh: node.scrollHeight});
    }
    const body = document.querySelector(".panel-body").getBoundingClientRect();
    for (const node of document.querySelectorAll(".un-ov-root button")) {
      const box = node.getBoundingClientRect();
      if (box.left < body.left - 1 || box.right > body.right + 1 || box.top < body.top - 1 || box.bottom > body.bottom + 1) issues.push({button: node.getAttribute("aria-label") || node.textContent, bounds: [box.x, box.y, box.width, box.height]});
    }
    const scrollbars = [...document.querySelectorAll(".tile-fitted *")].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight).map(node => node.className);
    return {view: document.querySelector(".un-ov-root")?.getAttribute("data-view"), issues, scrollbars};
  });
  assert.deepEqual(result.issues, [], `${label} (${result.view}) overflow: ${JSON.stringify(result.issues)}`);
  assert.deepEqual(result.scrollbars, [], `${label}: nested scrollbar`);
};
try {
  await open(4, 4); await page.evaluate(key => localStorage.removeItem(key), key);
  if (!process.env.UNI_ONLY_MATRIX) {
  for (const [w, h] of [[2, 2], [3, 3], [4, 4], [8, 5], [4, 9], [8, 9], [12, 16]]) {
    await open(w, h); await fit(`${w}x${h} Auto`);
    console.log(`${w}x${h}: ${await page.locator(".un-ov-root").getAttribute("data-view")}`);
    await page.screenshot({path: `.qa.local/uni-${w}x${h}.png`});
  }
  await open(8, 9);
  const names = ["At a glance", "Module strip", "Term pulse", "Module list", "Module cards", "Catch up", "Coming up", "Teaching term", "Study progress", "Needs attention", "Coming week", "University dashboard"];
  for (const name of names) { await choose(name); await fit(name); await page.screenshot({path: `.qa.local/uni-${name.replace(/[^a-z]+/gi, "-")}.png`}); }
  console.log("PASS: all 12 views");
  await choose("Module list");
  const first = await page.locator(".un-ov-module").first().getAttribute("aria-label");
  await page.getByRole("button", {name: "Next modules page", exact: true}).click();
  assert.notEqual(await page.locator(".un-ov-module").first().getAttribute("aria-label"), first);
  await page.locator(".un-ov-module").first().click(); assert.match(await page.getByTestId("target").textContent(), /^modules\/m\d+\/closed\/current$/);
  await option("Module order", "behind"); await option("Module filter", "behind");
  await fit("filtered modules");
  await choose("Catch up");
  const previousCount = await page.locator(".un-ov-pager > span").getAttribute("aria-label");
  await page.getByRole("button", {name: /^Mark .* caught up$/}).first().evaluate(node => {node.click(); node.click();});
  await page.waitForFunction(() => document.querySelector(".un-ov-root").getAttribute("aria-busy") === "false");
  assert.equal(await page.evaluate(() => window.uniFixture.calls.stage), 1);
  assert.notEqual(await page.locator(".un-ov-pager > span").getAttribute("aria-label"), previousCount);
  await page.locator(".un-ov-lecture-open").first().click(); assert.match(await page.getByTestId("target").textContent(), /^modules\/m\d+\/closed\/current$/);
  await option("Module filter", "all"); await choose("Coming week");
  const days = page.locator(".un-ov-days button"); await days.nth(2).click(); assert.equal(await days.nth(2).getAttribute("aria-pressed"), "true"); await fit("selected teaching day");
  await choose("Study progress"); await page.locator(".un-ov-progress").click(); assert.equal(await page.getByTestId("target").textContent(), "modules/none/closed/current");
  await choose("University dashboard"); await page.reload(); await page.locator('.un-ov-root[data-view="dashboard"]').waitFor();
  await resize(4, 4); assert.notEqual(await page.locator(".un-ov-root").getAttribute("data-view"), "dashboard");
  await resize(8, 9); assert.equal(await page.locator(".un-ov-root").getAttribute("data-view"), "dashboard");
  await page.setViewportSize({width: 700, height: 1100}); await settle(); assert.notEqual(await page.locator(".un-ov-root").getAttribute("data-view"), "dashboard");
  await page.setViewportSize({width: 1440, height: 1100}); await settle(); assert.equal(await page.locator(".un-ov-root").getAttribute("data-view"), "dashboard");
  await page.getByRole("button", {name: "University display options", exact: true}).focus(); await page.keyboard.press("Shift+F10");
  await page.getByRole("dialog").waitFor(); await page.keyboard.press("Home"); assert.equal(await page.getByRole("radio", {name: "Auto fit", exact: true}).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Escape"); assert.equal(await page.getByRole("button", {name: "University display options", exact: true}).evaluate(node => node === document.activeElement), true);
  console.log("PASS: pagination, filters, sorting, caught-up mutation, navigation, selected days, saved sizes, fallback and keyboard controls");
  await page.evaluate(key => localStorage.removeItem(key), key);
  for (const extra of ["&empty", "&noModules", "&one", "&long", "&noLectures", "&caughtUp", "&noUpcoming", "&future", "&ended", "&theme=light"]) {
    for (const [w, h] of [[2, 2], [3, 3], [4, 4], [8, 5], [4, 9], [8, 9]]) { await open(w, h, extra); await fit(`${w}x${h} ${extra}`); }
  }
  await open(2, 2, "&empty"); await page.getByRole("button", {name: "Set up term", exact: true}).click(); assert.equal(await page.getByTestId("target").textContent(), "modules/none/term/current");
  await open(4, 4, "&noModules"); await page.getByRole("button", {name: "Add a module", exact: true}).click(); assert.equal(await page.getByTestId("target").textContent(), "modules/none/module/current");
  await open(4, 4, "&fail"); await page.getByRole("button", {name: "Retry", exact: true}).waitFor();
  await page.evaluate(() => window.uniFixture.recover()); await page.locator(".un-ov-root").waitFor(); await fit("initial recovery");
  await resize(8, 9); await page.evaluate(() => window.uniFixture.fail()); await page.locator(".un-ov-notice").waitFor(); await fit("stale data notice");
  await page.getByRole("button", {name: "Retry University data", exact: true}).click(); await page.evaluate(() => window.uniFixture.recover()); await page.locator(".un-ov-notice").waitFor({state: "detached"});
  await open(8, 9, "&mutationFail"); await choose("Catch up"); await page.getByRole("button", {name: /^Mark .* caught up$/}).first().click();
  await page.getByText("Couldn't mark lecture caught up", {exact: true}).waitFor(); await fit("mutation failure");
  await page.evaluate(() => window.uniFixture.recover()); await page.getByRole("button", {name: "Retry University data", exact: true}).click();
  await page.getByRole("button", {name: /^Mark .* caught up$/}).first().click();
  await page.waitForFunction(() => window.uniFixture.calls.stage === 2 && document.querySelector(".un-ov-root").getAttribute("aria-busy") === "false");
  await open(8, 9); await choose("Module list");
  await page.evaluate(() => window.uniFixture.name("Older delayed module", 200)); await page.waitForTimeout(20);
  await page.evaluate(() => window.uniFixture.name("Newest module snapshot", 0));
  await page.getByRole("button", {name: "Open module Newest module snapshot", exact: true}).waitFor(); await page.waitForTimeout(240);
  assert.equal(await page.getByRole("button", {name: "Open module Newest module snapshot", exact: true}).count(), 1);
  await page.getByRole("button", {name: "Next modules page", exact: true}).click();
  await page.evaluate(() => window.uniFixture.shrink());
  await page.waitForFunction(() => document.querySelectorAll(".un-ov-module").length === 1 && !document.querySelector(".un-ov-pager"));
  await fit("list shrinks while viewing a later page");
  await page.evaluate(key => localStorage.setItem(key, "{broken json"), key); await page.reload(); await page.locator(".un-ov-root").waitFor(); await fit("corrupt preferences");
  console.log("PASS: empty terms/modules, one module, unbroken names, no lectures, caught-up state, dates outside term, errors, retry and stale responses");

  await page.evaluate(key => localStorage.removeItem(key), key);
  for (const [w, h] of [[3, 3], [4, 4], [8, 5], [4, 9], [8, 9], [12, 16]]) {
    await open(w, h); await option("List density", "comfortable"); await menu();
    const available = await page.getByRole("radio").evaluateAll(nodes => nodes.filter(node => !node.disabled).map(node => node.getAttribute("aria-label"))); await page.keyboard.press("Escape");
    for (const name of available) { await choose(name); await fit(`${w}x${h} ${name} comfortable`); }
  }
  console.log("PASS: all available views with comfortable density at six sizes");
  await page.evaluate(key => localStorage.removeItem(key), key); await open(12, 16, "&long");
  const model = await page.evaluate(async () => {
    const model = await import("/src/features/uni/overview/model.ts");
    const {api} = await import("/src/features/uni/api.ts");
    const data = await api.summary("2026-10-23"), before = JSON.stringify(data);
    const selected = model.selectModules(data.modules, {...model.DEFAULTS, scope: "behind", sort: "behind"});
    const total = model.totals(data.modules);
    return {views: model.VIEWS, selected: selected.map(module => module.behind), same: before === JSON.stringify(data),
      percent: [model.percent(-1), model.percent(110), model.percent(NaN), model.ratio(2, 0), model.ratio(1, 4)],
      weighted: model.ratio(total.caughtUp, total.lectures), hits: model.selectHits(data, selected, "behind").map(hit => hit.days)};
  });
  assert.deepEqual(model.percent, [0, 100, null, null, 25]); assert.equal(model.same, true); assert.ok(model.weighted > 0 && model.weighted < 100);
  assert.deepEqual(model.selected, [...model.selected].sort((a, b) => b - a)); assert.deepEqual(model.hits, [...model.hits].sort((a, b) => b - a));
  for (const view of model.views) {
    await page.locator(".tile-cell").evaluate(node => {node.style.width = ""; node.style.height = "";}); await settle(); await choose(view.label);
    for (const delta of [-1, 0, 1]) {
      const width = Math.max(70, view.width + delta), height = Math.max(52, view.height + delta);
      await page.locator(".tile-cell").evaluate((node, {width, height}) => {node.style.width = `${width + 26}px`; node.style.height = `${height + 60}px`;}, {width, height});
      await fit(`${view.label} minimum ${delta}`);
    }
  }
  await page.locator(".tile-cell").evaluate(node => {node.style.width = ""; node.style.height = "";}); await settle();
  console.log("PASS: exact view minima, long content, safe percentages, weighted totals and immutable sorting/filtering");
  const themes = await page.evaluate(async () => (await import("/src/extensions/index.ts")).EXTENSIONS.flatMap(ext => ext.themes || []));
  for (const theme of themes) {
    await page.evaluate(async theme => {(await import("/src/shell/theme/applyTheme.ts")).applyTheme(theme); await document.fonts.ready;}, theme);
    await resize(4, 4); await fit(`compact ${theme.id}`); await resize(8, 9); await choose("University dashboard"); await fit(`dashboard ${theme.id}`);
  }
  console.log(`PASS: compact and expanded layouts across ${themes.length} theme variants`);
  }
  await page.evaluate(key => localStorage.removeItem(key), key);
  if (!process.env.UNI_SKIP_MATRIX) for (const viewport of [700, 1100, 1440, 1920]) {
    await page.setViewportSize({width: viewport, height: 1100}); await open(4, 4);
    for (let w = 2; w <= 12; w++) for (let h = 2; h <= 16; h++) { await resize(w, h); await fit(`${viewport}px ${w}x${h}`); }
    console.log(`PASS: all 165 supported grid sizes at ${viewport}px`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: University overview regression suite");
} finally { await browser.close(); }
