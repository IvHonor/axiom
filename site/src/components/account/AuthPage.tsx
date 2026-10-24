import Link from "next/link";
import { CloudOff, Globe2, LockKeyhole, RefreshCw } from "lucide-react";
import { AuthForm } from "./AuthForm";
import s from "./account.module.css";

const POINTS = [
  { icon: RefreshCw, text: "Sync your workspace between your computers." },
  { icon: LockKeyhole, text: "Personal areas stay end-to-end encrypted. Your password never leaves your device." },
  { icon: Globe2, text: "Be first in when Axiom on the web opens." },
  { icon: CloudOff, text: "Optional: Axiom works fully offline without one." },
];

/** The sign-in and sign-up pages: a short pitch beside the form. */
export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const signIn = mode === "sign-in";
  return (
    <section className={`${s.auth} wrap`}>
      <div className={s.pitch}>
        <span className="eyebrow">{signIn ? "WELCOME BACK" : "JOIN AXIOM"}</span>
        <h1>{signIn ? <>Sign in to<br /><span>your account.</span></> : <>Request to<br /><span>join Axiom.</span></>}</h1>
        <p>{signIn ? "The same account you use in the Axiom app. Manage your profile, devices and settings here." : "We're letting people in gradually, so new accounts may join a short waiting list. We'll email you as soon as you're in."}</p>
        <ul>{POINTS.map(({ icon: Icon, text }) => <li key={text}><Icon size={15} />{text}</li>)}</ul>
      </div>
      <div className={s.card}>
        <h2 className={s.cardTitle}>{signIn ? "Sign in" : "Create your account"}</h2>
        <AuthForm mode={mode} />
        <p className={s.switch}>
          {signIn ? <>New to Axiom? <Link href="/sign-up">Request to join</Link></> : <>Already have an account? <Link href="/sign-in">Sign in</Link></>}
        </p>
      </div>
    </section>
  );
}
