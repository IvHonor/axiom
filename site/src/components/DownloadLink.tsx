"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";

export type Platform = "windows" | "mac";

const onMac = () => /Mac/i.test(navigator.userAgent);
// Nothing to subscribe to: the platform doesn't change while the page is open.
const subscribe = () => () => {};

/** The download button. The server renders Windows; a Mac swaps in its own download once the page loads. */
export function DownloadLink({ windows, mac, version, size, only }: { windows: string; mac: string | null; version?: string; size: "lg" | "md"; only?: Platform }) {
  const isMac = useSyncExternalStore(subscribe, onMac, () => false);
  const platform: Platform = only ?? (isMac && mac ? "mac" : "windows");
  const href = platform === "mac" && mac ? mac : windows;
  return (
    <a className={`button button-primary button-${size}`} href={href}>
      <Download size={size === "lg" ? 18 : 16} strokeWidth={2} aria-hidden="true" />
      <span>{platform === "mac" ? "Download for macOS" : "Download for Windows"}</span>
      {version && <span className="button-note">v{version}</span>}
    </a>
  );
}
