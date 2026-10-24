// Checks the website in a real browser: the homepage tour and its skip
// controls, the plain version without motion, the account pages when signed
// out, the security headers, and no errors anywhere.
//
// Run against a production build: in site/, `npm run build && npx next start`,
// then `node tests/site-marketing.mjs` (SITE_TEST_URL changes the address,
// PLAYWRIGHT_MODULE where Playwright is loaded from).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SITE_TEST_URL || 'http://localhost:3000';
const output = '.qa.local/site';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function open(path, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
  page.on('pageerror', (error) => errors.push(`${path}: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && errors.push(`${path}: ${message.text()}`));
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return page;
}

try {
  // Security headers on every page.
  const response = await fetch(base + '/');
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /frame-ancestors 'none'/, 'pages must not be framed');
  assert.match(csp, /connect-src 'self'/, 'pages must only talk to this site');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  // The tour pins, hides the header, and can be skipped or switched off.
  const home = await open('/');
  assert.equal(await home.evaluate(() => document.querySelector('#tour').dataset.mode), 'tour');
  const start = await home.evaluate(() => document.querySelector('.pin-spacer').getBoundingClientRect().top + scrollY);
  await home.evaluate((y) => scrollTo(0, y + innerHeight), start);
  await home.waitForTimeout(1200);
  assert.equal(await home.evaluate(() => document.documentElement.hasAttribute('data-tour')), true, 'the header steps aside during the tour');
  await home.screenshot({ path: `${output}/tour.png` });
  await home.getByRole('button', { name: /Skip animation/ }).click();
  await home.waitForTimeout(600);
  assert.equal(await home.evaluate(() => document.documentElement.hasAttribute('data-tour')), false, 'skipping leaves the tour');
  await home.evaluate((y) => scrollTo(0, y + innerHeight), start);
  await home.waitForTimeout(800);
  await home.getByRole('button', { name: 'Turn animation off' }).click();
  await home.reload({ waitUntil: 'networkidle' });
  assert.equal(await home.evaluate(() => document.querySelector('#tour').dataset.mode), undefined, 'turning it off is remembered');
  await home.getByRole('button', { name: 'Turn the animation back on' }).click();
  await home.waitForTimeout(800);
  assert.equal(await home.evaluate(() => document.querySelector('#tour').dataset.mode), 'tour');

  // Without motion, the window's tabs still switch screens.
  const still = await open('/', { reducedMotion: 'reduce' });
  assert.equal(await still.evaluate(() => document.querySelector('#tour').dataset.mode), undefined);
  await still.getByRole('button', { name: /Project Board/ }).click();
  assert.equal(await still.locator('#tour section[data-active="true"] [class*=columnHead]').count(), 4);
  await still.getByRole('button', { name: /Themes/ }).click();
  await still.getByRole('button', { name: /Gruvbox/ }).click();
  assert.equal(await still.evaluate(() => document.querySelector('#tour [data-theme]').dataset.theme), 'gruvbox');

  // Signed out: the account sends you to sign in, and the forms render without waiting for scripts.
  const account = await open('/account');
  await account.waitForURL(/\/sign-in\?next=%2Faccount/);
  for (const path of ['/sign-in', '/sign-up']) {
    const html = await (await fetch(base + path)).text();
    assert.match(html, /name="password"/, `${path} has its form in the HTML`);
  }
  const web = await open('/web');
  assert.equal(await web.getByRole('button', { name: /Notify me/ }).isVisible(), true);
  await web.screenshot({ path: `${output}/web.png` });

  // Phone: no sideways scrolling.
  const phone = await open('/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal overflow on a phone');

  assert.deepEqual(errors, [], 'no errors in the browser');
  console.log('PASS: security headers; tour pins, skips and turns off; plain tabs and themes; account redirects; sign-in forms in HTML; web page; phone width; no errors.');
} finally {
  await browser.close();
}
