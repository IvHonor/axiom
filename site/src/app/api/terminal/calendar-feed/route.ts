import { currentAccount } from "@/lib/session";
import { readFeed } from "@/lib/terminal/feed";
import { readJson, RequestBodyError } from "@/lib/request-body";
import { sameOrigin } from "../origin";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Reload Axiom and try again." }, 403);
  const account = await currentAccount(); if (!account) return json({ message: "Sign in to use calendars." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  try {
    const body = await readJson(request, 8192);
    if (body.accountId !== account.id) return json({ message: "Your sign-in changed. Reload this page." }, 409);
    if (typeof body.url !== "string") return json({ message: "Supply an iCalendar link." }, 400);
    return json({ accountId: account.id, source: await readFeed(body.url) });
  } catch (cause) { return json({ message: cause instanceof Error ? cause.message : "The calendar could not be read." }, cause instanceof RequestBodyError ? cause.status : 400); }
}
