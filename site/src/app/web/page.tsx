import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Globe2, LockKeyhole, RotateCw, Wrench } from "lucide-react";
import { AppWindow } from "@/components/home/AppWindow";
import { NotifyForm } from "@/components/account/NotifyForm";
import { currentAccount } from "@/lib/session";
import s from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Axiom on the web",
  description: "Your synced Axiom workspace, in your browser. Coming soon.",
};

export default function WebPage() {
  return (
    <section className={`${s.web} wrap`}>
      <header className={s.webHead}>
        <span className="eyebrow">AXIOM ON THE WEB <span className="soon">COMING SOON</span></span>
        <h1>Your terminal. <span>In any browser.</span></h1>
        <p>Your synced workspace, wherever you are: plans, projects and notes from any computer, with the same end-to-end encryption as the app.</p>
      </header>

      <div className={s.browser}>
        <div className={s.browserBar} aria-hidden="true">
          <span className="window-dots"><i /><i /><i /></span>
          <span className={s.browserArrows}><ArrowLeft size={13} /><ArrowRight size={13} /><RotateCw size={12} /></span>
          <span className={s.address}><LockKeyhole size={11} /> axiomterminal.app<span>/web</span></span>
        </div>
        <div className={s.browserBody}>
          <div className={s.ghost}><AppWindow /></div>
          <div className={s.overlay}>
            <Suspense fallback={<Status />}>
              <ForVisitor />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}

function Status({ children }: { children?: ReactNode }) {
  return (
    <div className={s.overlayCard}>
      <Globe2 size={26} strokeWidth={1.3} />
      <span className="soon">COMING SOON</span>
      <h2>Axiom on the web is on its way.</h2>
      {children}
    </div>
  );
}

async function ForVisitor() {
  const account = await currentAccount();
  if (account) {
    return (
      <div className={s.overlayCard}>
        <Wrench size={26} strokeWidth={1.3} />
        <span className="soon">EARLY ACCESS</span>
        <h2>Your terminal is taking shape, {account.display_name || account.email.split("@")[0]}.</h2>
        <p>Open the early workspace to use Daily Plan with <b>{account.email}</b>. More areas are on the way; private areas will stay locked until browser encryption is ready.</p>
        <NotifyForm email={account.email} />
        <Link className="button button-primary button-md" href="/terminal">Open the early web terminal <ArrowRight size={15} /></Link>
      </div>
    );
  }
  return (
    <Status>
      <p>Leave your email and we&apos;ll tell you the moment it opens. Nothing else, no newsletter.</p>
      <NotifyForm />
      <p className={s.small}>Already have an account? <Link href="/sign-in?next=/web">Sign in</Link> · New? <Link href="/sign-up">Request to join</Link></p>
    </Status>
  );
}
