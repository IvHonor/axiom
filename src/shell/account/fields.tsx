import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Runs an async action with a busy flag and the error message it failed with, if any. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(String(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="account-error" role="alert">
      {error}
    </p>
  );
}

/** After a few seconds of waiting, explains that a sleeping server is waking up. */
export function SlowHint({ busy }: { busy: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) return setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  return slow ? <p className="field-hint">The server is waking up. This can take up to a minute.</p> : null;
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
  hint?: string;
}

/** A password input with a show/hide toggle. */
export function PasswordField({ label, value, onChange, autoComplete, disabled, autoFocus, hint }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const toggle = shown ? "Hide password" : "Show password";
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type={shown ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <button type="button" className="field-icon" onClick={() => setShown(!shown)} title={toggle} aria-label={toggle}>
          {shown ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
        </button>
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
