"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useRef } from "react";

const links = [
  ["/#tour", "Inside Axiom"],
  ["/#areas", "The areas"],
  ["/web", "On the web"],
  ["/#privacy", "Your privacy"],
  ["/support", "Support"],
];

export function SiteNav() {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <>
      <nav className="site-nav" aria-label="Main">
        {links.map(([href, label]) => <Link key={href} href={href}>{label}{href === "/web" && <span className="soon">SOON</span>}</Link>)}
      </nav>
      <details className="mobile-nav" ref={menu} onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Navigation menu"><Menu className="menu-open" size={20} /><X className="menu-close" size={20} /></summary>
        <nav aria-label="Mobile" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
        }}>
          {links.map(([href, label]) => <Link key={href} href={href}>{label}{href === "/web" && <span className="soon">SOON</span>}</Link>)}
          <Link href="/account">Your account</Link>
          <Link href="/download">Get Axiom ↗</Link>
        </nav>
      </details>
    </>
  );
}
