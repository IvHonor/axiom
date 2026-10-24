import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { call, type Profile, type Session, type User } from "./axiom";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieValues } from "./session-cookies";

export { ACCESS_COOKIE, REFRESH_COOKIE };

// The website's sign-in, kept in two httpOnly cookies the page's scripts can't
// read: a short-lived access token, and the refresh token that renews it
// (see `src/proxy.ts`). Each website sign-in shows as a device in the account.

/** In a Server Action: remembers a new sign-in. */
export async function saveSession(session: Session) {
  const jar = await cookies();
  for (const cookie of cookieValues(session)) jar.set(cookie);
}

/** In a Server Action: forgets the sign-in on this browser. */
export async function clearSession() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Whether this browser holds a sign-in, without asking the server. For the header. */
export async function hasSession() {
  const jar = await cookies();
  return jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE);
}

export async function accessToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export type Account = User & Profile & { token: string };

/** The signed-in account, or null. Read once per request, behind a Suspense boundary. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const token = await accessToken();
  if (!token) return null;
  const [me, profile] = await Promise.all([call<User>("GET", "/v1/me", { token }), call<Profile>("GET", "/v1/account/profile", { token })]);
  if (!me.ok) return null;
  return { ...me.data, display_name: profile.ok ? profile.data.display_name : null, avatar: profile.ok ? profile.data.avatar : null, token };
});

/** The signed-in account, or off to sign in and back again. */
export async function requireAccount(path: string): Promise<Account> {
  const account = await currentAccount();
  if (!account) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  return account;
}
