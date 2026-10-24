import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieValues } from "@/lib/session-cookies";
import type { Session } from "@/lib/axiom";

const API_URL = (process.env.AXIOM_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

/**
 * Renews the website sign-in: when the short-lived access cookie has run out
 * but the refresh cookie is still there, swaps it for a new pair before the
 * page renders, so pages always see a working sign-in (or none).
 */
export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh || request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();

  let session: Session | null = null;
  try {
    const answer = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      signal: AbortSignal.timeout(70_000),
    });
    if (answer.ok) session = await answer.json();
    else if (answer.status !== 401) return NextResponse.next(); // Try again next time.
  } catch {
    return NextResponse.next();
  }

  if (!session) {
    const response = NextResponse.next();
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }
  // The page rendering now sees the new cookies, and the browser keeps them.
  const fresh = cookieValues(session);
  for (const cookie of fresh) request.cookies.set(cookie.name, cookie.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of fresh) response.cookies.set(cookie);
  return response;
}

export const config = {
  // Pages only: not scripts, styles, images or files.
  matcher: ["/((?!_next/|favicon.ico|textures/|screenshots/|.*\\.(?:svg|png|webp|jpg|ico|txt|xml)$).*)"],
};
