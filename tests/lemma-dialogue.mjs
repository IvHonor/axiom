import assert from "node:assert/strict";
import test from "node:test";
import { createDialogueDirector, DIALOGUE_LINES, dialogueStatus, dialogueVariants } from "../src/features/lemma/dialogue.ts";
import { createIdleMotion } from "../src/features/lemma/idleMotion.ts";
import { createIdleDirector } from "../src/features/lemma/itemIdle.ts";

const people = ["standard", "cheerful", "calm", "direct", "witty", "coach"];
const facts = { theme: "Crimson", name: "Nova", task: "Finish the report", enabled: "Daily Plan", disabled: "Journal", area: "Reading", changes: "1 change" };

test("all 25 situations have two distinct lines for all six personalities", () => {
  assert.equal(Object.keys(DIALOGUE_LINES).length, 25);
  for (const kind of Object.keys(DIALOGUE_LINES)) for (const personality of people) {
    const variants = dialogueVariants({ kind, values: facts }, personality);
    assert.equal(variants.length, 2, kind + "/" + personality);
    assert.equal(new Set(variants.map(v => v.text)).size, 2);
    assert.ok(variants.every(v => v.text && !/[{}]/.test(v.text)), "all facts are substituted");
  }
  assert.ok(dialogueStatus({ kind: "rename", values: facts }, "witty").includes("Nova"));
  assert.ok(dialogueStatus({ kind: "permissions", values: facts }, "calm").includes("Journal"));
});

test("missing or empty facts never produce made-up context", () => {
  for (const kind of ["rename", "returnTask", "theme", "permissions", "access", "approval"]) {
    assert.deepEqual(dialogueVariants({ kind }, "standard"), []);
  }
  assert.deepEqual(dialogueVariants({ kind: "returnTask", values: { task: "   " } }, "witty"), []);
  assert.ok(dialogueStatus({ kind: "returnTask", values: { task: " x ".repeat(300) } }, "standard").length < 150);
});

test("ambient remarks wait three to five minutes, while meaningful reactions have a short shared cooldown", () => {
  const director = createDialogueDirector(() => 0, 0);
  assert.equal(director.offer({ kind: "stretch" }, "witty", 179999), null);
  const first = director.offer({ kind: "stretch" }, "witty", 180000);
  assert.ok(first);
  assert.equal(director.offer({ kind: "crimson" }, "witty", 185000), null);
  assert.ok(director.offer({ kind: "crimson" }, "witty", 192001));
  assert.equal(director.offer({ kind: "spin" }, "witty", 200000), null);
  const slow = createDialogueDirector(() => 1, 0);
  assert.equal(slow.offer({ kind: "return" }, "calm", 299999), null);
  assert.ok(slow.offer({ kind: "return" }, "calm", 300000));
  assert.equal(slow.offer({ kind: "theme", values: facts }, "calm", 320000, 319000), null, "another window just spoke");
});

test("recent wording, repeated customization triggers, status stability and clock changes", () => {
  const director = createDialogueDirector(() => 0, 0);
  const one = director.offer({ kind: "outfit", key: "same-look" }, "witty", 1000);
  assert.ok(one);
  assert.equal(director.offer({ kind: "outfit", key: "same-look" }, "witty", 14000), null);
  const two = director.offer({ kind: "outfit", key: "other-look" }, "witty", 14001);
  assert.ok(two && two.text !== one.text);
  assert.equal(dialogueStatus({ kind: "approval", values: facts }, "direct"), dialogueStatus({ kind: "approval", values: facts }, "direct"));
  assert.equal(director.offer({ kind: "stretch" }, "witty", -100), null);
  assert.ok(director.offer({ kind: "stretch" }, "witty", 180001), "a changed clock cannot silence the companion forever");
});

test("only normally completed animations announce completion", () => {
  const motions = [], items = [];
  const rest = createIdleMotion(() => 0, kind => motions.push(kind));
  const input = { now: 0, context: "desktop", eligible: true };
  rest.tick(input); rest.tick({ ...input, now: 45 }); rest.reset();
  assert.deepEqual(motions, []);
  rest.tick({ ...input, now: 100 }); rest.tick({ ...input, now: 145 }); rest.tick({ ...input, now: 150 });
  rest.tick({ ...input, now: 151 });
  assert.equal(motions.length, 1);
  const prop = createIdleDirector(() => 0, kind => items.push(kind));
  const coffee = { now: 0, eligible: true, holding: "coffee", admin: false };
  prop.tick(coffee); prop.tick({ ...coffee, now: 60 }); prop.interrupt();
  assert.deepEqual(items, []);
  prop.preview({ ...coffee, now: 80 }); prop.tick({ ...coffee, now: 88 }); prop.tick({ ...coffee, now: 89 });
  assert.deepEqual(items, ["coffee"]);
});
