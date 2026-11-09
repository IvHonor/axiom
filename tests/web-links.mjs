// Links opened on the website come from synced and shared data (a board's
// cards, a calendar feed), so only web, email and phone links may open.
// Run with: node --test tests/web-links.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

const opened = [];
globalThis.window = { open: (url, target, features) => opened.push({ url, target, features }) };
const { openUrl, safeLink } = await import("../src/web/tauri/opener.ts");

test("web, email and phone links open in a new tab, without an opener", async () => {
  for (const link of ["https://example.com/a?b=1", "http://example.com", "mailto:ada@example.com", "tel:+441234567890"]) {
    assert.ok(safeLink(link), link);
  }
  await openUrl("https://example.com/meeting");
  assert.deepEqual(opened.at(-1), { url: "https://example.com/meeting", target: "_blank", features: "noopener,noreferrer" });
});

test("script, data, file and malformed links are refused, whatever their case or padding", async () => {
  const before = opened.length;
  for (const link of ["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///C:/Windows/win.ini", "vbscript:x", "not a link", ""]) {
    assert.equal(safeLink(link), null, JSON.stringify(link));
    await assert.rejects(openUrl(link), JSON.stringify(link));
  }
  assert.equal(opened.length, before, "nothing was opened");
});
