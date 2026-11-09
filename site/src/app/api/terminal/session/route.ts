import { cookies } from "next/headers";
import { call } from "@/lib/axiom";
import { clearSession, currentAccount, REFRESH_COOKIE } from "@/lib/session";
import { sameOrigin } from "../origin";
import { BROWSER_SESSION_COOKIE, browserCookie } from "@/lib/session-cookies";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Who's signed in, for Axiom on the web. The tokens stay in httpOnly cookies. */
export async function GET() {
  const account = await currentAccount();
  if (!account) return json({ message: "Sign in to use Axiom on the web." }, 401);
  const jar = await cookies();
  if (!jar.has(BROWSER_SESSION_COOKIE)) jar.set(browserCookie());
  return json({ id: account.id, email: account.email, displayName: account.display_name, avatar: account.avatar, admin: account.admin, createdAt: account.created_at });
}

/** Signs this browser out (the app's Account panel → Sign out). */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Reload Axiom and try again." }, 403);
  const refresh = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refresh) await call("POST", "/v1/auth/sign-out", { body: { refresh_token: refresh } });
  await clearSession();
  return json({ state: "signed_out" });
}
