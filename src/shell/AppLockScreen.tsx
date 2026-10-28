import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { lockApp, lockStatus, resetLock, sendLockCode, unlockApp, useLockStatus } from "../lib/appLock";
import { ErrorNote, useAction } from "./account/fields";
import { Logo } from "./ui/Logo";

/** How long the app waits, covered, for the lock to answer before showing anyway. */
const WAIT_MS = 3000;

/** Activity that counts as using Axiom, for the idle timer. */
const ACTIVITY = ["pointerdown", "pointermove", "keydown", "wheel"] as const;

/**
 * Covers the app while the PIN lock is locked, and locks it after the chosen
 * idle time. `accountState` re-reads the lock when the account changes
 * (signing out turns it off).
 */
export function AppLockScreen({ accountState }: { accountState: string | undefined }) {
  const status = useLockStatus();
  const [waited, setWaited] = useState(false);

  // Asks again until it answers: a lost answer mustn't leave the app covered.
  useEffect(() => {
    let timer = 0;
    const ask = () => void lockStatus().catch(() => (timer = window.setTimeout(ask, 1000)));
    ask();
    return () => window.clearTimeout(timer);
  }, [accountState]);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const idleMinutes = status?.enabled && !status.locked ? status.idleMinutes : 0;
  useEffect(() => {
    if (!idleMinutes) return;
    let timer = 0;
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void lockApp(), idleMinutes * 60_000);
    };
    restart();
    ACTIVITY.forEach((event) => window.addEventListener(event, restart, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, restart));
    };
  }, [idleMinutes]);

  // Until the lock has answered, cover the app (it may be locked), but only
  // briefly: a lock that never answers mustn't leave Axiom blank.
  if (!status) return waited ? null : createPortal(<div className="app-lock" aria-busy="true" />, document.body);
  if (!status.locked) return null;
  return createPortal(<Locked needsCode={status.needsCode} />, document.body);
}

function Locked({ needsCode }: { needsCode: boolean }) {
  const [step, setStep] = useState<"pin" | "code" | "reset">(needsCode ? "code" : "pin");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    if (needsCode) setStep((s) => (s === "pin" ? "code" : s));
  }, [needsCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === "pin") {
      const done = await run(() => unlockApp(pin));
      if (!done) setPin("");
    } else if (step === "reset") {
      await run(() => resetLock(code));
    }
  };

  const emailCode = async () => {
    const sent = await run(() => sendLockCode().then(() => true));
    if (sent) {
      setCode("");
      setStep("reset");
    }
  };

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="Axiom is locked">
      <form className="app-lock-card" onSubmit={submit} noValidate>
        <Logo size={32} />
        <p className="app-lock-title">
          <LockKeyhole size={15} strokeWidth={1.75} /> Axiom is locked
        </p>

        {step === "pin" && (
          <>
            <input
              className="app-lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              aria-label="PIN"
              placeholder="Enter your PIN"
              maxLength={8}
              autoFocus
              value={pin}
              disabled={busy}
              onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ""))}
            />
            <ErrorNote error={error} />
            <button className="btn" type="submit" disabled={busy || pin.length < 4}>
              {busy ? "Checking…" : "Unlock"}
            </button>
            <button type="button" className="link" onClick={() => (setError(null), setStep("code"))} disabled={busy}>
              Forgot PIN?
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <p className="field-hint">
              {needsCode ? "Too many wrong PINs. " : ""}We&apos;ll email a code to your Axiom account. Entering it turns the PIN lock off, and you can
              choose a new PIN in the Account panel.
            </p>
            <ErrorNote error={error} />
            <button type="button" className="btn" onClick={() => void emailCode()} disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
            {!needsCode && (
              <button type="button" className="link" onClick={() => (setError(null), setStep("pin"))} disabled={busy}>
                Back to PIN
              </button>
            )}
          </>
        )}

        {step === "reset" && (
          <>
            <p className="field-hint">We&apos;ve emailed your account a code. It works for 30 minutes; check your spam folder if it hasn&apos;t arrived.</p>
            <input
              className="code-input"
              aria-label="Code"
              autoComplete="one-time-code"
              spellCheck={false}
              autoFocus
              maxLength={12}
              placeholder="XXXX-XXXX"
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
            <ErrorNote error={error} />
            <button className="btn" type="submit" disabled={busy || !code}>
              {busy ? "Checking…" : "Turn off the PIN lock"}
            </button>
            <button type="button" className="link" onClick={() => void emailCode()} disabled={busy}>
              Send a new code
            </button>
          </>
        )}
      </form>
    </div>
  );
}
