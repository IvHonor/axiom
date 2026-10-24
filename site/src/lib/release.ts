import { cacheLife } from "next/cache";

/** The release page, for anything the download button doesn't cover. */
export const RELEASES_URL = "https://github.com/IvHonor/axiom/releases/latest";
export const REPO_URL = "https://github.com/IvHonor/axiom";

/** The file the app's own updater reads, so the site and the app agree on what's newest. */
const LATEST_JSON = "https://github.com/IvHonor/axiom/releases/latest/download/latest.json";

export interface Release {
  version: string;
  /** When it was published, as an ISO date. */
  date: string | null;
  /** The Windows installer (the `_x64-setup.exe`). */
  installer: string | null;
}

interface LatestJson {
  version?: string;
  pub_date?: string;
  platforms?: Record<string, { url?: string }>;
}

/** The newest published release, re-read every few minutes. Null until one's out. */
export async function latestRelease(): Promise<Release | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const response = await fetch(LATEST_JSON);
    if (!response.ok) return null;
    const latest = (await response.json()) as LatestJson;
    if (!latest.version) return null;
    const windows = latest.platforms?.["windows-x86_64-nsis"] ?? latest.platforms?.["windows-x86_64"];
    return { version: latest.version.replace(/^v/, ""), date: latest.pub_date ?? null, installer: windows?.url ?? null };
  } catch {
    return null;
  }
}
