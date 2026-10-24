import { Suspense } from "react";
import { Download } from "lucide-react";
import { latestRelease, RELEASES_URL } from "@/lib/release";

/** "Download for Windows", straight to the newest installer, with its version. */
export function DownloadButton({ size = "lg", label = "Download for Windows" }: { size?: "lg" | "md"; label?: string }) {
  return (
    <Suspense fallback={<Button href={RELEASES_URL} size={size} label={label} />}>
      <Latest size={size} label={label} />
    </Suspense>
  );
}

async function Latest({ size, label }: { size: "lg" | "md"; label: string }) {
  const release = await latestRelease();
  return <Button href={release?.installer ?? RELEASES_URL} version={release?.version} size={size} label={label} />;
}

function Button({ href, version, size, label }: { href: string; version?: string; size: "lg" | "md"; label: string }) {
  return (
    <a className={`button button-primary button-${size}`} href={href}>
      <Download size={size === "lg" ? 18 : 16} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
      {version && <span className="button-note">v{version}</span>}
    </a>
  );
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
