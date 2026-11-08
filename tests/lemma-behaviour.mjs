import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark", reducedMotion: "reduce" });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
await page.addInitScript(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  window.MediaRecorder = class {
    state = "inactive"; mimeType = "audio/webm";
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; queueMicrotask(() => { if (window.testAudioCapture) this.ondataavailable?.({ data: new Blob(["test"]) }); this.onstop?.(); }); }
  };
  window.AudioContext = class {
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: samples => samples.fill(0) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {} async decodeAudioData() { return { duration: 0.1 }; }
  };
  window.OfflineAudioContext = class {
    destination = {};
    createBufferSource() { return { connect() {}, start() {} }; }
    async startRendering() { return { getChannelData: () => new Float32Array(1600) }; }
  };
});
await mkdir(".qa.local/lemma-behaviour", { recursive: true });
const face = () => page.locator('.lemma-face[role="button"]').first();
const change = change => page.evaluate(async change => { const { setLemma } = await import("/src/features/lemma/state.ts"); setLemma(change); }, change);
const feedback = feeling => page.evaluate(async feeling => { const { feel } = await import("/src/features/lemma/state.ts"); feel(feeling); }, feeling);
const mood = () => face().getAttribute("data-mood");
try {
  await page.goto("http://localhost:1427/tests/lemma-preview.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.lemma-wardrobe-preview [data-renderer="3d"]').waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.clock.install({ time: new Date("2026-11-07T10:00:00Z") });
  const images = [];
  for (const personality of ["standard", "cheerful", "calm", "direct", "witty", "coach"]) {
    await page.evaluate(async personality => { const { setPersona } = await import("/src/features/lemma/persona.ts"); setPersona({ personality }); }, personality);
    await change({ activity: "idle", feeling: null }); await page.clock.runFor(50);
    images.push(await face().screenshot({ path: `.qa.local/lemma-behaviour/rest-${personality}.png` }));
    assert.equal(await face().getAttribute("data-personality"), personality);
  }
  for (let i = 1; i < images.length; i++) assert.notDeepEqual(images[i], images[0], "Resting faces reflect personality");
  console.log("PASS: six personality resting faces");
  await page.getByTestId("small-face").screenshot({ path: ".qa.local/lemma-behaviour/small.png" });
  assert.equal(await page.getByTestId("small-face").locator('rect[width="12"]').count(), 2);
  await change({ activity: "thinking", feeling: null }); await page.clock.fastForward(6000);
  await change({ activity: "preparing", area: "reading" }); await page.clock.fastForward(6100);
  await page.clock.runFor(50);
  assert.equal(await mood(), "patient", "Progress updates preserve the long-wait timer");
  assert.equal(await page.locator(".lemma-companion-dock p").innerText(), "Still working on it…");
  await face().screenshot({ path: ".qa.local/lemma-behaviour/patient.png" });
  await change({ activity: "idle", area: null }); await page.clock.fastForward(13000);
  assert.equal(await mood(), "idle", "Finished requests cannot trigger a stale waiting face");
  console.log("PASS: patient waiting and cleared requests");
  await change({ focused: true, feeling: null }); await feedback("happy");
  assert.equal(await mood(), "idle", "Focus suppresses unsolicited celebration");
  assert.equal(await face().getAttribute("data-quiet"), "true");
  await change({ focused: false }); await feedback("encouraging");
  assert.equal(await mood(), "encouraging");
  await face().screenshot({ path: ".qa.local/lemma-behaviour/encouraging.png" });
  await page.clock.fastForward(2500); await feedback("happy");
  assert.equal(await mood(), "idle", "Repeated completions stay proportionate");
  await feedback("concerned"); assert.equal(await mood(), "concerned");
  await page.clock.fastForward(2500);
  await page.getByRole("button", { name: "Minimise Lemma", exact: true }).click();
  await feedback("acknowledged"); assert.equal(await page.locator(".lemma-companion-dock").count(), 0);
  await page.getByRole("button", { name: "Toggle companion", exact: true }).click();
  await page.getByRole("button", { name: "Toggle companion", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Show Lemma companion", exact: true }).count(), 1);
  console.log("PASS: focus, proportionate reactions and remembered minimisation");
  await page.getByRole("button", { name: "Toggle chat", exact: true }).click();
  await change({ activity: "idle", feeling: null });
  await page.getByRole("button", { name: "Talk to Lemma", exact: true }).click();
  assert.equal(await page.locator(".lemma-chat-companion .lemma-face").getAttribute("data-mood"), "listening");
  await page.clock.fastForward(8100); await page.clock.runFor(50);
  assert.equal(await page.locator(".lemma-chat-companion .lemma-face").getAttribute("data-mood"), "puzzled");
  await page.locator(".lemma-chat-companion .lemma-face").screenshot({ path: ".qa.local/lemma-behaviour/puzzled.png" });
  await page.clock.fastForward(2500); await page.evaluate(() => { window.testAudioCapture = true; });
  await page.getByRole("button", { name: "Talk to Lemma", exact: true }).click();
  await page.getByRole("button", { name: "Stop listening", exact: true }).click();
  await page.clock.runFor(150);
  await page.waitForFunction(() => document.querySelector('.lemma-composer textarea')?.value === "A captured sentence", null, { polling: 50, timeout: 5000 });
  assert.equal(await page.locator(".lemma-chat-companion .lemma-face").getAttribute("data-mood"), "acknowledged");
  assert.equal(await page.getByRole("textbox", { name: "Message Lemma" }).inputValue(), "A captured sentence");
  await change({ activity: "idle", feeling: null });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const liveFace = page.locator(".lemma-chat-companion .lemma-face");
  await page.clock.runFor(300);
  const before = await liveFace.screenshot();
  await change({ activity: "preparing" }); await page.clock.runFor(35);
  const between = await liveFace.screenshot({ path: ".qa.local/lemma-behaviour/transition.png" });
  await page.clock.runFor(650);
  const after = await liveFace.screenshot();
  assert.notDeepEqual(between, before, "Live features begin changing immediately");
  assert.notDeepEqual(between, after, "Expression transitions continue across frames");
  assert.deepEqual(errors, []);
  console.log("PASS: six resting personalities, small faces, patient waits and cancellation, focus quieting, proportionate feedback, minimisation and real recorder feedback paths with simulated audio");
} catch (error) {
  console.error(error.message);
  console.error(await page.getByTestId("behaviour-state").textContent({ timeout: 1000 }).catch(() => "Fixture did not load"));
  await page.screenshot({ path: ".qa.local/lemma-behaviour/failure.png", timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
