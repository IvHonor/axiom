/** A random browser-session binding, never an access or refresh token. */
export const BROWSER_SESSION_COOKIE = "axiom_browser_session";

export function browserSessionId(cookieHeader: string): string | null {
  const prefix = `${BROWSER_SESSION_COOKIE}=`;
  return cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || null;
}
