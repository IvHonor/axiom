// Updates come from GitHub Releases. Each one is signed with Axiom's private
// key; the updater refuses anything not signed with it (the public key is in
// src-tauri/tauri.conf.json).
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

/** The newer version on offer, or null when this one is the latest. */
export const findUpdate = (): Promise<Update | null> => check();

/**
 * Downloads, verifies and installs the update, then restarts Axiom.
 * `onProgress` gets 0..1, or null while the size isn't known.
 */
export async function installUpdate(update: Update, onProgress: (fraction: number | null) => void) {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : null);
    } else if (event.event === "Progress") {
      done += event.data.chunkLength;
      onProgress(total ? Math.min(done / total, 1) : null);
    }
  });
  // On Windows the installer closes Axiom itself; elsewhere, restart into the new version.
  await relaunch();
}
