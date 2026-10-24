// Run Vite on port 1427 first. These real UI fixtures use sample data, never the desktop database.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const root = new URL("../", import.meta.url);
const origin = process.env.README_PREVIEW_ORIGIN || "http://localhost:1427";
const errors = [];
await mkdir(new URL("docs/screenshots/", root), { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 850 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.message));
  for (const [fixture, name] of [
    ["overview", "daily-plan-overview"], ["board-overview", "project-overview"],
    ["reading-overview", "reading-overview"], ["uni-overview", "university-overview"],
  ]) {
    await page.goto(`${origin}/tests/${fixture}-preview.html?w=12&h=8&theme=light`);
    const tile = page.locator(".tile-cell").first();
    await tile.waitFor();
    if (fixture === "reading-overview") await page.evaluate(async () => {
      const { api } = await import("/src/features/reading/api.ts");
      const { readingChanged } = await import("/src/features/reading/readingUi.ts");
      const original = api.summary;
      api.summary = async (...args) => {
        const data = await original(...args);
        data.reading[0] = { ...data.reading[0], authors: "Ursula K. Le Guin", total: 620, percent: 32, coverUrl: "fixture-cover-0" };
        data.reading[1] = { ...data.reading[1], title: "A Field Guide to Getting Lost", authors: "Rebecca Solnit" };
        return data;
      };
      readingChanged();
    });
    if (fixture === "board-overview") await page.evaluate(async () => {
      const { api } = await import("/src/features/project_board/api.ts");
      const { refreshBoardOverview } = await import("/src/features/project_board/overview/data.ts");
      const list = api.listProjects, board = api.getBoard;
      const projectNames = ["Autumn coursework", "Personal website", "Home projects"];
      const taskNames = ["Outline the research question", "Review lecture notes", "Draft the introduction", "Prepare the presentation", "Collect feedback", "Revise the first draft", "Check references", "Submit the final version"];
      api.listProjects = async () => (await list()).slice(0, 3).map((project, index) => ({ ...project, name: projectNames[index] }));
      api.getBoard = async id => {
        const data = await board(id);
        data.project.name = projectNames[Number(id.slice(1))];
        data.columns = data.columns.map((column, index) => ({ ...column, name: ["Backlog", "In progress", "Review", "Done"][index], wipLimit: index === 1 ? 3 : null }));
        data.tasks = data.tasks.slice(0, 8).map((task, index) => ({ ...task, title: taskNames[index] }));
        return data;
      };
      await refreshBoardOverview(true);
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    await tile.screenshot({ path: fileURLToPath(new URL(`docs/screenshots/${name}.png`, root)) });
    console.log(`Captured ${name}`);
  }
  await page.goto(`${origin}/tests/overview-visibility-preview.html`);
  await page.getByRole("button", { name: "Extensions (Ctrl+Shift+X)", exact: true }).click();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  await page.locator(".ext-item").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  // End the crop after a complete card, rather than halfway through the next theme.
  await page.locator(".sidebar").evaluate(sidebar => {
    const bottom = sidebar.querySelectorAll(".ext-item")[2].getBoundingClientRect().bottom;
    sidebar.style.height = `${bottom - sidebar.getBoundingClientRect().top + 12}px`;
  });
  await page.locator(".sidebar").screenshot({ path: fileURLToPath(new URL("docs/screenshots/theme-library.png", root)) });
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
