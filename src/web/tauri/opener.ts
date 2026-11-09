// Stands in for @tauri-apps/plugin-opener on the web: links open in a new tab.
//
// Only the kinds of link the desktop's opener allows (web, email, phone).
// Links come from synced and shared data (a board's cards, a calendar feed,
// a gift idea), so a `javascript:` or `data:` one must never be followed:
// on the website it would run as Axiom itself.

const ALLOWED = new Set(["http:", "https:", "mailto:", "tel:"]);

/** The link, if it's one that's safe to open; null if not. */
export function safeLink(url: string | URL): string | null {
  try {
    const parsed = new URL(String(url));
    return ALLOWED.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export async function openUrl(url: string | URL) {
  const link = safeLink(url);
  if (!link) throw "Only web, email and phone links can be opened.";
  window.open(link, "_blank", "noopener,noreferrer");
}

export async function openPath() {
  throw "Files on this device can't be opened from the browser.";
}

/** The desktop shows a saved file in its folder; the browser already put it in Downloads. */
export async function revealItemInDir() {}
