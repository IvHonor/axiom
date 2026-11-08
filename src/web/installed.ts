// What makes Axiom on the web work as an installed app (a phone's home
// screen, or "Install app" in a desktop browser), with no app store:
// the service worker that keeps the app for offline use (site/public/sw.js),
// asking the browser to keep this device's data, and the phone's status bar
// matching the theme.
import { DEMO } from "./runtime";

export function setUpInstalledApp() {
  // The service worker only in a real build: in development it would keep stale files.
  if (import.meta.env.PROD && !DEMO && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("Axiom couldn't be set up to open offline:", e));
    });
  }

  // The account's copy and its unsynced edits live in IndexedDB. A browser
  // short of space may clear a site's storage unless it's been asked to keep it.
  void navigator.storage?.persist?.().catch(() => {});

  // The status bar (Android) and browser chrome take the theme's own colour.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const paint = () => {
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    if (surface) meta.content = surface;
  };
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-color-scheme", "class"] });
  paint();
}
