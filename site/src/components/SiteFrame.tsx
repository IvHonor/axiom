"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The terminal owns its screen; marketing pages keep their existing frame. */
export function SiteFrame({ header, footer, children }: { header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const path = usePathname();
  if (path === "/terminal" || path.startsWith("/terminal/")) return <><a className="skip-link" href="#main">Skip to workspace</a>{children}</>;
  return <><a className="skip-link" href="#main">Skip to content</a>{header}<main id="main">{children}</main>{footer}</>;
}
