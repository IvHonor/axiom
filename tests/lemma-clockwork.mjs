// The clockwork rewards: locked until earned, then worn on every body, with the
// Glow slot, The Hour Stops and the Automaton personality. Run Vite on port 1427.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = "http://localhost:1427/tests/lemma-preview.html";
const dialog = page.getByRole("dialog");
const choice = name => dialog.getByRole("button", { name, exact: true });
const preview = page.locator(".lemma-wardrobe-preview .lemma-face");
const tab = name => dialog.getByRole("tab", { name, exact: true }).click();
const ITEMS = ["Skeleton", "Verdigris", "Top hat", "Loupe", "Cog bolo", "The Long Hour"];
const open = name => page.waitForFunction(name => { const b = document.querySelector(`[role="dialog"] button[aria-label="${name}"]`); return b && b.getAttribute("data-locked") !== "true"; }, name);
const settled = () => page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.renderer === "3d");
const shots = ".qa.local/lemma-clockwork";
/** Plays The Hour Stops, with a picture at each of these moments (seconds in). */
async function play(pictures) {
  await choice("Preview item animation").click();
  await page.waitForFunction(() => document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine === "long-hour");
  const started = Date.now();
  for (const [at, name] of pictures) {
    await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - started)));
    assert.equal(await preview.getAttribute("data-idle-routine"), "long-hour");
    await preview.screenshot({ path: `${shots}/${name}.png` });
  }
  await page.waitForFunction(() => !document.querySelector(".lemma-wardrobe-preview .lemma-face")?.dataset.idleRoutine, null, { timeout: 12000 });
}
await mkdir(shots, { recursive: true });
try {
  await page.goto(base);
  await settled();
  // Locked: visible, explained on hover, tried on in the preview, and never saved.
  for (const item of ITEMS) assert.equal(await choice(item).getAttribute("data-locked"), "true", `${item} starts locked`);
  assert.match(await choice("The Long Hour").getAttribute("aria-description"), /Planner.*21 days in a row to unlock/);
  assert.match(await choice("Skeleton").getAttribute("aria-description"), /Clocking Off.*20 days with the shutdown routine to unlock/);
  assert.match(await choice("Verdigris").getAttribute("aria-description"), /Creature of Habit.*Keep 3 routines going for a week to unlock/);
  assert.ok(await dialog.getByRole("region", { name: "Hologram colour" }).isVisible(), "The colour row keeps its name");
  assert.equal(await dialog.getByRole("region", { name: "Hologram colour" }).getByRole("button", { name: "Verdigris" }).count(), 0);
  assert.equal(await dialog.getByRole("region", { name: "Glow", exact: true }).getByRole("button").count(), 7);
  const saved = key => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}"), key);
  await choice("Loupe").hover();
  const card = await page.getByRole("tooltip").innerText();
  for (const part of [/Watchmaker's Loupe/, /Locked/, /Flawless/, /Plan, finish your top priorities and shut down on 7 days/, /Daily Plan/, /Press to preview/]) assert.match(card, part);
  await preview.page().screenshot({ path: `${shots}/customise-card.png` });
  await choice("Loupe").click();
  assert.equal(await preview.getAttribute("data-facewear"), "loupe", "A locked item can be tried on");
  assert.equal(await choice("Loupe").getAttribute("aria-pressed"), "true");
  await dialog.getByText("Preview only").waitFor();
  assert.notEqual((await saved("axiom.lemma.look")).facewear, "loupe", "Trying it on doesn't equip it");
  await choice("The Long Hour").click();
  assert.equal(await preview.getAttribute("data-holding"), "long-hour");
  assert.equal(await choice("Preview item animation").isEnabled(), true, "Its animation can be previewed too");
  await page.waitForTimeout(250);
  await preview.page().screenshot({ path: `${shots}/customise-trying.png` });
  await choice("Loupe").click();
  assert.equal(await preview.getAttribute("data-facewear"), "none", "Pressing it again takes it off");
  await choice("Back to my look").click();
  assert.equal(await preview.getAttribute("data-holding"), "none");
  assert.equal(await dialog.getByText("Preview only").count(), 0);
  await tab("Personality");
  assert.equal(await dialog.getByRole("button", { name: /^Automaton/ }).getAttribute("data-locked"), "true");
  await dialog.getByRole("button", { name: /^Automaton/ }).click();
  assert.equal(await preview.getAttribute("data-personality"), "automaton", "A locked personality can be tried too");
  assert.match(await page.locator(".lemma-personality-sample").innerText(), /Awaiting input/);
  assert.notEqual((await saved("axiom.lemma.persona")).personality, "automaton");
  await choice("Back to my look").click();
  assert.equal(await preview.getAttribute("data-personality"), "standard");
  const gated = await page.evaluate(async () => {
    const { STANDARD, lookForRewards, normaliseLook } = await import("/src/features/lemma/look.ts");
    const { personaForRewards } = await import("/src/features/lemma/persona.ts");
    const full = { ...STANDARD, glowEffect: "verdigris", accessory: "gearwright-hat", facewear: "loupe", neckwear: "cog-bolo", finish: "skeleton", holding: "long-hour" };
    return { none: lookForRewards(full, []), same: lookForRewards(full, ["verdigris", "gearwright-hat", "loupe", "cog-bolo", "skeleton", "long-hour"]) === full, older: normaliseLook({ shape: "orb" }).glowEffect, bad: normaliseLook({ glowEffect: "<x>" }).glowEffect, persona: personaForRewards({ name: "", personality: "automaton" }, []).personality };
  });
  assert.deepEqual([gated.none.accessory, gated.none.facewear, gated.none.neckwear, gated.none.finish, gated.none.holding, gated.none.glowEffect], ["none", "none", "none", "hologram", "none", "motes"]);
  assert.ok(gated.same, "A fully earned look is left alone");
  assert.deepEqual([gated.older, gated.bad, gated.persona], ["motes", "motes", "standard"]);

  // Free glows can be worn straight away.
  await tab("Appearance");
  for (const [name, id] of [["Embers", "embers"], ["Fireflies", "fireflies"], ["No glow", "none"], ["Motes", "motes"]]) {
    await choice(name).click();
    assert.equal(await preview.getAttribute("data-glow-effect"), id);
    await settled();
    await page.waitForTimeout(150);
    await preview.screenshot({ path: `${shots}/glow-${id}.png` });
  }

  // Earned from activity, live, and saved so they stay.
  await page.getByRole("button", { name: "Earn clockwork", exact: true }).evaluate(button => button.click());
  for (const item of ITEMS) await open(item);
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem("axiom.achievements.rewards")))).sort(), ["automaton", "cog-bolo", "gearwright-hat", "long-hour", "loupe", "skeleton", "verdigris"]);
  for (const item of ITEMS) await choice(item).click();
  assert.deepEqual(await preview.evaluate(n => [n.dataset.headwear, n.dataset.facewear, n.dataset.neckwear, n.dataset.finish, n.dataset.holding, n.dataset.glowEffect]), ["gearwright-hat", "loupe", "cog-bolo", "skeleton", "long-hour", "verdigris"]);
  for (const shape of ["Orb", "Prism", "Pyramid", "Drop"]) {
    await choice(shape).click();
    await settled();
    await page.waitForTimeout(250);
    await preview.screenshot({ path: `${shots}/${shape.toLowerCase()}.png` });
  }
  await choice("Orb").click();

  // The mechanism and The Hour Stops, frame by frame, on every body.
  const works = await page.evaluate(async () => {
    const { Color, Box3 } = await import("/node_modules/three/build/three.module.js");
    const { buildCompanion, disposeModel } = await import("/src/features/lemma/model.ts");
    const { performItem } = await import("/src/features/lemma/itemPerformance.ts");
    const { STANDARD } = await import("/src/features/lemma/look.ts");
    const { clockTurn } = await import("/src/features/lemma/clockwork.ts");
    const look = { ...STANDARD, glowEffect: "verdigris", accessory: "gearwright-hat", facewear: "loupe", neckwear: "cog-bolo", holding: "long-hour" };
    const at = (model, progress) => performItem(model, { kind: "long-hour", progress }, 3);
    const results = [];
    for (const shape of ["orb", "prism", "pyramid", "drop"]) for (const finish of ["hologram", "skeleton"]) {
      const model = buildCompanion({ ...look, shape, finish }, new Color("#2ec4ff"), new Color("#444444"));
      const plain = buildCompanion({ ...STANDARD, shape, finish }, new Color("#2ec4ff"), new Color("#444444"));
      const size = root => { const box = new Box3().setFromObject(root); return box.max.y - box.min.y; };
      const tint = () => model.hologram.uniforms.tint.value.getHexString();
      const before = tint();
      const out = { finish, spinners: model.spinners.length, ratios: model.spinners.slice(0, 4).map(s => s.rate * s.teeth), lid: model.watch.lid.rotation.y, restTall: size(model.root) / size(plain.root) };
      at(model, 0.2); out.drained = tint() !== before; out.stilled = model.watch.stillness === 1;
      at(model, 0.6);
      out.mid = { dial: model.watch.dial.visible, face: model.face.visible, shell: model.casing.opacity, works: model.revealedWorks?.visible ?? null, drive: model.watch.drive > 0, handsOut: model.watch.eyeHands.every(h => h.pivot.visible), echoes: model.watch.echoes.filter(e => e.scale.x > 0).length, lit: model.watch.numerals.filter(n => n.material.color.getHexString() === "fff1c4").length };
      at(model, 0.74);
      out.lock = { lit: model.watch.numerals.filter(n => n.material.color.getHexString() === "fff1c4").length, cracked: model.watch.crack.filter(c => c.stroke.visible).length, total: model.watch.crack.length, hour: Math.abs(Math.sin(model.watch.eyeHands[0].pivot.rotation.z)) < 1e-9 };
      at(model, 0.86); out.sealing = { chime: model.watch.chime.visible, cracked: model.watch.crack.filter(c => c.stroke.visible).length };
      performItem(model, null, 3);
      out.restored = !model.watch.dial.visible && model.face.visible && model.casing.opacity === model.casingOpacity && tint() === before && model.hat.scale.equals(model.hatScale) && model.watch.drive === 0 && model.held.position.equals(model.heldOrigin);
      results.push(out);
      disposeModel(model.root); disposeModel(plain.root);
    }
    return { results, ticks: [clockTurn(0), clockTurn(0.04), clockTurn(0.2), clockTurn(0.7)] };
  });
  for (const r of works.results) {
    const skeleton = r.finish === "skeleton";
    assert.equal(r.spinners, 8, "4 works + 2 hat cogs + clasp + loupe rim");
    if (skeleton) assert.ok(r.ratios.every(x => Math.abs(Math.abs(x) - Math.abs(r.ratios[0])) < 1e-9), "Meshed gears share one surface speed");
    assert.equal(r.lid, 0);
    assert.ok(r.restTall < 2, "The hidden dial doesn't count towards Lemma's size");
    assert.ok(r.drained && r.stilled, "Time stops and the colour drains");
    assert.ok(r.mid.dial && !r.mid.face && r.mid.handsOut && r.mid.drive, "Lemma has become the clock");
    if (skeleton) assert.ok(r.mid.shell > 0 && r.mid.works === null, "The Skeleton keeps its shell and shows its own gears");
    else assert.ok(r.mid.shell < 0.01 && r.mid.works === true, "The shell has gone, revealing gears");
    assert.ok(r.mid.lit > 0 && r.mid.lit < 12, "Numerals light as the hand passes");
    assert.ok(r.mid.echoes > 0 && r.mid.echoes < 12, "Echoes come and go");
    assert.equal(r.lock.lit, 12); assert.ok(r.lock.hour, "The hands lock at twelve");
    assert.equal(r.lock.cracked, r.lock.total, "The dial cracks at the lock");
    assert.ok(r.sealing.chime && r.sealing.cracked < r.lock.total, "The chime seals the crack");
    assert.ok(r.restored, "Everything is back afterwards");
  }
  assert.ok(works.ticks[1] > works.ticks[0] && works.ticks[2] === works.ticks[0] + 1 && works.ticks[3] === works.ticks[0] + 2, "The clock snaps forward, then holds");

  // The real thing, in both kinds of shell.
  await play([[1.5, "hour-1-stopped"], [3.6, "hour-2-opening"], [6.6, "hour-3-rewind"], [7.8, "hour-4-lock"], [9, "hour-5-chime"]]);
  await choice("Hologram").click();
  await settled();
  await play([[6.6, "hour-hologram-rewind"]]);
  await choice("Skeleton").click();
  await settled();

  // The Automaton, once earned.
  await tab("Personality");
  await dialog.getByRole("button", { name: /^Automaton/ }).click();
  assert.equal(await preview.getAttribute("data-personality"), "automaton");
  assert.match(await page.locator(".lemma-personality-sample").innerText(), /Awaiting input/);

  // Earned for good: no activity on the next visit, and everything's still there.
  await page.goto(base);
  await settled();
  assert.equal(await preview.getAttribute("data-holding"), "long-hour");
  assert.equal(await preview.getAttribute("data-glow-effect"), "verdigris");
  assert.equal(await preview.getAttribute("data-personality"), "automaton");
  await page.setViewportSize({ width: 390, height: 740 });
  assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Fits a phone");
  await page.screenshot({ path: `${shots}/narrow.png` });
  assert.deepEqual(errors, []);
  console.log("PASS: locked until earned, explained when tapped, free and earned glows, every item on every body, The Hour Stops frame by frame and live, and the Automaton");
} finally { await browser.close(); }
