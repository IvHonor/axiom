import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { REPO_URL } from "@/lib/release";
import { hasSession } from "@/lib/session";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/site";
import { Lockup } from "./Logo";
import { SiteNav } from "./SiteNav";

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap site-header-inner">
        <Link href="/" className="site-home" aria-label="Axiom home">
          <Lockup />
        </Link>
        <SiteNav />
        <Suspense fallback={<AccountLink signedIn={false} />}>
          <HeaderAccount />
        </Suspense>
        <Link href="/download" className="button button-primary button-md header-download">Get Axiom <span aria-hidden="true">↗</span></Link>
      </div>
    </header>
  );
}

/** "Sign in", or a way back to the account. Only checks for the cookie, so it never waits on the server. */
async function HeaderAccount() {
  return <AccountLink signedIn={await hasSession()} />;
}

function AccountLink({ signedIn }: { signedIn: boolean }) {
  return signedIn
    ? <Link href="/account" className="header-account"><UserRound size={15} strokeWidth={1.6} /> Account</Link>
    : <Link href="/sign-in" className="header-account">Sign in</Link>;
}

/** The year, cached: reading the clock in a prerendered page needs a cache scope. */
async function thisYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function Footer() {
  const year = await thisYear();
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-grid">
        <div className="site-footer-brand">
          <Lockup />
          <p className="muted">A little structure.<br />A lot more possibility.</p>
          <span className="eyebrow footer-status"><i className="status-dot" /> Your life, in your hands.</span>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link href="/download">Download</Link>
          <Link href="/#areas">Features</Link>
          <Link href="/#web">Axiom on the web</Link>
          <a href={`${REPO_URL}/releases`}>Release notes</a>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <Link href="/support">Support</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={REPO_URL}>Source code</a>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link href="/privacy">Privacy notice</Link>
          <Link href="/terms">Terms of use</Link>
        </nav>
      </div>
      <div className="wrap site-footer-base muted">
        <span>© {year} {OPERATOR_NAME ?? "Axiom"}. Built for a life in progress.</span>
        <span>OPEN SOURCE / MIT LICENCE</span>
      </div>
    </footer>
  );
}
