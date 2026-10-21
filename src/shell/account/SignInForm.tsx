import { useState, type FormEvent } from "react";
import { requestReset, resetPassword, signIn, signUp, type AccountStatus } from "../../lib/account";
import { ErrorNote, PasswordField, SlowHint, useAction } from "./fields";

/** Sign in, create an account, or reset a forgotten password (ask for a code, then use it). */
type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const INTRO: Record<Mode, string> = {
  "sign-in": "Sign in to sync your boards between your computers.",
  "sign-up": "An account lets Axiom sync your boards between your computers.",
  forgot: "Enter your account's email and we'll send you a code to choose a new password.",
  reset: "",
};

export function SignInForm({ onDone }: { onDone: (status: AccountStatus) => void }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
    const status = await run(() =>
      mode === "sign-up"
        ? signUp(email, password)
        : mode === "reset"
          ? resetPassword(email, code, password)
          : signIn(email, password),
    );
    if (status) onDone(status);
  }

  const submitLabel = {
    "sign-in": busy ? "Signing in…" : "Sign in",
    "sign-up": busy ? "Creating account…" : "Create account",
    forgot: busy ? "Sending…" : "Email me a code",
    reset: busy ? "Saving…" : "Set new password and sign in",
  }[mode];
  const ready = email && (mode === "forgot" || (password && (mode !== "reset" || code)));

  return (
    <div className="account">
      {mode === "reset" ? (
        <p className="account-intro">
          If <strong>{email}</strong> has an Axiom account, we've emailed it a code. It works for 30 minutes. Check your spam folder if
          it hasn't arrived.
        </p>
      ) : (
        <p className="account-intro">
          {INTRO[mode]}
          {mode !== "forgot" && " Axiom works fully without one, and your data stays on this computer either way."}
        </p>
      )}

      <form className="account-form" onSubmit={submit} noValidate>
        {mode !== "reset" && (
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
        {mode === "reset" && (
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
        {mode !== "forgot" && (
          <PasswordField
            label={mode === "reset" ? "New password" : "Password"}
            value={password}
            onChange={setPassword}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            disabled={busy}
            hint={mode === "sign-in" ? undefined : "At least 8 characters."}
          />
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
        {mode === "reset" && (
          <button className="link" onClick={() => void run(() => requestReset(email))} disabled={busy}>
            Send a new code
          </button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button className="link" onClick={() => switchTo("sign-in")} disabled={busy}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
