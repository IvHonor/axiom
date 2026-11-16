import assert from "node:assert/strict";
import test from "node:test";
import { createIdleMotion, idleMotionPose, IDLE_MOTIONS, MOTION_SECONDS } from "../src/features/lemma/idleMotion.ts";

test("each surface has its own repertoire, with no consecutive repeats", () => {
  for (const context of ["desktop", "overview", "chat"]) {
    const director = createIdleMotion(() => 0);
    const input = { context, eligible: true, now: 0 };
    assert.equal(director.tick(input), null);
    assert.equal(director.tick({ ...input, now: 44.99 }), null);
    const first = director.tick({ ...input, now: 45 });
    assert.equal(first.kind, IDLE_MOTIONS[context][0]);
    assert.equal(first.progress, 0);
    const finished = 45 + MOTION_SECONDS[first.kind] + 0.01;
    assert.equal(director.tick({ ...input, now: finished }), null);
    const next = director.tick({ ...input, now: finished + 45 });
    assert.ok(IDLE_MOTIONS[context].includes(next.kind));
    assert.notEqual(next.kind, first.kind);
  }
});

test("busy or interrupted companions wait a fresh interval; unassigned faces stay still", () => {
  const director = createIdleMotion(() => 0);
  const input = { now: 0, context: "chat", eligible: true };
  director.tick(input);
  assert.ok(director.tick({ ...input, now: 45 }));
  assert.equal(director.tick({ ...input, now: 46, eligible: false }), null);
  assert.equal(director.tick({ ...input, now: 1000 }), null);
  assert.equal(director.tick({ ...input, now: 1044 }), null);
  assert.ok(director.tick({ ...input, now: 1045 }));
  director.reset();
  assert.equal(director.tick({ ...input, now: 1050 }), null);
  assert.equal(director.tick({ ...input, now: 2000, context: undefined }), null);
  const slow = createIdleMotion(() => 1);
  slow.tick(input);
  assert.equal(slow.tick({ ...input, now: 119.99 }), null);
  assert.ok(slow.tick({ ...input, now: 120 }));
});

test("all eight motions stay bounded, finish cleanly and draw light only in light routines", () => {
  for (const kind of new Set(Object.values(IDLE_MOTIONS).flat())) {
    let changed = false;
    for (let i = 0; i <= 100; i++) {
      const pose = idleMotionPose({ kind, progress: i / 100 });
      assert.ok(Object.values(pose).every(Number.isFinite), kind);
      assert.ok(Math.abs(pose.x) <= 0.15 && Math.abs(pose.y) <= 0.11, kind + " stays inside its canvas");
      assert.ok(pose.stretch >= 0 && pose.stretch <= 0.11);
      assert.ok(pose.eyes >= 0.19 && pose.eyes <= 1);
      if (!["follow-light", "doodle"].includes(kind)) assert.equal(pose.light, 0);
      changed ||= JSON.stringify(pose) !== JSON.stringify(idleMotionPose(null));
    }
    assert.ok(changed, kind + " is animated");
    const end = idleMotionPose({ kind, progress: 1 });
    for (const key of ["x", "y", "pitch", "tilt", "stretch", "light"]) assert.ok(Math.abs(end[key]) < 1e-10, kind + " resets " + key);
    assert.ok(Math.abs(Math.sin(end.yaw)) < 1e-10, kind + " finishes facing forward");
  }
  assert.equal(idleMotionPose({ kind: "doodle", progress: 0.8 }).trail, 1);
});

test("automatic overview pages defer due routines without starving them", () => {
  const director = createIdleMotion(() => 0);
  const input = { context: "overview", eligible: true, now: 0, paused: true };
  assert.equal(director.tick(input), null);
  for (const now of [7, 14, 21, 28, 35, 42, 49]) assert.equal(director.tick({ ...input, now }), null);
  assert.ok(director.tick({ ...input, now: 50, paused: false }));
  assert.equal(director.tick({ ...input, now: 51 }), null, "the next page interrupts a routine");
  assert.equal(director.tick({ ...input, now: 52, paused: false }), null, "an interrupted routine rests before trying again");
});
