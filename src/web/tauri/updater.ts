// Stands in for @tauri-apps/plugin-updater on the web: the website always
// serves the newest Axiom, so there's never an update to install.

export interface DownloadEvent {
  event: "Started" | "Progress" | "Finished";
  data: { contentLength?: number; chunkLength: number };
}

export interface Update {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
