// Axiom installed from the browser: the manifest and icons are served, the
// service worker takes over, and with the network gone the app still opens
// with the account's data and keeps edits to sync later.
// Run `npm run build --prefix site` first. Uses the production website and a fictional account server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

let seq = 0;
const rows = new Map();
const backend = createServer(async (request, response) => {
  const send = (status, body) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
  if (request.headers.authorization !== "Bearer fixture-access-ada") return send(401, { message: "Sign in." });
  if (request.url === "/v1/me") return send(200, { id: "ada", email: "ada@example.test", admin: false, created_at: "2026-11-01T00:00:00Z" });
  if (request.url === "/v1/account/profile") return send(200, { display_name: "Ada", avatar: null });
  if (request.url?.startsWith("/v1/sync/pull")) {
    const since = Number(new URL(request.url, "http://x").searchParams.get("since") || 0);
    return send(200, { records: [...rows.values()].filter((r) => r.seq > since), cursor: seq, more: false });
  }
  if (request.url === "/v1/sync/push") {
    let text = ""; for await (const chunk of request) text += chunk;
    for (const change of JSON.parse(text).changes) {
      const key = `${change.table}/${change.id}`;
      const row = rows.get(key) ?? { table: change.table, id: change.id, data: { id: change.id }, seq: 0 };
      Object.assign(row.data, change.fields); row.seq = ++seq; rows.set(key, row);
    }
    return send(200, { seq });
  }
  return send(404, { message: "Unknown fixture endpoint." });
});
backend.listen(0, "127.0.0.1"); await once(backend, "listening");
const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
let logs = "";
const server = spawn(process.execPath, [fileURLToPath(new URL("../site/node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("../site", import.meta.url)), windowsHide: true,
  env: { ...process.env, AXIOM_API_URL: `http://127.0.0.1:${backend.address().port}`, AXIOM_WEB_PROXY_SECRET: "", SITE_URL: base }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => { logs += d; }); server.stderr.on("data", (d) => { logs += d; });
async function until(check, message) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(100); } throw new Error(`${message}\n${logs.slice(-1500)}`); }

let browser;
try {
  await until(async () => (await fetch(`${base}/manifest.webmanifest`).catch(() => null))?.ok, "The website did not start");

  // The manifest and its icons.
  const manifestResponse = await fetch(`${base}/manifest.webmanifest`);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.start_url, "/terminal");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"), "Android crops a maskable icon into its own shape");
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png" }]) assert.equal((await fetch(`${base}${icon.src}`)).status, 200, icon.src);
  assert.match((await fetch(`${base}/sw.js`)).headers.get("cache-control") ?? "", /no-cache/, "The service worker must never be cached, or updates stall");

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: "axiom_access", value: "fixture-access-ada", url: base, httpOnly: true }]);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const opened = async () => {
    await until(async () => (await page.locator(".app").count()) > 0 && (await page.locator("#boot").count()) === 0, "Axiom did not open");
    const news = page.getByRole("dialog", { name: /What.s new in Axiom/ });
    if (await news.count()) await news.getByRole("button", { name: "Later", exact: true }).click();
  };

  await page.goto(`${base}/terminal`);
  await opened();
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"), "/manifest.webmanifest");
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);

  // The service worker takes over (from the next load on).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await opened();
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "The service worker should control the app");
  // What Chrome itself checks before offering "Install app".
  const { installabilityErrors } = await (await context.newCDPSession(page)).send("Page.getInstallabilityErrors");
  // Test browsers are private windows, which can never install apps; anything else is a real problem.
  assert.deepEqual(installabilityErrors.filter((e) => e.errorId !== "in-incognito"), [], "Chrome must be able to offer installing Axiom");

  // Something to find again offline.
  await page.locator('.activitybar .activity[aria-label="Daily Plan"]').click();
  if (await page.locator(".sidebar-scrim").count()) await page.locator(".sidebar-scrim").click({ position: { x: 380, y: 400 } });
  await page.locator(".dp-quick input").fill("Pack for the trip 30m");
  await page.keyboard.press("Enter");
  await until(async () => [...rows.values()].some((r) => r.data.title === "Pack for the trip"), "The task did not sync while online");

  // No connection: the app still opens, with the data.
  await context.setOffline(true);
  await page.reload(); await opened();
  await page.locator('.activitybar .activity[aria-label="Daily Plan"]').click();
  if (await page.locator(".sidebar-scrim").count()) await page.locator(".sidebar-scrim").click({ position: { x: 380, y: 400 } });
  await until(async () => (await page.getByText("Pack for the trip").count()) > 0, "The day's tasks did not show offline");

  // An edit made offline is kept, and goes when the connection's back.
  await page.locator(".dp-quick input").fill("Charge the camera");
  await page.keyboard.press("Enter");
  await until(async () => (await page.getByText("Charge the camera").count()) > 0, "An offline edit did not show");
  assert.ok(![...rows.values()].some((r) => r.data.title === "Charge the camera"), "Nothing can sync while offline");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => [...rows.values()].some((r) => r.data.title === "Charge the camera"), "The offline edit did not sync once back online");

  assert.deepEqual(errors, []);
  console.log("PASS: manifest and icons, installable in Chrome, service worker control, opening offline with the account's data, and offline edits syncing on reconnection");
} finally {
  await browser?.close();
  server.kill();
  backend.close();
}
