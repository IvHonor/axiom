"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Hourglass, MailCheck } from "lucide-react";
import { confirmEmail, resendCode, signIn, signUp, type AuthResult } from "@/app/account/actions";
import { loginKey, normalizeEmail } from "@/lib/login-key";
import s from "./account.module.css";

/** A path on this site, or null: `next` must never send someone to another site (`//evil`, `/\evil`). */
function sameSitePath(next: string | null) {
  if (!next) return null;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

type Step = { kind: "form" } | { kind: "code"; email: string; key: string } | { kind: "waiting"; email: string };

/** Sign in or create an account. The password is turned into a login key here, in the browser. */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function settle(result: AuthResult, email: string, key: string) {
    if (result.kind === "signed-in") {
      // Back to where sign-in was asked for (read here, so the form renders without waiting on the URL).
      router.push(sameSitePath(new URLSearchParams(window.location.search).get("next")) ?? "/account");
      router.refresh();
      return;
    }
    setBusy(null);
    if (result.kind === "confirm-email") setStep({ kind: "code", email: result.email, key });
    else if (result.kind === "waiting") setStep({ kind: "waiting", email: result.email || email });
    else if (result.kind === "error") setError(result.message);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const password = String(form.get("password") ?? "");
    setError(null);
    if (mode === "sign-up" && password.length < 8) return setError("Use at least 8 characters for your password.");
    if (mode === "sign-up" && password !== form.get("repeat")) return setError("The two passwords don't match.");
    setBusy("Securing your password…");
    const key = await loginKey(email, password);
    setBusy(mode === "sign-in" ? "Signing in…" : "Creating your account…");
    let result = mode === "sign-in" ? await signIn(email, key) : await signUp(email, key, form.get("agree") === "on");
    // An account from an older Axiom: its password goes once more, so the server can switch it to the key.
    if (result.kind === "plain-password") result = await signIn(email, password, key);
    settle(result, email, key);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "code") return;
    setError(null);
    setBusy("Checking the code…");
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    settle(await confirmEmail(step.email, code, step.key), step.email, step.key);
  }

  if (step.kind === "waiting") {
    return (
      <div className={s.state}>
        <Hourglass size={26} strokeWidth={1.4} />
        <h2>You&apos;re on the waiting list</h2>
        <p>We&apos;re letting people in gradually. We&apos;ll email <b>{step.email}</b> as soon as your account is approved, and then you can sign in here and in the app.</p>
        <Link className="button button-secondary button-md" href="/">Back to the homepage</Link>
      </div>
    );
  }

  if (step.kind === "code") {
    return (
      <form className={s.form} onSubmit={confirm}>
        <div className={s.state}>
          <MailCheck size={26} strokeWidth={1.4} />
          <h2>Check your email</h2>
          <p>We sent a code to <b>{step.email}</b>. It works for 30 minutes.</p>
        </div>
        <label className={s.field}>
          <span>Code</span>
          <input name="code" autoComplete="one-time-code" placeholder="K7Q2-M9XD" autoFocus required />
        </label>
        {error && <p className={s.error} role="alert">{error}</p>}
        {notice && <p className={s.notice} role="status">{notice}</p>}
        <button className="button button-primary button-lg" disabled={!!busy}>{busy ?? "Confirm and continue"} {!busy && <ArrowRight size={16} />}</button>
        <button type="button" className={s.textButton} onClick={async () => { await resendCode(step.email); setNotice("A new code is on its way."); }}>Send a new code</button>
      </form>
    );
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <label className={s.field}>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      <label className={s.field}>
        <span>Password</span>
        <span className={s.password}>
          <input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 8 : undefined} maxLength={128} required />
          <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </label>
      {mode === "sign-up" && (
        <>
          <label className={s.field}>
            <span>Repeat password</span>
            <input name="repeat" type={showPassword ? "text" : "password"} autoComplete="new-password" required />
          </label>
          <p className={s.hint}>At least 8 characters. Your password also locks your encrypted areas, so pick one you&apos;ll remember: we can&apos;t see it or recover it.</p>
          <label className={s.check}>
            <input type="checkbox" name="agree" required />
            <span>I agree to the <Link href="/terms" target="_blank">terms of use</Link> and have read the <Link href="/privacy" target="_blank">privacy notice</Link>.</span>
          </label>
        </>
      )}
      {error && <p className={s.error} role="alert">{error}</p>}
      <button className="button button-primary button-lg" disabled={!!busy}>{busy ?? (mode === "sign-in" ? "Sign in" : "Request to join")} {!busy && <ArrowRight size={16} />}</button>
      {mode === "sign-in" ? (
        <p className={s.hint}>Forgot your password? Reset it in the Axiom app (<b>Account → Forgot password</b>), where your recovery code keeps your encrypted areas safe.</p>
      ) : null}
    </form>
  );
}
