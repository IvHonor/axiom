import "server-only";
import { headers } from "next/headers";

/**
 * Calls the Axiom account server (the same one the app uses) on a visitor's
 * behalf. Set in Vercel:
 * - `AXIOM_API_URL`: the server, e.g. https://axiom-server-1bil.onrender.com
 * - `AXIOM_WEB_PROXY_SECRET`: the server's `WEB_PROXY_SECRET`, so rate limits
 *   count each visitor rather than the website as one.
 */
const API_URL = (process.env.AXIOM_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const PROXY_SECRET = process.env.AXIOM_WEB_PROXY_SECRET;

/** The terms version sign-up agrees to: `TERMS_VERSION` in crates/protocol. */
export const TERMS_VERSION = "2026-10-24";

export type Session = { access_token: string; expires_in: number; refresh_token: string; user: User };
export type User = { id: string; email: string; created_at: string; admin: boolean };
export type Pending = { email: string; confirm_email: boolean };
export type Profile = { display_name: string | null; avatar: string | null };
export type Device = { id: string; name: string; signed_in_at: string; last_active_at: string; current: boolean };

export type Answer<T> = { ok: true; status: number; data: T } | { ok: false; status: number; message: string };

/** The free server sleeps when idle and takes up to a minute to wake. */
const TIMEOUT_MS = 70_000;

export async function call<T>(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}): Promise<Answer<T>> {
  const sent = new Headers({ accept: "application/json" });
  if (body !== undefined) sent.set("content-type", "application/json");
  if (token) sent.set("authorization", `Bearer ${token}`);
  if (PROXY_SECRET) {
    const ip = await visitorIp();
    if (ip) {
      sent.set("x-axiom-proxy", PROXY_SECRET);
      sent.set("x-axiom-client-ip", ip);
    }
  }
  try {
    const response = await fetch(`${API_URL}${path}`, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (response.ok) return { ok: true, status: response.status, data: data as T };
    return { ok: false, status: response.status, message: data?.message ?? "Something went wrong on our side. Try again in a minute." };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach Axiom's servers. Check your connection and try again." };
  }
}

async function visitorIp() {
  const sent = await headers();
  return sent.get("x-real-ip") ?? sent.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** "Chrome on Windows (web)", for the account's device list. */
export async function deviceName() {
  const agent = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "A browser";
  const system = /Windows/.test(agent) ? "Windows" : /iPhone|iPad/.test(agent) ? "iOS" : /Mac OS/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /Linux/.test(agent) ? "Linux" : null;
  return `${browser}${system ? ` on ${system}` : ""} (web)`;
}
