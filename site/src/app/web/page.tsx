import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Globe2, LockKeyhole, Monitor, RotateCw, Smartphone, TabletSmartphone } from "lucide-react";
import { AppWindow } from "@/components/home/AppWindow";
import { InstallButton } from "@/components/InstallApp";
import { currentAccount } from "@/lib/session";
import s from "@/components/account/account.module.css";
import home from "@/components/home/home.module.css";

export const metadata: Metadata = {
  title: "Axiom on the web",
  description: "Your whole Axiom workspace in your browser, synced with your desktop. Install it on your phone or computer, no app store needed, and it works offline.",
};

export default function WebPage() {
  return (
    <section className={`${s.web} wrap`}>
      <header className={s.webHead}>
        <span className="eyebrow">AXIOM ON THE WEB <span className="soon">NEW</span></span>
        <h1>Your terminal. <span>In any browser.</span></h1>
        <p>The whole workspace in your browser, synced with your desktop app: your areas, themes and layout. Install it on your phone or computer to open it like an app, even offline. No app store needed.</p>
      </header>

      <div className={s.browser}>
        <div className={s.browserBar} aria-hidden="true">
          <span className="window-dots"><i /><i /><i /></span>
          <span className={s.browserArrows}><ArrowLeft size={13} /><ArrowRight size={13} /><RotateCw size={12} /></span>
          <span className={s.address}><LockKeyhole size={11} /> axiomterminal.app<span>/terminal</span></span>
        </div>
        <div className={s.browserBody}>
          <div className={s.ghost}><AppWindow /></div>
          <div className={s.overlay}>
            <Suspense fallback={<Card title="Opening…" />}>
              <ForVisitor />
            </Suspense>
          </div>
        </div>
      </div>

      <ul className={home.features} aria-label="Installing Axiom">
        <li><Smartphone size={16} strokeWidth={1.5} /><div><b>iPhone and iPad</b><span>Open this page in Safari, tap Share, then Add to Home Screen. Only Safari can add apps to the home screen there.</span></div></li>
        <li><TabletSmartphone size={16} strokeWidth={1.5} /><div><b>Android</b><span>Open it in Chrome and tap Install when it&apos;s offered, or Install app in the menu.</span></div></li>
        <li><Monitor size={16} strokeWidth={1.5} /><div><b>Any computer</b><span>In Chrome or Edge, click Install in the address bar. Axiom gets its own window, icon and shortcuts.</span></div></li>
      </ul>
      <p className={s.webNote}>
        Finance, Notes, Journal, Goals and Birthdays stay end-to-end encrypted: for now they open in the <Link href="/download">desktop app</Link>, and the browser unlocks them soon. Everything else works here, and syncs both ways.
      </p>
    </section>
  );
}

function Card({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.overlayCard}>
      <Globe2 size={26} strokeWidth={1.3} />
      <span className="soon">NEW</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

async function ForVisitor() {
  const account = await currentAccount();
  if (account) {
    return (
      <Card title={`Welcome back, ${account.display_name || account.email.split("@")[0]}.`}>
        <p>Your workspace as <b>{account.email}</b>: the same Axiom as on your desktop, with your themes, layout and areas.</p>
        <a className="button button-primary button-md" href="/terminal">Open Axiom <ArrowRight size={15} /></a>
        <InstallButton size="md" secondary />
      </Card>
    );
  }
  return (
    <Card title="Your workspace, in a tab.">
      <p>Sign in with your Axiom account to open it here, or install it on this device.</p>
      <Link className="button button-primary button-md" href="/sign-in?next=/terminal">Sign in <ArrowRight size={15} /></Link>
      <p className={s.small}>New to Axiom? <Link href="/sign-up">Request to join</Link></p>
    </Card>
  );
}
