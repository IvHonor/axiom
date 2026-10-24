"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { call, deviceName, TERMS_VERSION, type Pending, type Profile, type Session } from "@/lib/axiom";
import { accessToken, clearSession, REFRESH_COOKIE, saveSession } from "@/lib/session";

/**
 * Account actions. Passwords never arrive here: the browser sends its login
 * key instead (see `src/lib/login-key.ts`), except once for an account still
 * on a password from an older Axiom, which the server then upgrades.
 */
export type AuthResult =
  | { kind: "signed-in" }
  | { kind: "confirm-email"; email: string }
  | { kind: "waiting"; email: string }
  | { kind: "plain-password" }
  | { kind: "error"; message: string };

/** The status for an account still on a password from before login keys. */
const PLAIN_PASSWORD = 428;
const WAITING = 403;

function outcome(answer: Awaited<ReturnType<typeof call<Session | Pending>>>, email: string): AuthResult | Session {
  if (answer.ok && answer.status === 202) {
    const pending = answer.data as Pending;
    return pending.confirm_email ? { kind: "confirm-email", email: pending.email } : { kind: "waiting", email: pending.email };
  }
  if (answer.ok) return answer.data as Session;
  if (answer.status === PLAIN_PASSWORD) return { kind: "plain-password" };
  if (answer.status === WAITING || (answer.status === 409 && answer.message.includes("waiting list"))) return { kind: "waiting", email };
  return { kind: "error", message: answer.message };
}

export async function signIn(email: string, secret: string, loginKey?: string): Promise<AuthResult> {
  const answer = await call<Session | Pending>("POST", "/v1/auth/sign-in", { body: { email, password: secret, login_key: loginKey, device_name: await deviceName() } });
  const result = outcome(answer, email);
  if (!("access_token" in result)) return result;
  await saveSession(result);
  return { kind: "signed-in" };
}

export async function signUp(email: string, key: string, agreed: boolean): Promise<AuthResult> {
  if (!agreed) return { kind: "error", message: "Agree to the terms of use and privacy notice to create an account." };
  const body = { email, password: key, device_name: await deviceName(), accepted_terms: TERMS_VERSION };
  const answer = await call<Session | Pending>("POST", "/v1/auth/sign-up", { body });
  const result = outcome(answer, email);
  if (!("access_token" in result)) return result;
  await saveSession(result);
  return { kind: "signed-in" };
}

/** Confirms the address with the emailed code, then signs in with the same key. */
export async function confirmEmail(email: string, code: string, key: string): Promise<AuthResult> {
  if (!code.trim()) return { kind: "error", message: "Enter the code from the email." };
  const confirmed = await call("POST", "/v1/auth/confirm-email", { body: { email, code } });
  if (!confirmed.ok) return { kind: "error", message: confirmed.message };
  return signIn(email, key);
}

export async function resendCode(email: string) {
  await call("POST", "/v1/auth/confirm-email/send", { body: { email } });
}

export async function signOut() {
  const refresh = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refresh) await call("POST", "/v1/auth/sign-out", { body: { refresh_token: refresh } });
  await clearSession();
  redirect("/");
}

async function signedIn() {
  const token = await accessToken();
  if (!token) redirect("/sign-in?next=/account");
  return token;
}

export type Saved = { ok: true; message?: string } | { ok: false; message: string };

export async function saveProfile(profile: Profile): Promise<Saved> {
  const token = await signedIn();
  const answer = await call<Profile>("PUT", "/v1/account/profile", { token, body: profile });
  return answer.ok ? { ok: true, message: "Saved." } : { ok: false, message: answer.message };
}

export async function signOutDevice(id: string): Promise<Saved> {
  const token = await signedIn();
  const answer = await call("DELETE", `/v1/account/devices/${encodeURIComponent(id)}`, { token });
  return answer.ok ? { ok: true } : { ok: false, message: answer.message };
}

export async function deleteAccount(key: string): Promise<Saved> {
  const token = await signedIn();
  const answer = await call("DELETE", "/v1/account", { token, body: { password: key } });
  if (!answer.ok) return { ok: false, message: answer.status === 401 ? "That password isn't right." : answer.message };
  await clearSession();
  redirect("/?account=deleted");
}

/** Adds an address to hear when Axiom on the web opens. */
export async function notifyMe(email: string): Promise<Saved> {
  const answer = await call("POST", "/v1/web-updates", { body: { email } });
  return answer.ok ? { ok: true, message: "You're on the list. We'll email you when Axiom on the web opens." } : { ok: false, message: answer.message };
}
