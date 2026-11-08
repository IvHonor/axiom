// Stands in for @tauri-apps/plugin-opener on the web: links open in a new tab.

export async function openUrl(url: string | URL) {
  window.open(String(url), "_blank", "noopener,noreferrer");
}

export async function openPath() {
  throw "Files on this device can't be opened from the browser.";
}

/** The desktop shows a saved file in its folder; the browser already put it in Downloads. */
export async function revealItemInDir() {}
