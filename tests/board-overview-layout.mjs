// Run against the Vite fixture; all data and card mutations are in memory.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = process.env.BOARD_OVERVIEW_TEST_URL || "http://localhost:1427/tests/board-overview-preview.html";
await mkdir(".qa.local", { recursive: true });
await page.clock.install({ time: new Date("2026-10-22T14:15:00+01:00") });
const prefKey = "axiom.projectBoard.overviewLayouts.v1";
async function open(w, h, extra = "") {
  await page.goto(`${base}?w=${w}&h=${h}${extra}`);
  await page.locator(".pb-ov-root, .pb-ov-start, .pb-ov-status").first().waitFor();
  if (!extra.includes("fail=true") && !extra.includes("empty=true")) await page.locator(".pb-ov-root").waitFor();
  await page.waitForTimeout(80);
}
async function menu() { await page.getByRole("button", { name: "Project Board display options", exact: true }).click({ button: "right" }); }
async function select(name) {
  await menu(); await page.getByRole("radio", { name, exact: true }).click(); await page.keyboard.press("Escape");
  if (name === "Recent activity") await page.locator(".pb-ov-activity").waitFor();
  await page.waitForTimeout(40);
}
async function option(label, value) {
  await menu(); await page.getByLabel(label, { exact: true }).selectOption(value); await page.keyboard.press("Escape"); await page.waitForTimeout(50);
}
async function noOverflow(label) {
  const overflow = await page.locator(".tile-fitted").evaluate((tile) => {
    const nodes = [...tile.querySelectorAll(".panel-body, .pb-ov-root, .pb-ov-content, .pb-ov-list, .pb-ov-kanban, .pb-ov-lanes, .pb-ov-lane, .pb-ov-dashboard, .pb-ov-dashboard-columns, .pb-ov-timeline, .pb-ov-progress, .pb-ov-activity")];
    return nodes.filter((node) => node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2).map((node) => ({ className: node.className, w: node.clientWidth, sw: node.scrollWidth, h: node.clientHeight, sh: node.scrollHeight }));
  });
  assert.deepEqual(overflow, [], `${label}: rendered overflow`);
  const scrolling = await page.locator(".tile-fitted").evaluate((tile) => [...tile.querySelectorAll("*")].filter((node) => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight).map((node) => node.className));
  assert.deepEqual(scrolling, [], `${label}: nested scrollbar`);
}
try {
  for (const [w, h] of [[2, 2], [3, 3], [4, 4], [8, 5], [4, 9], [8, 9], [12, 16]]) {
    await open(w, h); await noOverflow(`${w}x${h} auto`);
    console.log(`${w}x${h}: ${await page.locator(".pb-ov-root").getAttribute("data-view")}`);
    await page.screenshot({ path: `.qa.local/board-${w}x${h}.png` });
  }
  await open(8, 9);
  const names = ["At a glance", "Next actions", "Task list", "Deadlines", "High priority", "Without deadlines", "Overall progress", "Project progress", "Project cards", "Workflow load", "Mini Kanban", "Deadline timeline", "Label breakdown", "Recent activity", "Project dashboard"];
  for (const name of names) { await select(name); await noOverflow(name); await page.screenshot({ path: `.qa.local/board-${name.replace(/[^a-z]+/gi, "-")}.png` }); }
  console.log("PASS: all 15 views");

  await open(3, 3); await select("High priority"); await page.reload(); await page.locator('.pb-ov-root[data-view="priorities"]').waitFor();
  await menu(); assert.equal(await page.getByRole("radio", { name: "Mini Kanban", exact: true }).isDisabled(), true); await page.keyboard.press("Escape");
  await open(4, 4); assert.equal(await page.locator(".pb-ov-root").getAttribute("data-view"), "tasks");
  const first = await page.locator(".pb-ov-task-main").first().getAttribute("title");
  await page.getByRole("button", { name: "Next cards page", exact: true }).click();
  assert.notEqual(await page.locator(".pb-ov-task-main").first().getAttribute("title"), first);

  await open(8, 9); await select("Task list"); await option("Project scope", "p1");
  assert.match(await page.locator(".pb-ov-heading strong").textContent(), /Application redesign/);
  await page.locator(".pb-ov-task-main").first().click();
  assert.match(await page.getByTestId("target").textContent(), /^p1\/p1t/);
  await page.getByRole("button", { name: "Mount full board", exact: true }).click();
  await page.locator(".pb-tab.is-active").filter({ hasText: "Application redesign" }).waitFor();
  await page.locator(".pb-drawer").waitFor();
  assert.equal(await page.getByTestId("target").textContent(), "None", "Navigation destination is consumed");

  await open(8, 9); await option("Project scope", "p0"); await select("Task list");
  const completedTitle = await page.locator(".pb-ov-task-main").first().getAttribute("title");
  await page.getByRole("checkbox").first().click(); await page.waitForTimeout(100);
  assert.notEqual(await page.locator(".pb-ov-task-main").first().getAttribute("title"), completedTitle, "Completed card leaves open list");
  await option("Project scope", "p7"); assert.equal(await page.getByRole("checkbox").first().isDisabled(), true, "No Done column cannot complete");
  await option("Project scope", "all"); await option("Priority filter", "3"); await select("Task list");
  const priorities = await page.locator(".pb-ov-priority").allTextContents(); assert(priorities.every((value) => value === "High"));
  await option("Priority filter", "all"); await option("Label filter", "none");
  await noOverflow("filtered task list");
  await option("Label filter", "all"); await select("Label breakdown");
  await page.locator(".pb-ov-label-row").first().click(); assert.equal(await page.locator(".pb-ov-root").getAttribute("data-view"), "tasks");
  assert.match(await page.locator(".pb-ov-heading strong").textContent(), /filtered/);

  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  await open(8, 9, "&partial=true"); await page.locator(".pb-ov-notice").waitFor(); assert.match(await page.locator(".pb-ov-notice").textContent(), /partial/); await noOverflow("partial data");
  await page.getByRole("button", { name: "Recover data", exact: true }).click(); await page.locator(".pb-ov-notice").waitFor({ state: "detached" });
  await option("Project scope", "p1"); await page.getByRole("button", { name: "Delete project fixture", exact: true }).click(); await page.locator(".pb-ov-notice").waitFor(); assert.match(await page.locator(".pb-ov-notice").textContent(), /Saved project unavailable/);
  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  await open(4, 4, "&fail=true"); await page.getByRole("button", { name: "Retry", exact: true }).waitFor(); await page.getByRole("button", { name: "Recover data", exact: true }).click(); await page.locator(".pb-ov-root").waitFor();
  await open(2, 2, "&empty=true"); await noOverflow("empty project list");
  await open(8, 9, "&theme=light&tasks=none"); await noOverflow("empty light dashboard");
  await select("Mini Kanban"); await noOverflow("empty Kanban");
  await open(8, 9, "&columns=none"); await select("Workflow load"); await noOverflow("no columns");
  console.log("PASS: filters, paging, completion, deep links, no Done column, recovery and empty states");

  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  await open(8, 9); await select("Mini Kanban");
  await page.setViewportSize({ width: 600, height: 900 }); await page.waitForTimeout(100);
  assert.notEqual(await page.locator(".pb-ov-root").getAttribute("data-view"), "kanban", "Narrow window falls back");
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.waitForTimeout(100);
  assert.equal(await page.locator(".pb-ov-root").getAttribute("data-view"), "kanban", "Saved view restores");
  await page.getByRole("button", { name: "Project Board display options", exact: true }).focus();
  await page.keyboard.press("Shift+F10"); await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Home"); assert.equal(await page.getByRole("radio", { name: "Auto fit", exact: true }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press("Escape"); assert.equal(await page.getByRole("button", { name: "Project Board display options", exact: true }).evaluate((node) => node === document.activeElement), true);
  await select("Overall progress");
  assert.match(await page.locator(".pb-ov-progress-main").textContent(), /28\/144/);
  await menu(); await page.getByLabel("Include subtasks in counts and views", { exact: true }).check(); await page.keyboard.press("Escape");
  assert.match(await page.locator(".pb-ov-progress-main").textContent(), /28\/152/, "Subtasks change totals, archived cards do not");
  await select("Task list"); await menu(); await page.getByLabel("Include completed in card views", { exact: true }).check(); await page.keyboard.press("Escape");
  assert.match(await page.locator(".pb-ov-pager").textContent(), /of 152/);
  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  await open(4, 4, "&mutationFailure=true"); await option("Project scope", "p0");
  const unchanged = await page.locator(".pb-ov-task-main").first().getAttribute("title");
  await page.getByRole("checkbox").first().click(); await page.locator(".pb-ov-notice").waitFor();
  assert.match(await page.locator(".pb-ov-notice").textContent(), /Test completion failure/);
  assert.equal(await page.locator(".pb-ov-task-main").first().getAttribute("title"), unchanged); await noOverflow("failed completion");
  const model = await page.evaluate(async () => {
    const { api } = await import("/src/features/project_board/api.ts");
    const { flattenBoards, filterCards, sortCards, DEFAULTS, dayIndex, addDays } = await import("/src/features/project_board/overview/model.ts");
    const { mapProjects } = await import("/src/features/project_board/overview/data.ts");
    const cards = filterCards(flattenBoards([await api.getBoard("p0")]), DEFAULTS);
    const due = sortCards(cards.filter((card) => !card.completedAt), "due").map((card) => card.dueDate ?? "9999-12-31");
    let active = 0, peak = 0;
    const results = await mapProjects(Array.from({ length: 11 }, (_, i) => i), async (i) => {
      peak = Math.max(peak, ++active); await new Promise((resolve) => queueMicrotask(resolve)); active--;
      if (i === 5) throw new Error("Expected isolated failure"); return i;
    });
    return { due, peak, results: results.map((item) => item.status), calendarDays: dayIndex(addDays("2026-10-24", 2)) - dayIndex("2026-10-24") };
  });
  assert.deepEqual(model.due, [...model.due].sort()); assert.equal(model.peak, 4); assert.equal(model.results.filter((result) => result === "rejected").length, 1); assert.equal(model.calendarDays, 2);
  console.log("PASS: keyboard, resize fallback, counts, mutation failure, bounded loading and calendar arithmetic");

  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  for (const [w, h] of [[3, 3], [4, 4], [8, 5], [4, 9], [6, 7], [8, 9]]) {
    await open(w, h); await option("List density", "comfortable"); await menu();
    const options = await page.getByRole("radio").evaluateAll((radios) => radios.filter((r) => !r.disabled).map((r) => r.getAttribute("aria-label"))); await page.keyboard.press("Escape");
    for (const name of options) { await select(name); await noOverflow(`${w}x${h} ${name} comfortable`); }
  }
  console.log("PASS: all available views at six sizes with comfortable density");
  await page.evaluate((key) => localStorage.removeItem(key), prefKey);
  for (const viewport of [700, 1100, 1440]) {
    await page.setViewportSize({ width: viewport, height: 1100 }); await open(4, 4);
    for (const w of Array.from({ length: 11 }, (_, i) => i + 2)) for (const h of Array.from({ length: 15 }, (_, i) => i + 2)) {
      await page.getByLabel("Grid width", { exact: true }).fill(String(w)); await page.getByLabel("Grid height", { exact: true }).fill(String(h));
      await page.waitForTimeout(40); await noOverflow(`${viewport}px ${w}x${h}`);
    }
    console.log(`PASS: all 165 grid sizes at ${viewport}px`);
  }
  assert.deepEqual(errors, [], "Browser errors");
  console.log("PASS: Project Board overview regression suite");
} finally { await browser.close(); }
