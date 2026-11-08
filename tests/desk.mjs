// Lemma on the desktop: just Lemma, who becomes the timer (the time glowing
// under him, a halo at his feet, its last minute beating like a heart, how
// long's left and when it ends when pointed at) for tasks, study and
// reading; materialises and dissolves as a hologram; recalls what he said;
// throws sparks when things are done; dozes late at night; ducks, gets
// dizzy and glances at new windows; opens a quick menu when held; asks if
// you're still on it; reacts to the inbox and to tasks moving again;
// remembers the week's sessions; shows flow, focus rings and the weather;
// stretches in the morning and waves goodbye; pauses,
// carries on and cheers when it's done; breaks focus into rounds and sums
// them up; shakes, chimes and notifies when a task's time is up (with 5
// more min); asks how study and reading went when stopped, and logs it;
// notices something about to start (Join for a meeting online); follows the
// cursor with his eyes (timing or not) and looks straight at you when you
// deal with him; tucks into the screen's edge as a notch that peeks and shows
// the day's progress, popping out when wanted; says hello when tapped;
// listens when double-clicked (or called with Ctrl+Alt+Space) and takes
// typing on a middle-click, doing a small thing straight away with an Undo,
// keeping reminders and handing anything bigger to a chat, keeping nothing;
// keeps what's dropped on him; asks whether time away counts; does what the
// timer keys say; keeps out of the way of full-screen apps; mentions
// birthdays and bills; asks how today was; resizes, hides from a
// right-click; and his settings.
// Run against Vite on port 1427: node tests/desk.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  // A pretend microphone, allowed without asking.
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const url = process.env.DESK_TEST_URL || "http://localhost:1427/tests/desk-preview.html";
await mkdir(".qa.local", { recursive: true });
const calls = (page) => page.evaluate(() => [...window.deskCalls]);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("axiom.desk")));
try {
  const page = await browser.newPage({ viewport: { width: 340, height: 460 } });
  await page.context().grantPermissions(["microphone"], { origin: new URL(url).origin });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const face = async () => ((await page.locator(".desk-time").count()) ? page.locator(".desk-time").textContent() : null);
  const looking = () => page.locator(".desk").getAttribute("data-looking");
  // The timer's readout, under him (his face stays his own).
  const faceIs = (pattern) => page.waitForFunction((source) => new RegExp(source).test(document.querySelector(".desk-time")?.textContent ?? ""), pattern.source);
  const open = async (query) => {
    await page.mouse.move(330, 450);
    await page.goto(`${url}${query}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    // A wallpaper behind him, as on a desktop, for the screenshots.
    await page.evaluate(() => (document.documentElement.style.background = "linear-gradient(160deg, #3b4a8c, #c77b8b)"));
    await page.locator(".desk-lemma").waitFor();
  };
  const talk = async () => {
    await page.locator(".desk-lemma").dblclick();
    await page.getByText(/^Listening/).waitFor();
    await page.waitForTimeout(1200);
    await page.locator(".desk-lemma").dblclick();
  };

  // A task being timed: he becomes the timer, the time left in his face.
  await open("?timers");
  await page.locator(".desk-ring-done").waitFor();
  await faceIs(/^3[23]:\d\d$/);
  assert.equal(await page.locator(".desk-controls-title").textContent(), "Write the quarterly report");
  assert.equal(await page.locator(".desk-controls").evaluate((el) => getComputedStyle(el).visibility), "hidden", "its name and buttons wait for the mouse");
  await page.waitForFunction(() => window.deskCalls.includes("desk_show"));
  await page.waitForFunction(() => window.deskSizes.length > 0);
  const [w] = (await page.evaluate(() => window.deskSizes.at(-1))).split("x").map(Number);
  assert.ok(w < 320, `the window fits him, not a card (${w}px wide)`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-running.png" });

  // Paused (the buttons show with the mouse over him): he dozes, and stays.
  await page.locator(".desk").hover();
  // Pointed at: how long's left and when it ends.
  await page.locator(".desk-controls-detail", { hasText: /^3[23] min left · ends \d/ }).waitFor();
  await page.waitForFunction(() => document.querySelector(".desk")?.getAttribute("data-looking") === "you");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByText("Paused: Write the quarterly report").waitFor();
  await page.waitForTimeout(3000);
  assert.ok(!(await calls(page)).includes("desk_hide"), "a paused task keeps him out");
  await page.screenshot({ path: ".qa.local/desk-paused.png" });
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor({ state: "attached" });

  // Done: a cheer, then (set to come out only for timers) he goes.
  await page.locator(".desk").hover();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByText(/^Done[!.] /).waitFor();
  await page.locator(".desk-burst").waitFor({ state: "attached" });
  await page.screenshot({ path: ".qa.local/desk-done.png" });
  await page.waitForFunction(() => window.deskCalls.includes("desk_hide"), null, { timeout: 5000 });

  // Time's up: the face stops at 0:00 in red (no counting on past it), he
  // shakes, the system notifies, and his bubble offers Done, 5 more min and
  // Stop. Still timing, his eyes keep following the cursor.
  await open("?over&sound");
  await page.locator(".desk-ring.is-over").waitFor();
  await faceIs(/^0:00$/);
  await page.getByText("Time's up on Write the quarterly report!").waitFor();
  await page.waitForFunction(() => window.deskCalls.includes("desk_notify:Time's up") && window.deskCalls.includes("desk_chime:up"));
  await page.locator(".desk.is-shaking").waitFor({ state: "attached" });
  await page.screenshot({ path: ".qa.local/desk-times-up.png" });
  await page.evaluate(() => Object.assign(window.cursor, { x: 40, y: 30 }));
  await page.waitForTimeout(600);
  assert.equal(await looking(), "cursor", "timing, he still follows the cursor");
  await page.getByRole("button", { name: "5 more min" }).click();
  await faceIs(/^[23]:\d\d$/);
  assert.equal(await page.locator(".desk-ring.is-over").count(), 0, "counting down again");
  await page.evaluate(() => Object.assign(window.cursor, { x: 1000, y: 600 }));

  // The last minute: the time and his halo beat like a heart.
  await open("?final");
  await page.locator(".desk-time.is-final").waitFor();
  await page.locator(".desk-ring.is-final").waitFor({ state: "attached" });
  await page.screenshot({ path: ".qa.local/desk-final.png" });

  // About to be put away: he dissolves; asked back meanwhile, he materialises again.
  await page.evaluate(() => window.emitTauri("desk-leave"));
  await page.locator(".desk.is-leaving").waitFor({ state: "attached" });
  await page.evaluate(() => window.emitTauri("desk-stay"));
  await page.locator(".desk.is-arriving").waitFor({ state: "attached" });

  // In rounds: after 25 minutes the timer pauses for a break, counted in green.
  await open("?rounds");
  await page.getByText(/Back in 5 min.|Break time: 5 min/).waitFor();
  await faceIs(/^[45]:\d\d$/);
  await page.locator(".desk-ring.is-break").waitFor();
  await page.screenshot({ path: ".qa.local/desk-break.png" });
  // Finished after its rounds: summed up.
  await page.locator(".desk").hover();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByText("Done! 1 round, 12 min on Write the quarterly report.").waitFor();

  // Study time, then reading time: stopped from him, he asks how it went
  // and logs it himself (with an Undo); Axiom doesn't open.
  await open("?study");
  await faceIs(/^25:0\d$/);
  await page.locator(".desk-ring-dot").waitFor();
  await page.locator(".desk").hover();
  await page.getByRole("button", { name: "Stop and log" }).click();
  await page.getByText("25 min on Rust for Rustaceans. What did you cover?").waitFor();
  await page.screenshot({ path: ".qa.local/desk-study-asks.png" });
  await page.getByRole("textbox", { name: "Your answer" }).fill("Ownership and borrowing");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Logged 25 min on Rust for Rustaceans.").waitFor();
  await page.getByRole("button", { name: "Undo" }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.acts), [{ tool: "learning_log_session", args: { source_id: "s1", minutes: 25, note: "Ownership and borrowing" } }]);
  assert.equal(await page.evaluate(() => localStorage.getItem("axiom.learning.timer")), null, "the timer's stopped");
  assert.ok(!(await page.evaluate(() => window.opened)).includes("learning"), "Axiom stays put");
  await open("?reading");
  assert.equal(await page.locator(".desk-controls-title").textContent(), "Dune");
  await page.screenshot({ path: ".qa.local/desk-reading.png" });
  await page.locator(".desk").hover();
  await page.getByRole("button", { name: "Stop and log" }).click();
  await page.getByText("40 min of Dune. Which page did you get to?").waitFor();
  await page.getByRole("spinbutton", { name: "Your answer" }).fill("152");
  await page.keyboard.press("Enter");
  await page.getByText("Logged 40 min of Dune.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.acts), [{ tool: "reading_log", args: { id: "b1", at: 152, minutes: 40 } }]);

  // Something about to start: he says so.
  await open("?soon");
  await page.getByText(/Team meeting starts in (9|10) min\./).waitFor();
  await page.screenshot({ path: ".qa.local/desk-soon.png" });

  // A meeting online, from the calendar: Join opens its link.
  await open("?idle&meeting&sound");
  await page.getByText(/^Standup starts in [45] min\.$/).waitFor();
  await page.waitForFunction(() => window.deskCalls.includes("desk_chime:soft"));
  await page.screenshot({ path: ".qa.local/desk-meeting.png" });
  // (The chip under him has its own Join too.)
  await page.getByRole("status").getByRole("button", { name: "Join" }).click();
  await page.waitForFunction(() => window.links.length > 0);
  assert.deepEqual(await page.evaluate(() => window.links), ["https://meet.google.com/abc-defg-hij"]);

  // Nothing timed: just him. His eyes follow the cursor while it moves,
  // then he faces the middle again; tapped, he says hello; anything done
  // today, he cheers.
  await open("?idle");
  assert.equal(await page.locator(".desk-ring, .desk-controls").count(), 0, "just him");
  assert.equal(await face(), null, "his own face");
  await page.evaluate(() => Object.assign(window.cursor, { x: 40, y: 30 }));
  await page.waitForFunction(() => document.querySelector(".desk")?.getAttribute("data-looking") === "cursor");
  await page.waitForFunction(() => document.querySelector(".desk")?.getAttribute("data-looking") === "middle", null, { timeout: 6000 });
  await page.screenshot({ path: ".qa.local/desk-idle.png" });
  await page.locator(".desk-lemma").click();
  // Never talked to him, a tap gets how to talk to him (his way) rather than hello.
  await page.getByText(/^(Double-click me to talk\.|Psst: double-click me and I'll listen\.)$/).waitFor();
  // Pointed at, what he's saying waits; the mouse moves on, and it goes.
  await page.mouse.move(330, 450);
  await page.waitForTimeout(3800);
  await page.evaluate(() => window.finishAnother());
  await page.getByText(/2 done today/).waitFor();
  await page.screenshot({ path: ".qa.local/desk-cheer.png" });
  // What he said lately: kept while he's out, from his menu.
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "What did you say?" }).click();
  await page.getByRole("dialog", { name: "What I said" }).getByText(/2 done today/).waitFor();
  await page.screenshot({ path: ".qa.local/desk-recall.png" });
  await page.getByRole("button", { name: "Close" }).click();

  // Talking: he hears a small thing, does it, says so with an Undo, and
  // becomes its timer. Nothing but the request is sent; no chat is made.
  await open("?idle");
  await talk();
  await page.getByText("On it: timing your essay now.").waitFor();
  await page.locator(".desk-controls-title").getByText("Essay").waitFor({ state: "attached" });
  assert.deepEqual(await page.evaluate(() => window.said), ["start a timer for my essay"]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".qa.local/desk-voice.png" });
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Undone.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.undone), [["quick-1"]]);

  // Typed to (a middle-click), instead of talking: the same small things.
  await open("?idle");
  await page.locator(".desk-lemma").click({ button: "middle" });
  await page.getByRole("textbox", { name: "Type to Lemma" }).fill("start a timer for my essay");
  await page.screenshot({ path: ".qa.local/desk-typing.png" });
  await page.keyboard.press("Enter");
  await page.getByText("On it: timing your essay now.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.said), ["start a timer for my essay"]);

  // Dropped on him: text is a task, a link goes to Learning (or Reading, or
  // a task), a file is a journal note; each with an Undo.
  await open("?idle");
  const drop = async (fill) => {
    const data = await page.evaluateHandle(fill);
    await page.locator(".desk").dispatchEvent("dragenter", { dataTransfer: data });
    await page.locator(".desk").dispatchEvent("drop", { dataTransfer: data });
  };
  await drop(() => {
    const d = new DataTransfer();
    d.setData("text/plain", "Call the bank\nabout the new card");
    return d;
  });
  await page.getByText("Added Call the bank to today.").waitFor();
  await page.getByRole("button", { name: "Undo" }).waitFor();
  await drop(() => {
    const d = new DataTransfer();
    d.setData("text/uri-list", "https://www.youtube.com/watch?v=abc");
    d.setData("text/html", '<a href="https://www.youtube.com/watch?v=abc">Rust ownership, explained</a>');
    return d;
  });
  await page.getByText("Keep Rust ownership, explained?").waitFor();
  await page.screenshot({ path: ".qa.local/desk-drop-link.png" });
  await page.getByRole("button", { name: "Learning" }).click();
  await page.getByText("Added Rust ownership, explained to Rust in Learning.").waitFor();
  await drop(() => {
    const d = new DataTransfer();
    d.items.add(new File(["Notes from the planning call."], "planning.txt", { type: "text/plain" }));
    return d;
  });
  await page.getByText("Saved planning.txt to your journal.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.acts), [
    { tool: "plan_add", args: { items: [{ title: "Call the bank", notes: "about the new card" }] } },
    { tool: "learning_add_source", args: { skill_id: "s1", kind: "video", title: "Rust ownership, explained", link: "https://www.youtube.com/watch?v=abc" } },
    { tool: "journal_write", args: { title: "planning.txt", text: "Notes from the planning call." } },
  ]);

  // Away from the computer with a task timed: back, he asks whether it counts.
  await open("");
  await page.evaluate(() => (window.deskState.idleSeconds = 600));
  await page.waitForTimeout(5600);
  await page.evaluate(() => (window.deskState.idleSeconds = 1));
  await page.getByText(/^Welcome back! You were away 1[01] min\. Count it\?$/).waitFor({ timeout: 8000 });
  await page.screenshot({ path: ".qa.local/desk-away.png" });
  await page.getByRole("button", { name: "Take it off" }).click();
  await page.getByText(/^Took 1[01] min off\.$/).waitFor();
  assert.ok((await calls(page)).some((c) => /^plan_take_off:t1:1[01]$/.test(c)));

  // The timer keys, as Rust passes them on: the main window pauses what's
  // timed and he says so; then it's done.
  await open("");
  await page.waitForFunction(() => window.deskCalls.includes("desk_timer_keys:true"));
  await page.evaluate(() => window.emitTauri("desk-key", "toggle"));
  await page.getByText("Paused Write the quarterly report.").waitFor();
  await page.evaluate(() => window.emitTauri("desk-key", "toggle"));
  await page.getByText("Back to Write the quarterly report.").waitFor();
  await page.evaluate(() => window.emitTauri("desk-key", "done"));
  await page.getByText(/^(Done: Write the quarterly report\.|.*2.* done today.*)$/).waitFor();

  // A full-screen app (or a call): he keeps out of the way until it's over.
  await open("?idle");
  await page.waitForFunction(() => window.deskCalls.includes("desk_show"));
  await page.evaluate(() => (window.deskState.fullScreen = true));
  await page.waitForFunction(() => window.deskCalls.includes("desk_hide"), null, { timeout: 8000 });
  const shows = (await calls(page)).filter((c) => c === "desk_show").length;
  await page.evaluate(() => (window.deskState.fullScreen = false));
  await page.waitForFunction((n) => window.deskCalls.filter((c) => c === "desk_show").length > n, shows, { timeout: 8000 });

  // A reminder: kept, then said when it's due, with Done and a snooze.
  await open("?idle&remind");
  await talk();
  await page.getByText("I'll remind you.").waitFor();
  await page.getByText("Reminder: Stretch").waitFor({ timeout: 15000 });
  await page.screenshot({ path: ".qa.local/desk-reminder.png" });
  await page.getByRole("button", { name: "In 10 min" }).click();
  const snoozed = await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.desk.reminders")));
  assert.equal(snoozed.length, 1);
  assert.ok(Math.abs(snoozed[0].at - Date.now() - 10 * 60_000) < 5000, "said again in 10 minutes");

  // Something bigger: he says it needs the chat, and it's asked there.
  await open("?idle&handoff");
  await talk();
  await page.getByText("Let's plan that in our chat.").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".qa.local/desk-handoff.png" });
  await page.getByRole("button", { name: "Open our chat" }).click();
  await page.waitForFunction(() => window.opened.includes("lemma") && window.deskCalls.includes("desk_open_main"));
  assert.equal(await page.locator(".handoff").innerText(), "plan my whole week");

  // Ctrl+Alt+Space, as Rust passes it on: he listens; Escape stops him.
  await open("?idle");
  await page.evaluate(() => window.emitTauri("desk-summon"));
  await page.getByText(/^Listening/).waitFor();
  assert.equal(await looking(), "you");
  await page.keyboard.press("Escape");
  await page.getByText("I didn't hear anything.").waitFor();

  // Scroll over him to resize him; right-click him for the menu.
  await open("?idle");
  const before = (await saved(page)).size ?? 130;
  await page.locator(".desk-lemma").hover();
  await page.mouse.wheel(0, -100);
  await page.waitForFunction((b) => JSON.parse(localStorage.getItem("axiom.desk")).size === b + 12, before);
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.locator(".desk-menu").waitFor();
  await page.screenshot({ path: ".qa.local/desk-menu.png" });
  await page.getByRole("menuitem", { name: "Smaller" }).click();
  await page.waitForFunction((b) => JSON.parse(localStorage.getItem("axiom.desk")).size === b, before);
  // Tucked into the edge from the menu; floating again the same way.
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Tuck into the edge" }).click();
  assert.equal((await saved(page)).style, "notch");
  await page.mouse.move(330, 450);
  // (The test's mouse jumps onto him for each click, so he ducks first: give him time.)
  await page.locator(".desk.is-tucked").waitFor({ timeout: 12000 });
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float freely" }).click();
  assert.equal((await saved(page)).style, "float");
  // Always on the desktop, Axiom carries on in the background when its window
  // closes; Quit, from his menu, ends it.
  await page.waitForFunction(() => window.deskCalls.includes("desk_background:true"));
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Quit Axiom" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_quit"));
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide from desktop" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_hide"));
  assert.equal((await saved(page)).mode, "off");
  // Off the desktop, closing the window quits as usual.
  await page.waitForFunction(() => window.deskCalls.includes("desk_background:false"));

  // Tucked into the edge: a small notch against the side of the screen,
  // with the time while a task runs; he pops out under the mouse (or to
  // say something) and tucks back after.
  await open("?notch");
  await page.locator(".desk.is-tucked.side-right").waitFor({ state: "attached", timeout: 6000 });
  await page.locator(".desk-tab-time", { hasText: /^3[23]:\d\d$/ }).waitFor();
  // No bar along its foot with only a timer on (a bar is for a meeting or a reminder).
  assert.equal(await page.locator(".desk-tab-progress").count(), 0);
  await page.waitForFunction(() => / dock$/.test(window.deskSizes.at(-1) ?? "") && parseInt(window.deskSizes.at(-1)) < 70);
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-notch.png" });
  // Pointed at: only a peek at what's on, however long; clicked, he comes out.
  // Approach gently so the separate fast-cursor duck reaction doesn't speak.
  const notchBox = await page.locator(".desk").boundingBox();
  await page.mouse.move(notchBox.x + notchBox.width / 2, notchBox.y + notchBox.height / 2, { steps: 30 });
  await page.locator(".desk.is-tucked .desk-peek", { hasText: "Write the quarterly report" }).waitFor();
  await page.screenshot({ path: ".qa.local/desk-notch-peek.png" });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator(".desk.is-tucked").count(), 1, "pointing doesn't bring him out");
  await page.locator(".desk-peek").getByRole("button", { name: "Pause" }).waitFor();
  await page.locator(".desk-lemma").click();
  assert.equal(await page.locator(".desk-bubble").count(), 0, "a click on the notch opens it, without a hello");
  await page.waitForFunction(() => !document.querySelector(".desk")?.classList.contains("is-tucked"));
  await page.waitForFunction(() => / dock$/.test(window.deskSizes.at(-1) ?? "") && parseInt(window.deskSizes.at(-1)) > 100);
  await page.locator(".desk-ring-done").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-notch-out.png" });
  // Popped out mid fade-in (squashed for a moment), he isn't drawn squashed:
  // his picture's resolution matches his size, so he's sharp, not smeared.
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector(".desk .lemma-face canvas");
    return canvas && { ratio: canvas.height / canvas.width, across: canvas.width / canvas.clientWidth };
  });
  if (drawn) {
    assert.ok(Math.abs(drawn.ratio - 1) < 0.05, `drawn square, not squashed (${drawn.ratio.toFixed(2)})`);
    assert.ok(drawn.across >= 0.95, `drawn at full resolution (${drawn.across.toFixed(2)})`);
  }
  // Out of the notch, the time is right under him (not pushed to the edge).
  const [lemmaBox, timeBox] = await Promise.all([page.locator(".desk-lemma").boundingBox(), page.locator(".desk-time").boundingBox()]);
  assert.ok(Math.abs(lemmaBox.x + lemmaBox.width / 2 - (timeBox.x + timeBox.width / 2)) < 3, "the time is centred under him");
  await page.mouse.move(330, 450);
  await page.locator(".desk.is-tucked").waitFor({ state: "attached", timeout: 12000 });

  // A meeting coming up (nothing timed): the notch counts down to it (amber
  // in its last five minutes); pointed at, it says what and when, with Join.
  await open("?notch&idle&meeting&later");
  await page.locator(".desk-tab-time.is-meeting", { hasText: /^2[45]m$/ }).waitFor({ state: "attached", timeout: 12000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-notch-meeting.png" });
  // A reminder set for later joins it: a dot for each.
  await page.evaluate(() => {
    localStorage.setItem("axiom.desk.reminders", JSON.stringify([{ id: "r1", text: "Call Sam", at: Date.now() + 20 * 60_000 }]));
    window.dispatchEvent(new Event("desk-reminders"));
  });
  await page.locator(".desk-tab-dots i").nth(1).waitFor({ state: "attached" });
  await page.locator(".desk-lemma").hover();
  await page.locator(".desk-peek-item.is-meeting", { hasText: /^Standup in 2[45] min · / }).waitFor();
  await page.locator(".desk-peek-item.is-reminder", { hasText: /^Call Sam · / }).waitFor();
  await page.screenshot({ path: ".qa.local/desk-notch-peek-all.png" });
  await page.locator(".desk-peek-item.is-meeting").getByRole("button", { name: "Join" }).click();
  await page.waitForFunction(() => window.links.includes("https://meet.google.com/abc-defg-hij"));
  await page.locator(".desk-peek-item.is-reminder").getByRole("button", { name: "Cancel" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("axiom.desk.reminders")).length === 0);
  // Out of the notch, the meeting shows under him.
  await page.locator(".desk-lemma").click();
  await page.locator(".desk-chip.is-meeting", { hasText: /^Standup in 2[45] min/ }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-out-meeting.png" });

  // Smaller or bigger, everything around him comes with him: what he says,
  // the time, his window. A short line is a small bubble at any size.
  const measured = async (size) => {
    await open(`?size=${size}`);
    await page.locator(".desk-time").waitFor();
    await page.evaluate(() => window.emitTauri("desk-say", "Rude!"));
    await page.getByText("Rude!").waitFor();
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const w = (s) => document.querySelector(s).getBoundingClientRect();
      return { bubble: w(".desk-bubble").width, words: parseFloat(getComputedStyle(document.querySelector(".desk-bubble p")).fontSize) * (parseFloat(getComputedStyle(document.querySelector(".desk-bubble")).zoom) || 1), time: w(".desk-time").height, desk: w(".desk").height };
    });
  };
  const small = await measured(72);
  const big = await measured(240);
  for (const part of ["bubble", "words", "time", "desk"]) assert.ok(big[part] > small[part] * 1.4, `${part} grows with him (${small[part].toFixed(0)} → ${big[part].toFixed(0)})`);
  assert.ok(small.bubble < 80 && big.bubble < 120, `a short line is a small bubble (${small.bubble.toFixed(0)}, ${big.bubble.toFixed(0)})`);

  // Held down: a quick menu around him. A task from it, and then what he
  // did, with its Undo, in "What did you say?".
  await open("?idle");
  const him = await page.locator(".desk-lemma").boundingBox();
  await page.mouse.move(him.x + him.width / 2, him.y + him.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.getByRole("menu", { name: "Quick things for Lemma" }).getByRole("menuitem", { name: "Task" }).waitFor();
  await page.waitForTimeout(450);
  await page.screenshot({ path: ".qa.local/desk-radial.png" });
  // Room's kept around him for every button: none falls outside his window.
  assert.ok(
    await page.evaluate(() => {
      const d = document.querySelector(".desk").getBoundingClientRect();
      return [...document.querySelectorAll(".desk-radial-item")].every((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= d.left - 0.5 && r.top >= d.top - 0.5 && r.right <= d.right + 0.5 && r.bottom <= d.bottom + 0.5;
      });
    }),
    "the quick menu fits in his window",
  );
  await page.getByRole("menuitem", { name: "Task" }).click();
  await page.getByRole("textbox", { name: "Your answer" }).fill("Buy milk");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Added Buy milk to today.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.acts.at(-1)), { tool: "plan_add", args: { items: [{ title: "Buy milk" }] } });
  await page.mouse.move(330, 450);
  await page.locator(".desk-lemma").click({ button: "right" });
  await page.getByRole("menuitem", { name: "What did you say?" }).click();
  const recalled = page.getByRole("dialog", { name: "What I said" });
  await recalled.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Undone.").waitFor();

  // The cursor racing at him: he ducks. Going round and round him: he gets dizzy.
  await open("?idle");
  // (A busy page can stretch his look at the cursor: swoop again until he's seen it.)
  for (let tries = 0; tries < 4 && !(await page.getByText(/^(Whoa!|Eek!|Careful!)$/).count()); tries++) {
    // In fast, right by him, and on out the other side.
    await page.evaluate(() => Object.assign(window.cursor, { x: 700, y: 90 }));
    await page.waitForTimeout(300);
    await page.evaluate(() => Object.assign(window.cursor, { x: 70, y: 95 }));
    await page.waitForTimeout(120);
    await page.evaluate(() => Object.assign(window.cursor, { x: -560, y: 100 }));
    await page.waitForTimeout(700);
  }
  await page.getByText(/^(Whoa!|Eek!|Careful!)$/).waitFor({ timeout: 4000 });
  await page.waitForTimeout(4200);
  const middle = await page.evaluate(() => {
    const r = document.querySelector(".desk").getBoundingClientRect();
    return { x: r.width / 2, y: r.height / 2 };
  });
  for (let step = 0; step < 40; step++) {
    const angle = (step / 16) * Math.PI * 2;
    await page.evaluate(([x, y]) => Object.assign(window.cursor, { x, y }), [middle.x + Math.cos(angle) * 150, middle.y + Math.sin(angle) * 150]);
    await page.waitForTimeout(110);
  }
  await page.getByText(/dizzy|spinning|roundabout|round and round/i).waitFor({ timeout: 4000 });

  // A window comes to the front: he glances at it.
  await page.evaluate(() => (window.deskState.active = { id: 1, x: 0, y: 0, width: 400, height: 300 }));
  await page.waitForTimeout(1700);
  await page.evaluate(() => (window.deskState.active = { id: 2, x: 1600, y: 200, width: 600, height: 500 }));
  await page.waitForFunction(() => document.querySelector(".desk")?.getAttribute("data-looking") === "window", null, { timeout: 4000 });

  // Quiet a long while with a task timed: still on it? Yes, and back, he
  // doesn't ask whether to count it.
  await open("");
  await page.evaluate(() => (window.deskState.idleSeconds = 700));
  await page.getByText(/^Still on Write the quarterly report\? It's been quiet for 1[12] min\.$/).waitFor({ timeout: 8000 });
  await page.screenshot({ path: ".qa.local/desk-drift.png" });
  await page.getByRole("button", { name: "Still on it" }).click();
  await page.evaluate(() => (window.deskState.idleSeconds = 1));
  await page.waitForTimeout(6000);
  assert.equal(await page.getByText(/Welcome back/).count(), 0, "still on it: nothing to ask on return");

  // He reacts: the inbox emptied (applause), and a task moved to tomorrow a
  // third time (a wince, and an offer to break it up).
  await open("?idle&inbox");
  await page.evaluate(() => localStorage.setItem("axiom.desk.pushed", JSON.stringify({ t1: 2 })));
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.plan.inbox = 0;
    window.emitTauri("data-changed");
  });
  await page.getByText(/^(Inbox zero! 👏|Empty inbox\. Gorgeous\.)$/).waitFor({ timeout: 8000 });
  await page.evaluate(() => {
    window.plan.tomorrow = [window.plan.today[0]];
    window.plan.today = [];
    window.emitTauri("data-changed");
  });
  await page.getByText("That's the third time Write the quarterly report has moved. Want to break it into smaller bits?").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Break it up" }).click();
  await page.waitForFunction(() => window.opened.includes("lemma"));
  assert.equal(await page.locator(".handoff").innerText(), 'Help me break "Write the quarterly report" into smaller tasks.');

  // He remembers: the second time this week on the same task.
  await open("?again");
  await page.getByText("That's your 2nd Write the quarterly report session this week!").waitFor();

  // In flow (25 minutes without a pause): the halo shimmers, with a ring for the focus.
  await open("?flow");
  await page.locator(".desk-ring.is-flow").waitFor({ state: "attached" });
  assert.equal(await page.locator(".desk-ring-focus").count(), 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".qa.local/desk-flow.png" });

  // Raining where he's set to show the weather.
  await open("?idle&weather");
  await page.locator(".desk-weather.is-rain").waitFor({ state: "attached" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: ".qa.local/desk-weather.png" });

  // The first time out each day: a stretch and good morning. Axiom closing: a wave goodbye.
  await open("?idle&greet");
  await page.getByText(/^(Morning! \*stretches\*|\*yawns\* Right, I'm awake\. Morning!)$/).waitFor();
  await page.evaluate(() => window.emitTauri("desk-bye"));
  await page.locator(".desk.is-wave").waitFor({ state: "attached" });
  await page.getByText(/^(Night! See you tomorrow\.|Bye for now!|See you soon!)$/).waitFor();
  await page.locator(".desk.is-leaving").waitFor({ state: "attached", timeout: 3000 });

  // In the morning he says hello once; in the evening, how the day went.
  const hour = new Date().getHours();
  if (hour < 12 || hour >= 18) {
    await open("?idle&greet");
    await page.getByText(hour < 12 ? /^(Good morning|Still up)/ : /^You finished 1 of 3 today\./).waitFor();
    await page.screenshot({ path: ".qa.local/desk-greet.png" });
    await open("?idle&keep");
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(".desk-bubble").count(), 0, "only once a day");
  }

  // At a set time of day (the page's clock fixed there): birthdays and bills
  // in the afternoon, and how was today at 8pm, saved to the journal.
  const at = (hours, minutes) => {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
  {
    const timed = await browser.newPage({ viewport: { width: 340, height: 460 } });
    timed.on("pageerror", (error) => errors.push(error.message));
    await timed.clock.setFixedTime(at(14, 0));
    await timed.goto(`${url}?idle&heads`, { waitUntil: "domcontentloaded" });
    await timed.getByText(/^It's Sam's birthday today \(30\)\. Rent is due today \(.*800\.00\)\.$/).waitFor();
    await timed.screenshot({ path: ".qa.local/desk-heads.png" });
    await timed.clock.setFixedTime(at(20, 30));
    await timed.goto(`${url}?idle&checkin`, { waitUntil: "domcontentloaded" });
    await timed.getByText("How was today?").waitFor();
    await timed.screenshot({ path: ".qa.local/desk-checkin.png" });
    await timed.getByRole("button", { name: "good" }).click();
    await timed.getByText("Saved to your journal.").waitFor();
    assert.deepEqual(await timed.evaluate(() => window.acts), [{ tool: "journal_write", args: { title: "Evening check-in", text: "Today felt good.", mood: 4 } }]);
    // Late at night with nothing on: he dozes, z z z.
    await timed.clock.setFixedTime(at(23, 30));
    await timed.goto(`${url}?idle`, { waitUntil: "domcontentloaded" });
    await timed.locator(".desk-zzz").waitFor();
    await timed.waitForTimeout(1600);
    await timed.screenshot({ path: ".qa.local/desk-night.png" });
    await timed.close();
  }

  // His settings: when, where, rounds, how big, the hotkey, what he says.
  await page.setViewportSize({ width: 600, height: 1180 });
  await page.goto(`${url}?settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: "Always" }).waitFor();
  await page.waitForFunction(() => window.deskCalls.includes("desk_hotkey:true"), null, { timeout: 5000 });
  await page.getByRole("radio", { name: "Tucked into the edge" }).click();
  await page.getByRole("radio", { name: "Top left" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_place:top-left"));
  await page.getByRole("radio", { name: "25 min, 5 min break" }).click();
  await page.locator("#desk-size").fill("204");
  await page.getByRole("switch", { name: "Ctrl+Alt+Space to talk" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_hotkey:false"));
  await page.getByRole("switch", { name: "Timer keys" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_timer_keys:false"));
  await page.getByRole("switch", { name: "Chime" }).click();
  await page.getByRole("switch", { name: "Evening check-in" }).click();
  // The weather where the computer is: found on it, and said how.
  await page.getByRole("radio", { name: "Where I am" }).click();
  await page.getByText("Now: 12° and raining in London, from your computer's time zone.").waitFor();
  await page.getByRole("radio", { name: "Never" }).click();
  await page.waitForFunction(() => window.deskCalls.includes("desk_hide"));
  assert.deepEqual(await saved(page), { mode: "off", style: "notch", corner: "top-left", hotkey: false, nudges: true, cheers: true, rounds: "25/5", size: 204, timerKeys: false, quiet: true, away: true, sound: true, breaks: false, checkin: true, weatherFrom: "auto", weather: "" });
  await page.screenshot({ path: ".qa.local/desk-settings.png" });

  assert.deepEqual(errors, []);
  console.log("PASS: the timers he becomes, rounds and their summing up, time's up, logging study and reading, meetings with Join, the notch with its peek and progress, his eyes, hello, cheers, talking and typing with Undo, drops, time away, the timer keys, keeping out of full screen, reminders, handing on, birthdays and bills, the check-in, resizing, hiding and his settings");
} finally {
  await browser.close();
}
