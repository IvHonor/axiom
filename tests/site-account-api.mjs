import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Run the real account API wrapper with just Next's request context replaced.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier === 'next/headers') return { url: 'data:text/javascript,export async function headers(){return new Headers()}', shortCircuit: true };
  return next(specifier, context);
} });
let revision = 0;
async function exercise(url, fetcher, check) {
  const originalFetch = globalThis.fetch, originalError = console.error;
  const saved = Object.fromEntries(['NODE_ENV','AXIOM_API_URL','AXIOM_WEB_PROXY_SECRET'].map(key => [key, process.env[key]]));
  const calls = [], logs = [];
  process.env.NODE_ENV = 'production'; process.env.AXIOM_WEB_PROXY_SECRET = '';
  if (url === undefined) delete process.env.AXIOM_API_URL; else process.env.AXIOM_API_URL = url;
  globalThis.fetch = async (...args) => { calls.push(args); return fetcher(...args); };
  console.error = (...args) => logs.push(args);
  try {
    const { call } = await import(`../site/src/lib/axiom.ts?case=${++revision}`);
    const answer = await call('POST', '/v1/auth/sign-in', { body: { email: 'fictional@example.invalid', password: 'private-fixture-value' } });
    await check({ answer, calls, logs });
    assert.equal(JSON.stringify(logs).includes('private-fixture-value'), false, 'request credentials must never enter diagnostic logs');
    assert.equal(JSON.stringify(logs).includes('fictional@example.invalid'), false, 'account details must never enter diagnostic logs');
  } finally {
    globalThis.fetch = originalFetch; console.error = originalError;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
test('production configuration never falls back to localhost', async () => {
  for (const url of [undefined, '', '  ']) await exercise(url, () => { throw new TypeError('fetch failed'); }, ({ answer, calls, logs }) => {
    assert.equal(calls.length, 0, 'missing production configuration must be caught before fetching localhost');
    assert.equal(answer.status, 503); assert.match(answer.message, /website.*configur/i);
    assert.match(JSON.stringify(logs), /AXIOM_API_URL/);
  });
});
test('configured URL is trimmed and authentication failures remain accurate', async () => {
  await exercise(' https://accounts.example.invalid/ ', () => new Response(JSON.stringify({ message: 'Email or password is incorrect.' }), { status: 401 }), ({ answer, calls }) => {
    assert.equal(calls[0][0], 'https://accounts.example.invalid/v1/auth/sign-in');
    assert.equal(answer.status, 401); assert.equal(answer.message, 'Email or password is incorrect.');
  });
});
test('invalid production URLs are rejected without exposing their contents', async () => {
  for (const url of ['not-a-url', 'ftp://accounts.example.invalid', 'https://private-fixture-value@accounts.example.invalid', 'https://accounts.example.invalid?token=private-fixture-value']) await exercise(url, () => { throw new Error('must not fetch'); }, ({ answer, calls }) => {
    assert.equal(calls.length, 0); assert.equal(answer.status, 503);
  });
});
test('HTML gateway errors retain the HTTP failure instead of claiming the visitor is offline', async () => {
  await exercise('https://accounts.example.invalid', () => new Response('<html>Gateway failure</html>', { status: 502 }), ({ answer, logs }) => {
    assert.equal(answer.status, 502); assert.doesNotMatch(answer.message, /Check your connection/);
    assert.match(JSON.stringify(logs), /502/);
  });
});
test('server connection errors log a safe cause without blaming the visitor connection', async () => {
  await exercise('https://accounts.example.invalid', () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); }, ({ answer, logs }) => {
    assert.equal(answer.ok, false); assert.equal(answer.status, 0); assert.doesNotMatch(answer.message, /Check your connection/);
    assert.match(JSON.stringify(logs), /ECONNREFUSED/);
  });
});
test('timeouts have a distinct response and successful/pending requests keep their contract', async () => {
  await exercise('https://accounts.example.invalid', () => { throw new DOMException('Timed out', 'TimeoutError'); }, ({ answer }) => assert.match(answer.message, /too long to respond/));
  for (const status of [200, 202, 428]) await exercise('https://accounts.example.invalid', () => new Response(JSON.stringify({ message: 'Fixture response', confirm_email: true }), { status }), ({ answer }) => {
    assert.equal(answer.status, status); assert.equal(answer.ok, status < 400);
  });
});
