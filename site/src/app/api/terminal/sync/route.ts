import { currentAccount } from "@/lib/session";
import { call } from "@/lib/axiom";
import { validateChanges, type Pull } from "@/lib/terminal/protocol";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return json({ message: "Sign in to use the terminal." }, 401);
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
  if (!Number.isSafeInteger(since) || since < 0) return json({ message: "Invalid sync cursor." }, 400);
  const answer = await call<Pull>("GET", `/v1/sync/pull?since=${since}`, { token: account.token });
  return answer.ok ? json({ ...answer.data, accountId: account.id }) : json({ message: answer.message }, answer.status || 503);
}

export async function POST(request: Request) {
  // Next can construct request.url with its internal hostname. Host is the
  // browser's destination and cannot be set by a cross-origin page's scripts.
  const destination = new URL(request.url);
  if (request.headers.get("host")) destination.host = request.headers.get("host")!;
  if (request.headers.get("origin") !== destination.origin) return json({ message: "Reload Axiom and try again." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  const account = await currentAccount();
  if (!account) return json({ message: "Sign in to use the terminal." }, 401);
  // Bound the body while reading; do not buffer arbitrary uploads.
  const reader = request.body?.getReader();
  if (!reader) return json({ message: "No changes supplied." }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 512 * 1024) { await reader.cancel(); return json({ message: "Save fewer changes at once." }, 413); }
    chunks.push(value);
  }
  let body;
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || body.accountId !== account.id) return json({ message: "Your sign-in changed. Reload this page." }, 409);
    body.changes = validateChanges(body.changes);
  } catch (error) { return json({ message: error instanceof Error ? error.message : "Invalid changes." }, 400); }
  const answer = await call<{ seq: number }>("POST", "/v1/sync/push", { token: account.token, body: { changes: body.changes } });
  return answer.ok ? json({ ...answer.data, accountId: account.id }) : json({ message: answer.message }, answer.status || 503);
}
