// The account on the web: always signed in (signed out, the page goes to the
// website's sign-in). Account calls go through the website's
// /api/terminal/account, which holds the sign-in; sync is the runtime's.
import pkg from "../../../package.json";
import { loginKey } from "../../../site/src/lib/login-key";
import { DEMO, currentAccount, signOut, sync, syncState } from "../runtime";
import type { Handlers } from "./types";

async function account<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  if (DEMO) throw "There's no account in demo mode.";
  const answer = await fetch("/api/terminal/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ op, args }),
  }).catch(() => null);
  if (!answer) throw "You're offline. Try again when you're connected.";
  const body = await answer.json().catch(() => ({}));
  if (!answer.ok) throw body.message ?? "Something went wrong. Try again in a minute.";
  return body.data as T;
}

type Profile = { display_name: string | null; avatar: string | null };
const profileView = (p: Profile) => ({ displayName: p.display_name, avatar: p.avatar });
const camel = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)]))
      : value;

const status = () => {
  const a = currentAccount()!;
  return { state: "signed_in", email: a.email, admin: a.admin, createdAt: a.createdAt };
};
const ON_WEBSITE = "You're signed in to Axiom on the web through the website. To use another account, sign out and sign in again.";
const PASSWORD_ON_DESKTOP =
  "Change your password in the Axiom desktop app (Account → Password). It also re-locks your encrypted data under the new password, which the browser can't do yet.";

export const accountHandlers: Handlers = {
  account_status: status,
  account_sign_in: () => Promise.reject(ON_WEBSITE),
  account_sign_up: () => Promise.reject(ON_WEBSITE),
  account_confirm_email: () => Promise.reject(ON_WEBSITE),
  account_send_confirmation: () => Promise.reject(ON_WEBSITE),
  account_request_reset: () => Promise.reject(ON_WEBSITE),
  account_reset_password: () => Promise.reject(ON_WEBSITE),
  account_change_password: () => Promise.reject(PASSWORD_ON_DESKTOP),
  async account_sign_out() {
    await signOut();
    return { state: "signed_out" };
  },
  async account_delete({ password }) {
    const key = await loginKey(currentAccount()!.email, String(password ?? ""));
    await account("delete", { loginKey: key });
    location.href = "/?account=deleted";
    return { state: "signed_out" };
  },
  account_profile: async () => (DEMO ? { displayName: "Demo", avatar: null } : profileView(await account<Profile>("profile"))),
  account_update_profile: async ({ displayName, avatar }) => profileView(await account<Profile>("update_profile", { displayName, avatar })),
  account_devices: async () => (DEMO ? [] : camel(await account("devices"))),
  account_sign_out_device: async ({ id }) => void (await account("sign_out_device", { id })),

  account_admin_accounts: async () => camel(await account("admin_accounts")),
  account_admin_approve: async ({ id }) => void (await account("admin_approve", { id })),
  account_admin_decline: async ({ id }) => void (await account("admin_decline", { id })),
  account_admin_revoke: async ({ id }) => void (await account("admin_revoke", { id })),
  account_admin_update: async ({ id, role, permissions }) => camel(await account("admin_update", { id, role, permissions })),
  account_admin_settings: async () => camel(await account("admin_settings")),
  account_admin_save_settings: async ({ settings }) =>
    camel(await account("admin_save_settings", { settings: { waitlist: settings.waitlist, default_permissions: settings.defaultPermissions } })),
  // The admin page reads these as the server sends them (snake_case).
  account_admin_ai_usage: ({ days }) => account("admin_ai_usage", { days }),
  account_admin_tickets: async () => camel(await account("admin_tickets")),
  account_admin_ticket_solved: async ({ id, solved }) => camel(await account("admin_ticket_solved", { id, solved })),

  async support_send({ kind, subject, message }) {
    const sent = await account<{ reference: string }>("support", { kind, subject, message, appVersion: `${pkg.version} (web)` });
    return sent.reference;
  },

  sync_status: syncState,
  async sync_now() {
    await sync();
    const now = syncState();
    if (now.state === "error") throw now.message;
  },
  // The browser already holds only the account's data: there's nothing to link.
  sync_link: () => sync(),
  sync_auto: () => true,
  sync_set_auto: () => undefined,
};
