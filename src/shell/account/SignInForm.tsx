import { useState, type FormEvent } from "react";
import {
  confirmEmail,
  requestReset,
  resetPassword,
  sendConfirmation,
  signIn,
  signUp,
  type AccountStatus,
  type SignInOutcome,
} from "../../lib/account";
import { ErrorNote, PasswordField, SlowHint, useAction } from "./fields";
import { PageLink } from "./HelpLinks";

/**
 * Sign in, create an account (then confirm its address with an emailed code),
 * or reset a forgotten password (ask for a code, then use it).
 */
type Mode = "sign-in" | "sign-up" | "confirm" | "forgot" | "reset" | "waitlisted";

const INTRO: Record<Mode, string> = {
  "sign-in": "Sign in to sync your boards between your computers.",
  "sign-up": "An account lets Axiom sync your boards between your computers.",
  confirm: "",
  forgot: "Enter your account's email and we'll send you a code to choose a new password.",
  reset: "",
  waitlisted: "",
};

export function SignInForm({ onDone }: { onDone: (status: AccountStatus) => void }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const { busy, error, setError, run } = useAction();

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      const sent = await run(() => requestReset(email).then(() => true));
      if (sent) {
        setPassword("");
        switchTo("reset");
      }
      return;
    }
    if (mode === "reset") {
      const status = await run(() => resetPassword(email, code, password));
      if (status) onDone(status);
      return;
    }
    const outcome = await run(() =>
      mode === "sign-up" ? signUp(email, password, agreed) : mode === "confirm" ? confirmEmail(email, code, password) : signIn(email, password),
    );
    if (outcome) settle(outcome);
  }

  /** The password is kept while confirming: signing in comes right after. */
  function settle(outcome: SignInOutcome) {
    if (outcome.state === "confirm_email") {
      setCode("");
      switchTo("confirm");
    } else if (outcome.state === "waitlisted") {
      setPassword("");
      switchTo("waitlisted");
    } else {
      onDone(outcome);
    }
  }

  if (mode === "waitlisted") {
    return (
      <div className="account">
        <p className="account-intro">
          You're on the waiting list as <strong>{email}</strong>. Axiom accounts are being let in a few at a time; we'll email you as soon as
          yours is approved. Then sign in here with the password you just chose.
        </p>
        <p className="account-intro">Until then, Axiom works fully on this computer.</p>
        <div className="account-links">
          <button className="link" onClick={() => switchTo("sign-in")}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const submitLabel = {
    "sign-in": busy ? "Signing in…" : "Sign in",
    "sign-up": busy ? "Creating account…" : "Create account",
    confirm: busy ? "Confirming…" : "Confirm and sign in",
    forgot: busy ? "Sending…" : "Email me a code",
    reset: busy ? "Saving…" : "Set new password and sign in",
    waitlisted: "",
  }[mode];
  const needsCode = mode === "reset" || mode === "confirm";
  const ready = email && (mode === "forgot" || (password && (!needsCode || code) && (mode !== "sign-up" || agreed)));

  return (
    <div className="account">
      {mode === "reset" ? (
        <p className="account-intro">
          If <strong>{email}</strong> has an Axiom account, we've emailed it a code. It works for 30 minutes. Check your spam folder if
          it hasn't arrived.
        </p>
      ) : mode === "confirm" ? (
        <p className="account-intro">
          To check <strong>{email}</strong> is yours, we've emailed it a code. Enter it here to finish. It works for 30 minutes; check your
          spam folder if it hasn't arrived.
        </p>
      ) : (
        <p className="account-intro">
          {INTRO[mode]}
          {mode !== "forgot" && " Axiom works fully without one, and your data stays on this computer either way."}
        </p>
      )}

      <form className="account-form" onSubmit={submit} noValidate>
        {!needsCode && (
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              spellCheck={false}
              autoFocus
              disabled={busy}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </label>
        )}
        {needsCode && (
          <label className="field">
            <span className="field-label">Code</span>
            <input
              className="code-input"
              value={code}
              autoComplete="one-time-code"
              spellCheck={false}
              autoFocus
              maxLength={12}
              placeholder="XXXX-XXXX"
              disabled={busy}
              onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
          </label>
        )}
        {mode !== "forgot" && mode !== "confirm" && (
          <PasswordField
            label={mode === "reset" ? "New password" : "Password"}
            value={password}
            onChange={setPassword}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            disabled={busy}
            hint={mode === "sign-in" ? undefined : "At least 8 characters."}
          />
        )}
        {mode === "sign-up" && (
          <label className="agree">
            <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.currentTarget.checked)} />
            <span>
              I'm 13 or older, and I agree to the <PageLink page="terms">terms of use</PageLink> and have read the{" "}
              <PageLink page="privacy">privacy notice</PageLink>.
            </span>
          </label>
        )}

        <ErrorNote error={error} />
        <button className="btn account-submit" type="submit" disabled={busy || !ready}>
          {submitLabel}
        </button>
        <SlowHint busy={busy} />
      </form>

      <div className="account-links">
        {mode === "sign-in" && (
          <>
            <button className="link" onClick={() => switchTo("forgot")} disabled={busy}>
              Forgot password?
            </button>
            <p className="account-switch">
              New to Axiom?{" "}
              <button className="link" onClick={() => switchTo("sign-up")} disabled={busy}>
                Create an account
              </button>
            </p>
          </>
        )}
        {mode === "sign-up" && (
          <p className="account-switch">
            Already have an account?{" "}
            <button className="link" onClick={() => switchTo("sign-in")} disabled={busy}>
              Sign in
            </button>
          </p>
        )}
        {needsCode && (
          <button className="link" onClick={() => void run(() => (mode === "reset" ? requestReset(email) : sendConfirmation(email)))} disabled={busy}>
            Send a new code
          </button>
        )}
        {(mode === "forgot" || needsCode) && (
          <button className="link" onClick={() => switchTo("sign-in")} disabled={busy}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
