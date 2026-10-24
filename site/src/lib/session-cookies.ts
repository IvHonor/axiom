import type { Session } from "./axiom";

/** The website sign-in cookies, shared by the pages and `src/proxy.ts`. */
export const ACCESS_COOKIE = "axiom_access";
export const REFRESH_COOKIE = "axiom_refresh";
/** How long the server keeps a refresh token working (REFRESH_TTL_DAYS). */
const REFRESH_DAYS = 60;

const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export function cookieValues(session: Pick<Session, "access_token" | "expires_in" | "refresh_token">) {
  return [
    // Expires a little early, so the proxy renews it before the server would refuse it.
    { name: ACCESS_COOKIE, value: session.access_token, ...options, maxAge: Math.max(60, session.expires_in - 60) },
    { name: REFRESH_COOKIE, value: session.refresh_token, ...options, maxAge: REFRESH_DAYS * 24 * 60 * 60 },
  ];
}
