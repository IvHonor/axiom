import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DownloadButton, ReleaseLine } from "@/components/Download";
import { RELEASES_URL, REPO_URL } from "@/lib/release";

export const metadata: Metadata = {
  title: "Download",
  description: "Download Axiom for Windows 10 and 11. Free, and it keeps itself up to date.",
};

export default function DownloadPage() {
  return (
    <article className="page wrap">
      <h1>Download Axiom</h1>
      <p className="page-lede muted">
        Free for Windows 10 and 11.{" "}
        <Suspense fallback={null}>
          <ReleaseLine />
        </Suspense>
      </p>
      <p>
        <DownloadButton />
      </p>

      <h2>Installing</h2>
      <ol className="steps">
        <li>Download the installer above. It&apos;s the file ending in <b>_x64-setup.exe</b>, about 10 MB.</li>
        <li>Open it and follow the steps. It installs just for you, so it doesn&apos;t need an administrator.</li>
        <li>Open Axiom and pick the areas you want. You can start straight away; an account is only needed to sync.</li>
      </ol>

      <div className="note">
        <b>&ldquo;Windows protected your PC&rdquo;?</b>
        <p>
          Axiom&apos;s installer isn&apos;t code-signed yet, so Windows SmartScreen doesn&apos;t recognise it. Choose <b>More info</b>, then <b>Run anyway</b>. Only do this for a file you
          downloaded from this site or Axiom&apos;s <a href={RELEASES_URL}>GitHub releases</a>.
        </p>
      </div>

      <h2>Updates</h2>
      <p>Axiom checks for new versions by itself and offers them in the app. Updates are signed, so the app only installs ones that really came from Axiom.</p>

      <h2>What you need</h2>
      <ul>
        <li>Windows 10 or 11, 64-bit.</li>
        <li>About 100 MB of disk space, plus whatever you store in it.</li>
        <li>An internet connection only for syncing, calendars, book search and updates.</li>
      </ul>

      <h2>Other ways to get it</h2>
      <ul>
        <li>
          Every version, with release notes, is on <a href={RELEASES_URL}>GitHub</a>. There&apos;s also an <b>.msi</b> installer there for managed computers.
        </li>
        <li>
          Axiom is open source: you can <a href={`${REPO_URL}#run-locally`}>build it yourself</a>.
        </li>
        <li>
          macOS and Linux aren&apos;t released yet. <Link href="/#web">Axiom on the web</Link> is coming soon for anyone with an account.
        </li>
      </ul>
    </article>
  );
}
