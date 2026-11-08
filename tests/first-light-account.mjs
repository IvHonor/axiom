import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Keep Next's request context local; exercise the real web-session response.
const mock = source => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "next/headers") return mock("export const cookies = async () => ({ get() {} });");
  if (specifier === "@/lib/axiom") return mock("export const call = async () => {};");
  if (specifier === "@/lib/session") return mock("export const currentAccount = async () => globalThis.fixtureAccount; export const clearSession = async () => {}; export const REFRESH_COOKIE = 'fixture';");
  if (specifier === "../origin") return mock("export const sameOrigin = () => true;");
  return next(specifier, context);
} });
const { GET } = await import("../site/src/app/api/terminal/session/route.ts");

test("web sessions carry the server's original creation time across the award cutoff", async () => {
  for (const created_at of ["2027-03-20T23:59:59.999Z", "2027-03-21T00:00:00Z"]) {
    globalThis.fixtureAccount = { id: "fixture", email: "early@example.test", display_name: "117", avatar: null, admin: false, created_at, token: "private-fixture" };
    const response = await GET();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.createdAt, created_at);
    assert.equal(body.token, undefined, "the timestamp does not expose the sign-in token");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("signed-out sessions cannot supply an award creation date", async () => {
  globalThis.fixtureAccount = null;
  const response = await GET();
  assert.equal(response.status, 401);
  assert.equal((await response.json()).createdAt, undefined);
});
