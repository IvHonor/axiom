/** Shared by account requests and session refresh; production must name its server. */
export function accountServerUrl() {
  const configured = process.env.AXIOM_API_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("AXIOM_API_URL is missing.");
  const url = new URL(configured || "http://localhost:8787");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("AXIOM_API_URL must be an HTTP(S) base URL without credentials, a query or a fragment.");
  return url.href.replace(/\/+$/, "");
}

/** Keep useful transport codes, without logging URLs, credentials or response bodies. */
export function accountErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UnknownError";
  const cause = error.cause;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]{1,64}$/.test(cause.code)) return cause.code;
  return ["TimeoutError", "AbortError", "TypeError"].includes(error.name) ? error.name : "Error";
}
