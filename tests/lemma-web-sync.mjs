// Run `npm run build --prefix site` first. Uses the production website and a fictional account server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const accounts = new Map(["early", "late", "member", "new-member", "planner"].map(id => [id, { seq: 0, rows: new Map(), times: new Map() }]));
function apply(account, change) {
  const key = `${change.table}/${change.id}`;
  const row = account.rows.get(key) ?? { table: change.table, id: change.id, data: { id: change.id }, seq: 0 };
  const times = account.times.get(key) ?? {};
  for (const [field, value] of Object.entries(change.fields)) if ((times[field] ?? -1) <= change.changed_at) { row.data[field] = value; times[field] = change.changed_at; }
  row.seq = ++account.seq; account.rows.set(key, row); account.times.set(key, times);
}
for (const [accountId, account] of accounts) for (const [id, value] of Object.entries({
  "lemma.persona": { name: "117", personality: "calm" },
  "lemma.look": { holding: "first-light" },
  "lemma.preferences": { follow: true, outfits: [] },
  "achievements.rewards": accountId === "member" ? ["tie", "fedora"] : [],
})) apply(account, { table: "profile_settings", id, fields: { value: JSON.stringify(value) }, changed_at: 1 });
// Counts the desktop worked out, which the website can't make for itself.
apply(accounts.get("planner"), { table: "profile_settings", id: "achievements.counts", fields: { value: JSON.stringify({ "axiom.showing_up": 12 }) }, changed_at: 1 });
// Someone who only uses the website, with three routines made there.
for (const n of [1, 2, 3]) apply(accounts.get("planner"), { table: "daily_plan_routines", id: `routine-${n}`, fields: { title: `Routine ${n}`, start_minute: 480 + n * 60, duration_minutes: 30, color: "blue", weekdays: 31, created_at: "2026-11-01T09:00:00.000Z", deleted_at: null }, changed_at: 1 });
const backend = createServer(async (request, response) => {
  const send = (status, body) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
  const id = request.headers.authorization?.replace("Bearer fixture-access-", "");
  const account = accounts.get(id);
  if (!account) return send(401, { message: "Sign in." });
  if (request.url === "/v1/me") return send(200, { id, email: `${id}@example.test`, admin: id === "early" || id === "late", created_at: id === "early" ? "2027-03-20T23:59:59.999Z" : "2027-03-21T00:00:00Z" });
  if (request.url === "/v1/account/profile") return send(200, { display_name: "Fictional tester", avatar: null });
  if (request.url?.startsWith("/v1/sync/pull")) {
    const since = Number(new URL(request.url, "http://localhost").searchParams.get("since") || 0);
    return send(200, { records: [...account.rows.values()].filter(row => row.seq > since), cursor: account.seq, more: false });
  }
  if (request.url === "/v1/sync/push") {
    let text = ""; for await (const chunk of request) text += chunk;
    for (const change of JSON.parse(text).changes) apply(account, change);
    return send(200, { seq: account.seq });
  }
  return send(404, { message: "Unknown fixture endpoint." });
});
backend.listen(0, "127.0.0.1"); await once(backend, "listening");
const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
let logs = "";
const server = spawn(process.execPath, [fileURLToPath(new URL("../site/node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("../site", import.meta.url)), windowsHide: true,
  env: { ...process.env, AXIOM_API_URL: `http://127.0.0.1:${backend.address().port}`, AXIOM_WEB_PROXY_SECRET: "", SITE_URL: base }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
let browser;
const errors = [];
const profile = (key, id = "early") => JSON.parse(accounts.get(id).rows.get(`profile_settings/${key}`).data.value);
const dialog = page => page.getByRole("dialog", { name: /^Customise / });
const choose = (page, name) => dialog(page).getByRole("button", { name, exact: true }).click();
const tip = async (page, name) => { await page.mouse.move(0, 0); await dialog(page).getByRole("button", { name, exact: true }).hover(); return page.getByRole("tooltip").innerText(); };
const tab = (page, name) => dialog(page).getByRole("tab", { name, exact: true }).click();
const preview = page => dialog(page).locator(".lemma-wardrobe-preview .lemma-face");
async function until(check, message) { for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); } throw new Error(`${message}\n${logs.slice(-1500)}`); }
async function device(id) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addCookies([{ name: "axiom_access", value: `fixture-access-${id}`, url: base, httpOnly: true }]);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/terminal`, { waitUntil: "domcontentloaded" });
  const news = page.getByRole("dialog", { name: /What.s new in Axiom/ });
  // A new browser with a new account gets Lemma's tour (not the back catalogue of news): skip it.
  const tour = page.locator(".tour-card");
  await until(async () => (await news.count()) > 0 || (await tour.count()) > 0 || (await page.getByRole("button", { name: "Customise 117", exact: true }).count()) > 0, "The signed-in app did not finish opening");
  if (await news.count()) await news.getByRole("button", { name: "Later", exact: true }).click();
  if (await tour.count()) await tour.getByRole("button", { name: "Skip", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.platform), "web", "Production must run the web entry, including its startup and mobile styles");
  assert.equal(await page.locator("#boot").count(), 0, "The loading screen must be removed after sign-in");
  await page.getByRole("button", { name: "117", exact: true }).first().click();
  try {
    await page.getByRole("button", { name: "Customise 117", exact: true }).first().click();
  } catch (error) {
    await page.screenshot({ path: ".qa.local/lemma-web-sync/startup-failure.png" });
    console.error({ url: page.url(), errors, content: (await page.locator("body").innerText()).slice(0, 1800) });
    throw error;
  }
  await dialog(page).locator('[data-renderer="3d"]').waitFor();
  return page;
}
async function pull(page) {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
await mkdir(".qa.local/lemma-web-sync", { recursive: true });
try {
  await until(async () => { try { return (await fetch(`${base}/sign-in`)).ok; } catch { return false; } }, "The production website did not start");
  browser = await chromium.launch({ headless: true });
  const first = await device("early");
  assert.equal(await preview(first).getAttribute("data-holding"), "first-light");
  await choose(first, "Glitch core");
  assert.match(await tip(first, "Glitch core"), /Glitch core[\s\S]*Given to admins\./);
  await choose(first, "First Light");
  assert.match(await tip(first, "First Light"), /First Light[\s\S]*Given to users who created an account before 21 March 2027\./);
  await choose(first, "Tie"); await choose(first, "Fedora");
  assert.equal(await preview(first).getAttribute("data-neckwear"), "tie");
  assert.equal(await preview(first).getAttribute("data-headwear"), "fedora");
  assert.deepEqual(profile("achievements.rewards"), [], "Website admins can equip cosmetics without earning the achievements");
  await preview(first).screenshot({ path: ".qa.local/lemma-web-sync/admin-rewards.png" });
  await tab(first, "Outfits");
  await dialog(first).getByRole("textbox", { name: "Outfit name" }).fill("Early light"); await choose(first, "Save outfit");
  await until(() => profile("lemma.preferences").outfits.some(outfit => outfit.name === "Early light" && outfit.look.holding === "first-light"), "The web outfit did not reach account sync");
  const second = await device("early");
  assert.equal(await preview(second).getAttribute("data-holding"), "first-light");
  assert.equal(await preview(second).getAttribute("data-neckwear"), "tie");
  assert.equal(await preview(second).getAttribute("data-headwear"), "fedora");
  await tab(second, "Outfits");
  await dialog(second).getByRole("button", { name: "Wear Early light", exact: true }).waitFor();
  await tab(second, "Personality"); await dialog(second).getByRole("textbox", { name: "Name", exact: true }).fill("Orbit");
  await until(() => profile("lemma.persona").name === "Orbit", "The AI name did not sync back from the second device");
  await tab(second, "Appearance"); await choose(second, "Book");
  await until(() => profile("lemma.look").holding === "book", "The selected holdable did not sync back from the second device");
  await tab(first, "Appearance"); await pull(first);
  await first.getByRole("dialog", { name: "Customise Orbit", exact: true }).waitFor();
  await until(async () => (await preview(first).getAttribute("data-holding")) === "book", "The first device did not receive the selected book");
  assert.match(await tip(first, "Book"), /Book[\s\S]*Available to everyone\./);
  assert.equal((await dialog(first).innerText()).includes("Leave the name empty for Lemma"), false);
  await first.clock.install({ time: new Date("2030-04-01T12:00:00Z") });
  for (const [name, kind, milliseconds] of [["Book", "book", 4000], ["Plant", "plant", 5500], ["First Light", "first-light", 3500]]) {
    await choose(first, name); await choose(first, "Preview item animation");
    await first.clock.fastForward(milliseconds); await first.clock.runFor(80);
    assert.equal(await preview(first).getAttribute("data-idle-routine"), kind);
    await preview(first).screenshot({ path: `.qa.local/lemma-web-sync/${kind}.png` });
    await first.clock.fastForward(10000); await first.clock.runFor(80);
  }
  const late = await device("late");
  assert.equal(await dialog(late).getByRole("button", { name: "First Light", exact: true }).count(), 0);
  assert.equal(await preview(late).getAttribute("data-holding"), "none", "A saved look cannot bypass the account cutoff on the website");
  await first.context().close(); await second.context().close(); await late.context().close();
  const member = await device("member");
  await choose(member, "Tie"); await choose(member, "Fedora");
  assert.equal(await preview(member).getAttribute("data-neckwear"), "tie", "Desktop-earned rewards are available to a regular website account");
  assert.equal(await preview(member).getAttribute("data-headwear"), "fedora");
  await tab(member, "Outfits");
  await dialog(member).getByRole("textbox", { name: "Outfit name" }).fill("Daily uniform"); await choose(member, "Save outfit");
  await until(() => profile("lemma.preferences", "member").outfits.some(outfit => outfit.name === "Daily uniform" && outfit.look.neckwear === "tie" && outfit.look.accessory === "fedora"), "The cosmetic outfit did not sync from the website");
  const otherMember = await device("member");
  await tab(otherMember, "Outfits"); await choose(otherMember, "Wear Daily uniform");
  assert.equal(await preview(otherMember).getAttribute("data-neckwear"), "tie");
  assert.equal(await preview(otherMember).getAttribute("data-headwear"), "fedora", "A second browser restores the earned outfit");
  await member.context().close(); await otherMember.context().close();
  const fresh = await device("new-member");
  assert.equal(await dialog(fresh).getByRole("button", { name: "Tie", exact: true }).getAttribute("data-locked"), "true");
  assert.equal(await dialog(fresh).getByRole("button", { name: "Fedora", exact: true }).getAttribute("data-locked"), "true", "New regular accounts still need to earn the cosmetics");
  await preview(fresh).screenshot({ path: ".qa.local/lemma-web-sync/locked-rewards.png" });
  assert.equal(await dialog(fresh).getByRole("button", { name: "Verdigris", exact: true }).getAttribute("data-locked"), "true");
  await fresh.context().close();
  const planner = await device("planner");
  const verdigris = dialog(planner).getByRole("button", { name: "Verdigris", exact: true });
  await until(async () => (await verdigris.getAttribute("data-locked")) === null, "Routines made on the website did not earn their reward there");
  await until(() => profile("achievements.rewards", "planner").includes("verdigris"), "The reward earned on the website did not reach the account");
  await until(() => ["tie", "round-glasses"].every(id => profile("achievements.rewards", "planner").includes(id)), "Steps counted on the desktop did not earn their items on the website");
  assert.equal(await dialog(planner).getByRole("button", { name: "Loupe", exact: true }).getAttribute("data-locked"), "true", "Only what was earned unlocks");
  await planner.keyboard.press("Escape");
  await dialog(planner).waitFor({ state: "detached" });
  await planner.getByRole("button", { name: "Achievements", exact: true }).first().click();
  await planner.getByRole("region", { name: "Areas", exact: true }).getByRole("button", { name: /^Axiom/ }).click();
  await planner.getByRole("dialog", { name: "Axiom", exact: true }).locator(".ach-card", { hasText: "Showing Up" }).getByText("Step 3 of 5 · 12 / 14").waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: rewards earned on the website itself, production website includes tie/fedora cosmetics, admin access without achievements, synced member rewards and outfits, locked rewards for new accounts, holdable descriptions, custom names, First Light entitlement/animation, book/plant animations and bidirectional account sync across isolated devices");
} finally {
  await browser?.close(); server.kill(); await new Promise(resolve => backend.close(resolve));
}
