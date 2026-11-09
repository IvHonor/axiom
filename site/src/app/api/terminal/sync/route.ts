import { currentAccount } from "@/lib/session";
import { call } from "@/lib/axiom";
import { validateChanges, type Pull } from "@/lib/terminal/protocol";
import { readJson, RequestBodyError } from "@/lib/request-body";
import { sameOrigin } from "../origin";

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
  if (!sameOrigin(request)) return json({ message: "Reload Axiom and try again." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  const account = await currentAccount();
  if (!account) return json({ message: "Sign in to use the terminal." }, 401);
  let body;
  try {
    body = await readJson(request, 512 * 1024);
    if (body.accountId !== account.id) return json({ message: "Your sign-in changed. Reload this page." }, 409);
    body.changes = validateChanges(body.changes);
  } catch (error) { return json({ message: error instanceof Error ? error.message : "Invalid changes." }, error instanceof RequestBodyError ? error.status : 400); }
  const answer = await call<{ seq: number }>("POST", "/v1/sync/push", { token: account.token, body: { changes: body.changes } });
  return answer.ok ? json({ ...answer.data, accountId: account.id }) : json({ message: answer.message }, answer.status || 503);
}
