import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir(".qa.local/lemma-dialogue", { recursive: true });
async function fresh(path = "lemma-dialogue-preview.html") {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-15T12:00:00Z") });
  await page.goto("http://localhost:1427/tests/" + path);
  await page.locator('.lemma-face[data-renderer="3d"]').first().waitFor();
  await page.mouse.move(1200, 950);
  return { context, page };
}
const advance = async (page, ms) => { await page.clock.fastForward(ms); await page.clock.runFor(150); };
const click = (page, name) => page.getByRole("button", { name, exact: true }).click();
const kind = page => page.getByTestId("remark").getAttribute("data-lemma-dialogue");
const planCalls = page => page.evaluate(() => window.dialogueFixture.commands.filter(command => command === "plan_summary").length);
try {
  {
    const { context, page } = await fresh();
    assert.equal(await planCalls(page), 0, "no task data is read without permission");
    await click(page, "Witty");
    await click(page, "Crimson");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "crimson");
    await page.screenshot({ path: ".qa.local/lemma-dialogue/crimson.png", animations: "disabled" });
    await advance(page, 13000);
    await click(page, "New outfit");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "outfit");
    await advance(page, 13000);
    await click(page, "Rename Nova");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "rename");
    assert.match(await page.getByTestId("remark").textContent(), /Nova/);
    await click(page, "Focus");
    assert.equal(await kind(page), null, "focus hides an active remark");
    await click(page, "Ocean");
    await advance(page, 20000);
    await click(page, "Idle");
    await page.clock.runFor(4000);
    assert.equal(await kind(page), null, "a suppressed reaction expires instead of returning after focus");
    await click(page, "Thinking");
    await click(page, "New outfit");
    await advance(page, 20000);
    assert.equal(await kind(page), null, "AI activity suppresses character remarks");
    await click(page, "Idle");
    await page.clock.runFor(4000);
    assert.equal(await kind(page), null, "busy-state reactions expire instead of interrupting the next task");
    await click(page, "Comments off");
    await click(page, "Crimson");
    await advance(page, 310000);
    assert.equal(await kind(page), null);
    await click(page, "Comments on");
    await click(page, "Ocean");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "theme");
    await page.getByRole("textbox", { name: "Message" }).press("a");
    assert.equal(await kind(page), null, "typing immediately clears the caption");
    assert.equal(await page.evaluate(() => window.dialogueFixture.commands.some(command => /assistant_(send|quick)|ai_transcribe/.test(command))), false, "remarks never call AI");
    await context.close();
    console.log("PASS: appearance/name reactions, personality, debounce, focus, expiry, typing, mute and no AI calls");
  }
  {
    const { context, page } = await fresh();
    await click(page, "Allow plan");
    await page.waitForFunction(() => window.dialogueFixture.commands.includes("plan_summary"));
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "access");
    await advance(page, 13000);
    await click(page, "Allow journal");
    await page.clock.runFor(200);
    await click(page, "Disable journal");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "permissions");
    assert.match(await page.getByTestId("remark").textContent(), /Journal/);
    assert.equal(await page.evaluate(() => window.dialogueFixture.commands.some(command => command.startsWith("journal_"))), false, "permissions never cause a journal read");
    await advance(page, 13000);
    await click(page, "Complete day");
    await page.clock.runFor(2300);
    assert.equal(await kind(page), "dayDone");
    await click(page, "Revoke all");
    assert.equal(await kind(page), null, "revocation immediately removes a private-data remark");
    const before = await planCalls(page);
    await page.evaluate(() => window.dialogueFixture.refresh());
    await page.clock.runFor(1000);
    assert.equal(await planCalls(page), before, "data changes cannot read a revoked area");
    await context.close();
    console.log("PASS: factual access boundaries, no private-area reads, final-task reaction and immediate revocation");
  }
  {
    const { context, page } = await fresh();
    await page.evaluate(() => window.dialogueFixture.slow());
    await click(page, "Allow plan");
    await page.waitForFunction(() => window.dialogueFixture.commands.includes("plan_summary"));
    await click(page, "Revoke all");
    await page.evaluate(() => { window.dialogueFixture.complete(); window.dialogueFixture.release(); });
    await page.clock.runFor(3000);
    assert.notEqual(await kind(page), "dayDone", "a late response after revocation is ignored");
    assert.doesNotMatch(await page.getByTestId("remark").textContent(), /Finish the real/);
    await context.close();
    console.log("PASS: in-flight data cannot restore revoked context");
  }
  for (const completedWhileAway of [false, true]) {
    const { context, page } = await fresh();
    await click(page, "Allow plan");
    await page.waitForFunction(() => window.dialogueFixture.commands.includes("plan_summary"));
    await page.clock.runFor(2300);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (completedWhileAway) await page.evaluate(() => window.dialogueFixture.complete());
    await advance(page, 310000);
    assert.equal(await kind(page), null, "background windows do not chatter");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(300);
    assert.equal(await kind(page), completedWhileAway ? "return" : "returnTask");
    if (!completedWhileAway) {
      assert.match(await page.getByTestId("remark").textContent(), /Finish the real focus task/);
      assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes("Finish the real focus task"))), false, "task context is not persisted by dialogue");
    } else assert.doesNotMatch(await page.getByTestId("remark").textContent(), /Finish the real/);
    await context.close();
  }
  console.log("PASS: grounded return greetings, fresh task validation, stale-task rejection and no stored task names");
  {
    const { context, page } = await fresh();
    await click(page, "Allow plan");
    await page.clock.runFor(2300);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await advance(page, 310000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(300);
    assert.equal(await kind(page), "returnTask");
    await page.evaluate(() => window.dialogueFixture.switchAccount());
    await page.clock.runFor(300);
    assert.equal(await kind(page), null, "account changes clear the previous account's remark");
    await context.close();
  }
  {
    const { context, page } = await fresh();
    await click(page, "Allow plan");
    await page.clock.runFor(2300);
    await page.evaluate(() => { window.dialogueFixture.slow(); window.dialogueFixture.refresh(); });
    await page.clock.runFor(100);
    await page.evaluate(() => window.dialogueFixture.switchAccount());
    await page.clock.runFor(100);
    await page.evaluate(() => window.dialogueFixture.release());
    await page.clock.runFor(3000);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await advance(page, 310000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(300);
    assert.equal(await kind(page), "return", "late results from the previous account cannot become return context");
    assert.doesNotMatch(await page.getByTestId("remark").textContent(), /Finish the real/);
    await context.close();
  }
  console.log("PASS: account changes clear private remarks and discard old in-flight task responses");
  for (const size of ["w=3&h=3", "w=8&h=5"]) {
    const { context, page } = await fresh("lemma-overview-preview.html?" + size + "&quiet");
    await page.evaluate(async () => {
      const { shadowThemes } = await import("/src/themes/shadow_themes/index.ts");
      const { applyTheme } = await import("/src/shell/theme/applyTheme.ts");
      applyTheme(shadowThemes.themes[0]);
    });
    await page.clock.runFor(2500);
    assert.equal(await page.locator(".lemma-speech[data-lemma-dialogue=crimson]").count(), 1);
    assert.equal(await page.locator(".tile-fitted .panel-body").evaluate(node => node.scrollHeight <= node.clientHeight + 2 && node.scrollWidth <= node.clientWidth + 2), true, "dialogue fits " + size);
    await page.screenshot({ path: ".qa.local/lemma-dialogue/overview-" + size.replaceAll("&", "-") + ".png", animations: "disabled" });
    await context.close();
  }
  console.log("PASS: the real overview speech bubble fits short and wide tiles with character remarks");
  {
    const { context, page } = await fresh();
    await advance(page, 310000);
    await click(page, "Completed stretch");
    assert.equal(await kind(page), "stretch");
    const first = await page.getByTestId("remark").textContent();
    await page.clock.runFor(8500);
    assert.equal(await kind(page), null);
    await click(page, "Completed stretch");
    assert.equal(await kind(page), null, "every animation does not become a remark");
    await advance(page, 310000);
    await click(page, "Completed stretch");
    assert.equal(await kind(page), "stretch");
    assert.notEqual(await page.getByTestId("remark").textContent(), first, "recent wording is avoided");
    await context.close();
    console.log("PASS: animation remarks follow completed events, respect the ambient budget and vary their wording");
  }
  {
    const { context, page } = await fresh("lemma-preview.html");
    await page.getByRole("tab", { name: "Personality", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await input.fill("Orbit");
    await input.press("Tab");
    await page.clock.runFor(5500);
    const caption = page.locator(".lemma-preview-caption [data-lemma-dialogue=rename]");
    assert.match(await caption.textContent(), /Orbit/);
    await page.screenshot({ path: ".qa.local/lemma-dialogue/wardrobe.png", animations: "disabled" });
    await page.getByRole("tab", { name: "Presence", exact: true }).click();
    await page.getByRole("switch", { name: "Occasional comments" }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.lemma.preferences")).chatter), false);
    await page.reload();
    await page.getByRole("tab", { name: "Presence", exact: true }).click();
    assert.equal(await page.getByRole("switch", { name: "Occasional comments" }).getAttribute("aria-checked"), "false");
    await context.close();
    console.log("PASS: the real wardrobe acknowledges a finished name edit and remembers the comments switch");
  }
  {
    const { context, page } = await fresh();
    assert.equal(await kind(page), null, "nothing to say about a book nobody has opened");
    await page.evaluate(() => window.dialogueFixture.startQuietBook());
    await page.clock.runFor(300);
    await page.locator('[data-testid=remark][data-lemma-dialogue=whisper]').waitFor();
    assert.match(await page.getByTestId("remark").textContent(), /asks questions back/);
    assert.match(await page.evaluate(() => localStorage.getItem("axiom.achievements.secrets")), /quiet-word/);
    await advance(page, 320000);
    await page.evaluate(() => window.dialogueFixture.refresh());
    await page.clock.runFor(300);
    assert.notEqual(await kind(page), "whisper", "it is only ever said once");
    await context.close();
    console.log("PASS: Lemma's quiet word about a certain book is said once");
  }
  {
    const { context, page } = await fresh("lemma-cards-preview.html");
    const caption = page.locator(".lemma-chat-companion > p");
    assert.match(await caption.textContent(), /ready|decision|final say|review/i, "real pending cards explain who makes the decision");
    await context.close();
  }
  {
    const { context, page } = await fresh("desk-preview.html?idle&quiet");
    await page.evaluate(async () => {
      const { shadowThemes } = await import("/src/themes/shadow_themes/index.ts");
      const { applyTheme } = await import("/src/shell/theme/applyTheme.ts");
      applyTheme(shadowThemes.themes[0]);
    });
    await page.clock.runFor(2500);
    assert.equal(await page.locator(".desk-bubble[data-lemma-dialogue]").isVisible(), true);
    await page.screenshot({ path: ".qa.local/lemma-dialogue/desktop.png", animations: "disabled" });
    await page.evaluate(() => window.emitTauri("desk-say", "Important real reminder"));
    await page.clock.runFor(200);
    assert.match(await page.locator(".desk-bubble").first().textContent(), /Important real reminder/);
    assert.equal(await page.locator(".desk-bubble[data-lemma-dialogue]").count(), 0, "important bubbles replace chatter");
    await context.close();
    console.log("PASS: the real native mini uses its speech bubble and gives functional messages priority");
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
