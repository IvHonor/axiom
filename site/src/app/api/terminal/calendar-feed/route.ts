import { currentAccount } from "@/lib/session";
import { readFeed } from "@/lib/terminal/feed";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
export async function POST(request: Request) {
  const destination = new URL(request.url); if (request.headers.get("host")) destination.host = request.headers.get("host")!;
  if (request.headers.get("origin") !== destination.origin) return json({ message: "Reload Axiom and try again." }, 403);
  const account = await currentAccount(); if (!account) return json({ message: "Sign in to use calendars." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  const reader = request.body?.getReader(); if (!reader) return json({ message: "Supply a calendar link." }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) { await reader.cancel(); return json({ message: "The calendar link is too long." }, 413); } chunks.push(part.value); }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.accountId !== account.id) return json({ message: "Your sign-in changed. Reload this page." }, 409);
    if (typeof body.url !== "string") return json({ message: "Supply an iCalendar link." }, 400);
    return json({ accountId: account.id, source: await readFeed(body.url) });
  } catch (cause) { return json({ message: cause instanceof Error ? cause.message : "The calendar could not be read." }, 400); }
}
