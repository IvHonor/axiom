import { Suspense } from "react";
import { latestRelease, RELEASES_URL } from "@/lib/release";
import { DownloadLink, type Platform } from "./DownloadLink";

/**
 * The download for the visitor's computer: the Mac disk image on a Mac (once a
 * release has one), otherwise the Windows installer, with its version.
 * `only` pins it to one platform, for the download page.
 */
export function DownloadButton({ size = "lg", only }: { size?: "lg" | "md"; only?: Platform }) {
  return (
    <Suspense fallback={<DownloadLink windows={RELEASES_URL} mac={only === "mac" ? RELEASES_URL : null} size={size} only={only} />}>
      <Latest size={size} only={only} />
    </Suspense>
  );
}

async function Latest({ size, only }: { size: "lg" | "md"; only?: Platform }) {
  const release = await latestRelease();
  // No Mac build in this release yet: the Mac button goes to the releases page, without a version to promise.
  const version = only === "mac" && !release?.mac ? undefined : release?.version;
  return <DownloadLink windows={release?.installer ?? RELEASES_URL} mac={release?.mac ?? (only === "mac" ? RELEASES_URL : null)} version={version} size={size} only={only} />;
}

/** "Version 0.5.1 · 24 October 2026", for the download page. */
export async function ReleaseLine() {
  const release = await latestRelease();
  if (!release) return <span>The first release is on its way.</span>;
  const date = release.date ? new Date(release.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <span>
      Version {release.version}
      {date && ` · released ${date}`}
    </span>
  );
}
