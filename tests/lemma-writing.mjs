// What Lemma writes in the Journal and Notes (Rust, yrs) loads in the
// editor's own Yjs and TipTap mapping, after what was typed, and merges with
// typing done at the same time. Run from the repo root: node tests/lemma-writing.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const paragraph = (text) => {
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  return p;
};
const texts = (doc) => yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("default")).content.map((p) => p.content?.map((t) => t.text).join("") ?? "");

// Typed in the editor first.
const typed = new Y.Doc();
typed.getXmlFragment("default").insert(0, [paragraph("Typed in the editor.")]);
const typedUpdate = Y.encodeStateAsUpdate(typed);

// Lemma adds to it, from what was saved.
const out = execFileSync("cargo", ["test", "--lib", "--quiet", "print_an_append", "--", "--ignored", "--nocapture"], {
  cwd: "src-tauri",
  env: { ...process.env, YJS_UPDATE: b64(typedUpdate) },
  encoding: "utf8",
});
const appended = Buffer.from(/APPEND=(\S+)/.exec(out)[1], "base64");

const loaded = new Y.Doc();
Y.applyUpdate(loaded, typedUpdate);
Y.applyUpdate(loaded, appended);
assert.deepEqual(texts(loaded), ["Typed in the editor.", "Added by Lemma.", "And a second line."]);
console.log("PASS: Lemma's paragraphs load in the editor's Yjs, after what was typed");

// Typing at the same time on another computer: both survive, in either order.
const meanwhile = new Y.Doc();
Y.applyUpdate(meanwhile, typedUpdate);
meanwhile.getXmlFragment("default").insert(1, [paragraph("Typed meanwhile.")]);
const typing = Y.encodeStateAsUpdate(meanwhile, Y.encodeStateVector(typed));
for (const order of [[appended, typing], [typing, appended]]) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, typedUpdate);
  order.forEach((u) => Y.applyUpdate(doc, u));
  const got = texts(doc);
  assert.equal(got.length, 4);
  assert.ok(got.includes("Typed meanwhile.") && got.includes("Added by Lemma."), JSON.stringify(got));
}
console.log("PASS: merges with typing done at the same time");

// Into an empty document (a new entry).
const fresh = execFileSync("cargo", ["test", "--lib", "--quiet", "print_an_append", "--", "--ignored", "--nocapture"], { cwd: "src-tauri", env: { ...process.env, YJS_UPDATE: "" }, encoding: "utf8" });
const empty = new Y.Doc();
Y.applyUpdate(empty, Buffer.from(/APPEND=(\S+)/.exec(fresh)[1], "base64"));
assert.deepEqual(texts(empty), ["Added by Lemma.", "And a second line."]);
console.log("PASS: a new entry's text");
