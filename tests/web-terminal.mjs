// Axiom on the web, end to end: the production website serving the web build
// of the desktop app, against a local account/sync server fixture (never a
// live account or its data).
// Run after `npm run build --prefix site`, then from the repo: node tests/web-terminal.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { checkDesktopPlanner } from './web-desktop-planner-browser.mjs';
import { checkBoard } from './web-board-browser.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const today = (() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; })();
const timestamp = new Date().toISOString();
const accounts = new Map(['a', 'b'].map(id => [id, { seq: 0, rows: new Map(), times: new Map() }]));
function apply(account, change) {
  const key = `${change.table}/${change.id}`;
  const row = account.rows.get(key) ?? { table: change.table, id: change.id, data: {}, seq: 0 };
  const times = account.times.get(key) ?? {};
  for (const [field, value] of Object.entries(change.fields)) if ((times[field] ?? -1) <= change.changed_at) { row.data[field] = value; times[field] = change.changed_at; }
  row.seq = ++account.seq; account.rows.set(key, row); account.times.set(key, times);
}
apply(accounts.get('a'), { table: 'daily_plan_tasks', id: 'desktop-task', fields: { id: 'desktop-task', title: 'Task from the desktop', notes: 'Preserve desktop notes', day: today, position: 1, focus_rank: null, done_at: null, estimate_minutes: 25, due_date: null, created_at: timestamp, updated_at: timestamp, deleted_at: null, actual_minutes: 0, timer_started_at: null, board_task_id: null }, changed_at: Date.now() - 10000 });
apply(accounts.get('a'), { table: 'finance_accounts', id: 'private-account', fields: { id: 'private-account', name: 'e1:encrypted-fixture' }, changed_at: Date.now() - 10000 });
let rejectPush = false;
const backend = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const token = req.headers.authorization?.replace('Bearer ', '');
  const id = token === 'fixture-access-a' ? 'a' : token === 'fixture-access-b' ? 'b' : null;
  if (!id) return send(401, { message: 'Sign in.' });
  const account = accounts.get(id);
  // Accounts that already existed (they have desktop data), not ones made just now: no first-run tour.
  if (req.url === '/v1/me') return send(200, { id: `fixture-${id}`, email: `${id}@example.test`, created_at: '2026-01-01T00:00:00Z', admin: false });
  if (req.url === '/v1/account/profile') return send(200, { display_name: `Tester ${id.toUpperCase()}`, avatar: null });
  if (req.url?.startsWith('/v1/sync/pull')) {
    const since = Number(new URL(req.url, 'http://localhost').searchParams.get('since') || 0);
    const rows = [...account.rows.values()].filter(row => row.seq > since).sort((a, b) => a.seq - b.seq);
    // Force pagination, including around private tables.
    return send(200, { records: rows.slice(0, 1), cursor: rows[0]?.seq ?? since, more: rows.length > 1 });
  }
  if (req.url === '/v1/sync/push') {
    if (rejectPush) return send(503, { message: 'Fixture connection interrupted.' });
    let text = ''; for await (const chunk of req) text += chunk;
    const changes = JSON.parse(text).changes;
    if (changes.some(change => Buffer.byteLength(JSON.stringify(change.fields)) > 64 * 1024)) return send(413, { message: 'One of your items is too large to sync.' });
    for (const change of changes) apply(account, change);
    return send(200, { seq: account.seq });
  }
  send(404, { message: 'Unknown fixture endpoint.' });
});
backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening'); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
let logs = '';
const server = spawn(process.execPath, [fileURLToPath(new URL('../site/node_modules/next/dist/bin/next', import.meta.url)), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: fileURLToPath(new URL('../site', import.meta.url)), env: { ...process.env, AXIOM_API_URL: `http://127.0.0.1:${backend.address().port}`, AXIOM_WEB_PROXY_SECRET: '', SITE_URL: base }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
let browser;
const errors = [];
let diagnosticPage;
async function until(check, message) { for (let i = 0; i < 120; i++) { if (await check()) return; await delay(100); } const alerts = await diagnosticPage?.getByRole('alert').allTextContents().catch(() => []); throw new Error(`${message}\nAlerts: ${JSON.stringify(alerts)}\n${logs.slice(-2000)}`); }
const rowWithTitle = title => [...accounts.get('a').rows.values()].find(row => row.data.title === title);
// The status bar's sync state, e.g. "Synced just now" or "Error"; its tooltip has the detail.
const syncStatus = page => page.locator('.statusbar .status-button').filter({ hasText: 'Sync' });
const synced = page => syncStatus(page).filter({ hasText: /Synced/ }).waitFor();
// The app syncs when the browser comes back online, as it does after a dropped connection.
const nudge = page => page.evaluate(() => window.dispatchEvent(new Event('online')));
try {
  await until(async () => { try { return (await fetch(base + '/sign-in')).ok; } catch { return false; } }, 'Next.js did not start');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  diagnosticPage = page;
  const icon = name => page.locator('.activitybar').getByRole('button', { name, exact: true });
  const area = async name => { await icon(name).click(); await page.locator('main.main').waitFor(); };

  // ---------- Signed out, then signed in ----------
  await page.goto(base + '/terminal'); await page.waitForURL(/\/sign-in\?next=%2Fterminal/);
  assert.equal((await context.request.get(base + '/api/terminal/sync')).status(), 401);
  await context.addCookies([{ name: 'axiom_access', value: 'fixture-access-a', url: base, httpOnly: true }]);
  await page.goto(base + '/terminal', { waitUntil: 'domcontentloaded' });
  await synced(page);
  console.log('PASS: signed-in app and initial pull');
  assert.equal(await page.locator('.site-header').count(), 0, 'the app owns its screen');
  assert.equal(await page.locator('.site-footer').count(), 0);
  assert.equal(await page.locator('.activitybar [data-tour^="area:"]').count(), 11, 'an existing account keeps every area');
  assert.equal(await page.locator('.tour-card').count(), 0, 'and gets no first-run tour');
  const html = await (await context.request.get(base + '/terminal')).text();
  assert.equal(html.includes('fixture-access-a'), false, 'no access token is serialized into the page');

  // ---------- The desktop's own Daily Plan and Project Board, syncing ----------
  await area('Daily Plan');
  const tomorrow = (() => { const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() + 1); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); })();
  await checkDesktopPlanner({ page, accounts, today, tomorrow, until, rowWithTitle });
  await checkBoard({ page, accounts, area, until, today, tomorrow });

  // ---------- Edits survive a dropped connection and a reload, then replay ----------
  await area('Daily Plan');
  rejectPush = true;
  const quick = page.locator('main.main .dp-quick input');
  await quick.fill('Saved during an outage'); await quick.press('Enter'); await quick.press('Escape');
  await syncStatus(page).filter({ hasText: 'Error' }).waitFor();
  assert.match(await syncStatus(page).getAttribute('title'), /Fixture connection interrupted\./);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('main.main .dp-row').filter({ hasText: 'Saved during an outage' }).waitFor();
  await syncStatus(page).filter({ hasText: 'Error' }).waitFor();
  assert.equal(rowWithTitle('Saved during an outage'), undefined);
  rejectPush = false;
  await nudge(page);
  await until(() => !!rowWithTitle('Saved during an outage'), 'the outbox did not replay');
  await synced(page);
  console.log('PASS: durable outbox and retry');

  // ---------- Encrypted areas stay locked; their contents are neither editable nor cached ----------
  await area('Finance');
  await page.locator('main.main .vault-lock').waitFor();
  await page.screenshot({ path: '.qa.local/terminal/finance-locked.png' });
  const cachedTables = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('axiom-terminal-fixture-a'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    return new Promise((resolve, reject) => { const req = db.transaction('records').objectStore('records').getAll(); req.onsuccess = () => { db.close(); resolve(req.result.map(row => row.table)); }; req.onerror = () => reject(req.error); });
  });
  assert.ok(cachedTables.includes('daily_plan_tasks'), 'readable tables are cached');
  assert.equal(cachedTables.includes('finance_accounts'), false, 'encrypted tables are not');
  const post = (body, origin = base) => context.request.post(base + '/api/terminal/sync', { headers: { origin }, data: body });
  assert.equal((await post({ accountId: 'fixture-b', changes: [] })).status(), 409);
  assert.equal((await post({ accountId: 'fixture-a', changes: [{ table: 'finance_accounts', id: 'bad', fields: { name: 'Plaintext' }, changed_at: Date.now() }] })).status(), 400);
  assert.equal((await post({}, 'https://different-origin.example')).status(), 403);
  assert.equal((await context.request.get(base + '/api/terminal/sync?since=-2')).status(), 400);
  console.log('PASS: encryption boundary, origin check and account validation');

  // ---------- Preferences survive a reload; the keyboard and a phone width work ----------
  await icon('Themes (Ctrl+K Ctrl+T)').click();
  await page.locator('.theme-follow input').uncheck();
  await page.locator('.theme-item').filter({ has: page.locator('.theme-name').getByText('Modern Light', { exact: true }) }).click();
  const themeType = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await until(async () => (await themeType()) === 'light', 'the theme did not apply');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await synced(page);
  await until(async () => (await themeType()) === 'light', 'the saved theme did not restore');
  await area('Daily Plan');
  const sidebarOpen = () => page.locator('.sidebar-frame.is-open').count();
  const before = await sidebarOpen();
  await page.keyboard.press('Control+b');
  await until(async () => (await sidebarOpen()) !== before, 'Ctrl+B did not toggle the sidebar');
  await page.keyboard.press('Control+b');
  await until(async () => (await sidebarOpen()) === before, 'Ctrl+B did not toggle the sidebar back');
  await mkdir('.qa.local/terminal', { recursive: true });
  await page.screenshot({ path: '.qa.local/terminal/daily-plan.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.activitybar').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow on phones');
  await page.screenshot({ path: '.qa.local/terminal/phone.png' });
  console.log('PASS: preferences, keyboard and phone layout');

  // ---------- Many tabs: the strip scrolls without a scrollbar, the active tab in view ----------
  await page.setViewportSize({ width: 1100, height: 900 });
  for (const name of ['Finance', 'Notes', 'Learning', 'University', 'Reading Tracker', 'Project Board', 'Daily Plan', 'Journal', 'Goals', 'Birthdays']) {
    await area(name);
    await page.locator('.tab', { hasText: name }).first().dblclick(); // keep it open: not just the preview tab
  }
  await page.waitForTimeout(400);
  const geometry = await page.locator('.tabs').evaluate(node => { const style = getComputedStyle(node), active = node.querySelector('.tab.is-active').getBoundingClientRect(), rect = node.getBoundingClientRect(); return { scrollbar: style.scrollbarWidth, overflows: node.scrollWidth > node.clientWidth, left: node.scrollLeft, activeLeft: active.left, activeRight: active.right, leftEdge: rect.left, rightEdge: rect.right }; });
  assert.equal(geometry.overflows, true, 'enough tabs to overflow');
  assert.equal(geometry.scrollbar, 'none');
  assert.ok(geometry.left > 0, 'the tabs scroll horizontally');
  assert.ok(geometry.activeLeft >= geometry.leftEdge - 1 && geometry.activeRight <= geometry.rightEdge + 1, 'the active tab stays in view');
  await page.screenshot({ path: '.qa.local/terminal/tabs.png' });
  console.log('PASS: overflowing tabs scroll, scrollbar hidden, active tab in view');

  // ---------- Upgrading an old cache re-pulls every row and keeps unsent edits ----------
  const migrationContext = await browser.newContext();
  await migrationContext.addCookies([{ name: 'axiom_access', value: 'fixture-access-a', url: base, httpOnly: true }]);
  const migration = await migrationContext.newPage(); migration.setDefaultTimeout(15000);
  migration.on('pageerror', error => errors.push(error.message));
  await migration.goto(base + '/account', { waitUntil: 'domcontentloaded' });
  await migration.evaluate(async ({ today, timestamp }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('axiom-terminal-fixture-a', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records', { keyPath: ['table', 'id'] }); request.result.createObjectStore('pending', { keyPath: 'operation' }); request.result.createObjectStore('meta');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['pending', 'meta'], 'readwrite');
        tx.objectStore('meta').put(99999, 'cursor');
        tx.objectStore('pending').put({ operation: 'migration-op', table: 'daily_plan_tasks', id: 'migration-task', changed_at: Date.now(), fields: { id: 'migration-task', title: 'Preserved during cache upgrade', notes: '', day: today, position: 100, focus_rank: null, done_at: null, estimate_minutes: null, due_date: null, created_at: timestamp, updated_at: timestamp, deleted_at: null, actual_minutes: 0, timer_started_at: null, board_task_id: null } });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  }, { today, timestamp });
  await migration.goto(base + '/terminal', { waitUntil: 'domcontentloaded' });
  await synced(migration);
  await migration.locator('.activitybar').getByRole('button', { name: 'Daily Plan', exact: true }).click();
  await migration.locator('main.main .dp-row').filter({ hasText: 'Preserved during cache upgrade' }).waitFor();
  await migration.locator('main.main .dp-row').filter({ hasText: 'Task from the desktop' }).waitFor();
  await until(() => !!rowWithTitle('Preserved during cache upgrade'), 'the preserved edit did not sync');
  await migrationContext.close();
  console.log('PASS: cache upgrade re-pulls earlier rows and keeps unsynced edits');

  // ---------- Switching accounts can't push A's changes into B, or show A's data ----------
  await context.addCookies([{ name: 'axiom_access', value: 'fixture-access-b', url: base, httpOnly: true }]);
  assert.equal((await post({ accountId: 'fixture-a', changes: [{ table: 'daily_plan_tasks', id: 'bad', fields: { title: 'Wrong account' }, changed_at: Date.now() }] })).status(), 409);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await synced(page);
  assert.equal(await page.getByText('Saved during an outage', { exact: true }).count(), 0);
  assert.equal(accounts.get('b').rows.size, 0);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('PASS: the web app end to end: sign-in, desktop sync format and pagination, planner and board, durable outbox, locked encryption, origin/account isolation, preferences, phone width, tabs, cache upgrade and account switching.');
  if (process.env.CHECK_MARKETING === '1') {
    const marketing = spawn(process.execPath, [fileURLToPath(new URL('./site-marketing.mjs', import.meta.url))], { env: { ...process.env, SITE_TEST_URL: base }, windowsHide: true, stdio: 'inherit' });
    const [code] = await once(marketing, 'exit');
    assert.equal(code, 0, 'existing marketing and account regression checks');
  }
} finally {
  await browser?.close();
  server.kill();
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
}
