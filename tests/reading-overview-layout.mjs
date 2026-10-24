import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}, colorScheme: "dark"});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = process.env.READING_OVERVIEW_TEST_URL || "http://localhost:1427/tests/reading-overview-preview.html";
const key = "axiom.reading.overviewLayouts.v1";
await mkdir(".qa.local", {recursive:true});
const open = async (w, h, extra = "") => { await page.goto(`${base}?w=${w}&h=${h}${extra}`); await page.locator(".rd-ov-root, .rd-ov-status").first().waitFor(); };
const settle = async () => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
const resize = async (w,h) => {
  await page.getByLabel("Grid width", {exact:true}).fill(String(w)); await page.getByLabel("Grid height",{exact:true}).fill(String(h)); await settle();
};
const menu = async () => { await page.getByRole("button", {name:"Reading Tracker display options",exact:true}).click(); await page.getByRole("dialog").waitFor(); };
const choose = async name => { await menu(); await page.getByRole("radio",{name,exact:true}).click(); await page.keyboard.press("Escape"); await settle(); };
const fit = async label => {
  await settle();
  const issue = await page.evaluate(() => {
    const selectors = [".tile-fitted .panel-body", ".rd-ov-root", ".rd-ov-content", ".rd-ov-feature", ".rd-ov-feature-copy", ".rd-ov-goal", ".rd-ov-collection", ".rd-ov-dashboard-main", ".rd-ov-dashboard-side", ".rd-ov-start", ".rd-ov-year", ".rd-ov-books"];
    const issues = [];
    for (const node of document.querySelectorAll(selectors.join(","))) {
      if (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2) issues.push({class:node.className, w:node.clientWidth, sw:node.scrollWidth, h:node.clientHeight, sh:node.scrollHeight});
    }
    const body = document.querySelector(".panel-body").getBoundingClientRect();
    for (const button of document.querySelectorAll(".rd-ov-root button")) {
      const box=button.getBoundingClientRect();
      if(box.top<body.top-1 || box.bottom>body.bottom+1 || box.left<body.left-1 || box.right>body.right+1) issues.push({button:button.getAttribute("aria-label")||button.textContent,bounds:[box.left,box.top,box.width,box.height],body:[body.left,body.top,body.width,body.height]});
    }
    return {view:document.querySelector(".rd-ov-root")?.getAttribute("data-view"), issues};
  });
  assert.deepEqual(issue.issues,[], `${label} (${issue.view}) overflow: ${JSON.stringify(issue.issues)}`);
};
try {
  await open(4,4); await page.evaluate(key=>localStorage.removeItem(key),key);
  for (const [w,h] of [[2,2],[3,3],[4,4],[8,5],[4,9],[8,9],[12,16]]) {
    await open(w,h); await fit(`${w}x${h} Auto`);
    console.log(`${w}x${h}: ${await page.locator('.rd-ov-root').getAttribute('data-view')}`);
    await page.screenshot({path:`.qa.local/reading-${w}x${h}.png`});
  }
  await open(8,9);
  const names=["At a glance","Reading strip","Compact shelf","Continue reading","Currently reading","Cover shelf","Yearly goal","Want to read","Recently finished","Library shelves","Reading year","Reading dashboard"];
  for (const name of names) { await choose(name); await fit(name); await page.screenshot({path:`.qa.local/reading-${name.replace(/[^a-z]+/gi,'-')}.png`}); }
  console.log('PASS: all 12 views');
  await choose('Currently reading');
  const first=await page.locator('.rd-ov-book').first().getAttribute('aria-label');
  await page.getByRole('button',{name:'Next reading books page',exact:true}).click();
  assert.notEqual(await page.locator('.rd-ov-book').first().getAttribute('aria-label'),first);
  await page.locator('.rd-ov-book').first().click();
  assert.match(await page.getByTestId('target').textContent(), /^reading\/b\d+\/closed$/);
  await choose('Yearly goal'); await page.locator('.rd-ov-goal').click();
  assert.equal(await page.getByTestId('target').textContent(),'stats/none/closed');
  await choose('Library shelves'); await page.locator('.rd-ov-shelves button').nth(1).click();
  assert.equal(await page.getByTestId('target').textContent(),'want/none/closed');
  await page.reload(); await page.locator('.rd-ov-root[data-view="library"]').waitFor();
  await resize(4,4); assert.notEqual(await page.locator('.rd-ov-root').getAttribute('data-view'),'library');
  await resize(8,9); assert.equal(await page.locator('.rd-ov-root').getAttribute('data-view'),'library');
  await choose('Reading dashboard');
  await page.setViewportSize({width:700,height:1100}); await settle();
  assert.notEqual(await page.locator('.rd-ov-root').getAttribute('data-view'),'dashboard');
  await page.setViewportSize({width:1440,height:1100}); await settle();
  assert.equal(await page.locator('.rd-ov-root').getAttribute('data-view'),'dashboard');
  await page.getByRole('button',{name:'Reading Tracker display options',exact:true}).focus(); await page.keyboard.press('Shift+F10');
  await page.getByRole('dialog').waitFor(); await page.keyboard.press('Home');
  assert.equal(await page.getByRole('radio',{name:'Auto fit',exact:true}).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Reading Tracker display options',exact:true}).evaluate(node=>node===document.activeElement),true);
  console.log('PASS: pagination, book/shelf/goal navigation, saved sizes, fallback and keyboard menu');
  await page.evaluate(key=>localStorage.removeItem(key),key);
  for(const extra of ['&empty','&noReading','&one','&unbroken','&noGoal','&exceeded','&theme=light']) {
    for(const [w,h] of [[2,2],[3,3],[4,4],[8,5],[4,9],[8,9]]) { await open(w,h,extra); await fit(`${w}x${h} ${extra}`); }
  }
  await open(4,4,'&fail'); await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await page.evaluate(()=>window.readingFixture.recover()); await page.locator('.rd-ov-root').waitFor(); await fit('recovered initial error');
  await resize(8,5);
  await page.evaluate(()=>window.readingFixture.fail()); await page.locator('.rd-ov-notice').waitFor(); await fit('stale data notice');
  await page.evaluate(()=>window.readingFixture.recover()); await page.locator('.rd-ov-notice').waitFor({state:'detached'});
  await open(8,9,'&partial'); await choose('Reading dashboard'); await page.locator('.rd-ov-notice').waitFor(); await fit('partial shelves');
  await page.evaluate(()=>window.readingFixture.recover()); await page.locator('.rd-ov-notice').waitFor({state:'detached'});
  await choose('Reading year'); assert.equal(await page.evaluate(()=>window.readingFixture.calls.stats>0),true);
  await open(8,9,'&statsFail'); await choose('Reading year'); await page.locator('.rd-ov-notice').waitFor(); await fit('statistics unavailable');
  await page.evaluate(()=>window.readingFixture.recover()); await page.locator('.rd-ov-year').waitFor();
  await open(8,9,'&noGoal'); await choose('Yearly goal'); assert.match(await page.locator('.rd-ov-goal').textContent(),/Set a goal/); assert.equal(await page.locator('.rd-ov-goal [role=progressbar]').count(),0);
  await open(8,9,'&exceeded'); await choose('Yearly goal'); assert.match(await page.locator('.rd-ov-goal').textContent(),/goal reached/); assert.equal(await page.locator('.rd-ov-goal [role=progressbar]').getAttribute('aria-valuenow'),'100');
  await open(4,4); assert.equal(await page.evaluate(()=>window.readingFixture.calls.stats),0); assert.equal(await page.evaluate(()=>window.readingFixture.calls.list),0);
  await page.evaluate(()=>window.readingFixture.title('Older delayed book',200)); await page.waitForTimeout(20);
  await page.evaluate(()=>window.readingFixture.title('Newest reading snapshot',0));
  await page.getByRole('button',{name:'Continue Newest reading snapshot',exact:true}).waitFor(); await page.waitForTimeout(230);
  assert.equal(await page.getByRole('button',{name:'Continue Newest reading snapshot',exact:true}).count(),1,'A late older response never overwrites the latest snapshot');
  await page.evaluate(key=>localStorage.setItem(key,'{not valid json'),key); await page.reload(); await page.locator('.rd-ov-root[data-view="continue"]').waitFor();
  await open(2,2,'&empty'); await page.locator('.rd-ov-glance button').click(); assert.equal(await page.getByTestId('target').textContent(),'reading/none/adding');
  console.log('PASS: empty/one-book libraries, long titles, audio, missing covers/totals, goals, errors, partial data, lazy reads, stale responses and corrupt preferences');
  await page.evaluate(key=>localStorage.removeItem(key),key);
  for(const [w,h] of [[3,3],[4,4],[8,5],[4,9],[8,9],[12,16]]) {
    await open(w,h); await menu(); await page.getByLabel('List density',{exact:true}).selectOption('comfortable');
    const available=await page.getByRole('radio').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>n.getAttribute('aria-label'))); await page.keyboard.press('Escape');
    for(const name of available) { await choose(name); await fit(`${w}x${h} ${name} comfortable`); }
  }
  console.log('PASS: all available views with comfortable density at six representative sizes');
  await page.evaluate(key=>localStorage.removeItem(key),key);
  await open(12,16);
  const model = await page.evaluate(async () => {
    const m = await import('/src/features/reading/overview/model.ts');
    const {api} = await import('/src/features/reading/api.ts');
    const books = await api.list('2026-10-23');
    return {views:m.VIEWS, capped:[m.percent(-20),m.percent(120),m.percent(null),m.percent(NaN)],
      unchanged:books.map(b=>b.id).join(',') === (m.sortBooks(books,'title'), books.map(b=>b.id).join(',')),
      reached:m.goalMessage({year:2026,books:12,finished:15,expected:8}),
      page:m.pageLayout(14,138,48), clampGoal:m.goalPercent({year:2026,books:12,finished:15,expected:8})};
  });
  assert.deepEqual(model.capped,[0,100,null,null]); assert.equal(model.unchanged,true); assert.equal(model.clampGoal,100); assert.match(model.reached,/reached/); assert.equal(model.page.count,2);
  for(const option of model.views) {
    await page.locator('.tile-cell').evaluate(node=>{node.style.width='';node.style.height='';}); await settle();
    await choose(option.label);
    for(const delta of [-1,0,1]) {
      const width=Math.max(70, option.width+delta), height=Math.max(52,option.height+delta);
      await page.locator('.tile-cell').evaluate((node,{width,height})=>{node.style.width=`${width+26}px`;node.style.height=`${height+60}px`;},{width,height});
      await settle(); await fit(`${option.label} minimum ${delta}`);
    }
  }
  await page.locator('.tile-cell').evaluate(node=>{node.style.width='';node.style.height='';}); await settle();
  await choose('Continue reading');
  for(const height of [99,100,109,110,124,125,169,170,184,185,204,205,219,220,229,230,234,235,269,270,334,335]) {
    await page.locator('.tile-cell').evaluate((node,height)=>{node.style.width='276px';node.style.height=`${height+60}px`;},height);
    await settle(); await fit(`continue chrome breakpoint ${height}`);
  }
  await page.locator('.tile-cell').evaluate(node=>{node.style.width='';node.style.height='';}); await settle();
  console.log('PASS: exact view minima and before/at/after content breakpoints; progress, goal and paging calculations');
  const themes = await page.evaluate(async()=> (await import('/src/extensions/index.ts')).EXTENSIONS.flatMap(ext=>ext.themes||[]));
  for(const theme of themes) {
    await page.evaluate(async theme=>{(await import('/src/shell/theme/applyTheme.ts')).applyTheme(theme); await document.fonts.ready;},theme);
    await resize(4,4); await fit(`compact ${theme.id}`);
    await resize(8,9); await choose('Reading dashboard'); await fit(`dashboard ${theme.id}`);
  }
  await page.evaluate(async()=>{const {modernThemes}=await import('/src/themes/modern_themes/index.ts');(await import('/src/shell/theme/applyTheme.ts')).applyTheme(modernThemes.themes[0]);});
  console.log(`PASS: compact and expanded tiles across all ${themes.length} theme variants`);
  await page.evaluate(key=>localStorage.removeItem(key),key);
  if (!process.env.READING_SKIP_MATRIX) for(const viewport of [700,1100,1440,1920]) {
    await page.setViewportSize({width:viewport,height:1100}); await open(4,4);
    for(let w=2;w<=12;w++) for(let h=2;h<=16;h++) { await resize(w,h); await fit(`${viewport}px ${w}x${h}`); }
    console.log(`PASS: all 165 supported grid sizes at ${viewport}px`);
  }
  assert.deepEqual(errors,[],'Browser errors');
  console.log('PASS: Reading overview regression suite');
} finally { await browser.close(); }
