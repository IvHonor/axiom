// What desktop Lemma understands as keeping the screen awake, and how long.
// Run with: node --test tests/keep-awake.mjs
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { registerHooks } from "node:module";

// The parsing needs none of Tauri: stand-ins for its imports.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@tauri-apps/api/core") return { url: "data:text/javascript,export const invoke = () => Promise.resolve(null);", shortCircuit: true };
    if (specifier === "./sync") return { url: "data:text/javascript,export const useTauriEvent = () => {};", shortCircuit: true };
    if (specifier === "react") return { url: "data:text/javascript,export const useState = (v) => [v, () => {}]; export const useEffect = () => {};", shortCircuit: true };
    return next(specifier, context);
  },
});
const { parseKeepAwake, minutesIn, awakeClock, awakeLength, MAX_AWAKE_MINUTES } = await import("../src/lib/keepAwake.ts");
mock.restoreAll();

test("asking to keep the screen awake, with or without how long", () => {
  for (const said of ["keep my screen awake", "Can you keep my screen awake?", "please keep the computer awake", "don't let my screen sleep", "Don't let the laptop go to sleep", "keep awake", "keep my screen on"]) {
    assert.deepEqual(parseKeepAwake(said), { kind: "start", minutes: null }, said);
  }
  assert.deepEqual(parseKeepAwake("keep my screen awake for 90 minutes"), { kind: "start", minutes: 90 });
  assert.deepEqual(parseKeepAwake("keep my screen awake for 2 hours"), { kind: "start", minutes: 120 });
  assert.deepEqual(parseKeepAwake("keep the screen awake for an hour"), { kind: "start", minutes: 60 });
  assert.deepEqual(parseKeepAwake("keep my screen awake for half an hour"), { kind: "start", minutes: 30 });
  assert.deepEqual(parseKeepAwake("keep my screen awake for 1 hour 30 min"), { kind: "start", minutes: 90 });
});

test("asking to let it sleep again", () => {
  for (const said of ["let my screen sleep", "you can let the computer sleep now", "stop keeping my screen awake", "allow the screen to turn off"]) {
    assert.deepEqual(parseKeepAwake(said), { kind: "stop" }, said);
  }
});

test("anything else goes to Lemma as usual", () => {
  for (const said of ["add a task to keep notes", "remind me to sleep at 11", "plan my day", "keep me on track with my essay", "", "x".repeat(300)]) {
    assert.equal(parseKeepAwake(said), null, JSON.stringify(said.slice(0, 40)));
  }
});

test("lengths and how they're shown", () => {
  assert.equal(minutesIn("for 45 mins"), 45);
  assert.equal(minutesIn("for 1.5h"), 90);
  assert.equal(minutesIn("a couple of hours"), 120);
  assert.equal(minutesIn("for a while"), null);
  assert.equal(MAX_AWAKE_MINUTES, 240);
  assert.equal(awakeClock(65 * 60_000), "1:05");
  assert.equal(awakeClock(41.2 * 60_000), "0:42");
  assert.equal(awakeClock(-5), "0:00");
  assert.equal(awakeLength(65), "1 h 5 min");
  assert.equal(awakeLength(240), "4 h");
  assert.equal(awakeLength(30), "30 min");
});
