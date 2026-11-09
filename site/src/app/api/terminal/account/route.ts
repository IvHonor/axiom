import { call } from "@/lib/axiom";
import { clearSession, currentAccount } from "@/lib/session";
import { sameOrigin } from "../origin";
import { readJson, RequestBodyError } from "@/lib/request-body";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const segment = (value: unknown) => {
  if (typeof value !== "string" || !/^[\w-]{1,64}$/.test(value)) throw new Error("Invalid id.");
  return encodeURIComponent(value);
};

type Request_ = { method: string; path: string; body?: unknown };

/**
 * The account calls Axiom on the web makes, as the desktop app makes them
 * (src-tauri/src/account/client.rs). Only these: the page can't reach any
 * other server route through here.
 */
const OPS: Record<string, (args: Record<string, unknown>) => Request_> = {
  profile: () => ({ method: "GET", path: "/v1/account/profile" }),
  update_profile: (a) => ({ method: "PUT", path: "/v1/account/profile", body: { display_name: a.displayName ?? null, avatar: a.avatar ?? null } }),
  devices: () => ({ method: "GET", path: "/v1/account/devices" }),
  sign_out_device: (a) => ({ method: "DELETE", path: `/v1/account/devices/${segment(a.id)}` }),
  delete: (a) => ({ method: "DELETE", path: "/v1/account", body: { password: String(a.loginKey ?? "") } }),
  support: (a) => ({ method: "POST", path: "/v1/support", body: { kind: String(a.kind ?? ""), subject: String(a.subject ?? ""), message: String(a.message ?? ""), email: null, app_version: String(a.appVersion ?? "") } }),
  admin_accounts: () => ({ method: "GET", path: "/v1/admin/accounts" }),
  admin_approve: (a) => ({ method: "POST", path: `/v1/admin/accounts/${segment(a.id)}/approve` }),
  admin_decline: (a) => ({ method: "DELETE", path: `/v1/admin/accounts/${segment(a.id)}` }),
  admin_revoke: (a) => ({ method: "POST", path: `/v1/admin/accounts/${segment(a.id)}/revoke` }),
  admin_update: (a) => ({ method: "PATCH", path: `/v1/admin/accounts/${segment(a.id)}`, body: { role: a.role ?? null, permissions: a.permissions ?? null } }),
  admin_settings: () => ({ method: "GET", path: "/v1/admin/settings" }),
  admin_save_settings: (a) => ({ method: "PUT", path: "/v1/admin/settings", body: a.settings }),
  admin_ai_usage: (a) => ({ method: "GET", path: `/v1/admin/ai-usage?days=${Math.max(1, Math.min(365, Number(a.days) || 30))}` }),
  admin_tickets: () => ({ method: "GET", path: "/v1/admin/tickets" }),
  admin_ticket_solved: (a) => ({ method: "PATCH", path: `/v1/admin/tickets/${segment(a.id)}`, body: { solved: !!a.solved } }),
};

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Reload Axiom and try again." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  const account = await currentAccount();
  if (!account) return json({ message: "Your sign-in has ended. Reload to sign in again." }, 401);
  let op: string, args: Record<string, unknown>, sent: Request_;
  try {
    const body = await readJson(request, 256 * 1024);
    if (body.accountId !== account.id) return json({ message: "Your sign-in changed. Reload this page." }, 409);
    if (typeof body.op !== "string" || body.args !== undefined && (!body.args || typeof body.args !== "object" || Array.isArray(body.args))) {
      return json({ message: "Invalid request." }, 400);
    }
    op = body.op;
    args = (body.args ?? {}) as Record<string, unknown>;
    if (!Object.hasOwn(OPS, op)) return json({ message: "That isn't available on the web." }, 400);
    sent = OPS[op](args);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "Invalid request." }, error instanceof RequestBodyError ? error.status : 400);
  }
  const answer = await call<unknown>(sent.method, sent.path, { token: account.token, body: sent.body });
  if (!answer.ok) return json({ message: op === "delete" && answer.status === 401 ? "That password isn't right." : answer.message }, answer.status || 503);
  if (op === "delete") await clearSession();
  return json({ data: answer.data ?? null });
}
