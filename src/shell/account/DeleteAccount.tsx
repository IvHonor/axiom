import { useState, type FormEvent } from "react";
import { deleteAccount, type AccountStatus } from "../../lib/account";
import { ErrorNote, PasswordField, useAction } from "./fields";

/** Deletes the account after the password is re-entered and the button pressed twice. */
export function DeleteAccount({ onDeleted }: { onDeleted: (status: AccountStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [password, setPassword] = useState("");
  const { busy, error, setError, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!armed) return setArmed(true);
    setArmed(false);
    const status = await run(() => deleteAccount(password));
    if (status) onDeleted(status);
  }

  if (!open) {
    return (
      <button className="btn btn-sm btn-ghost is-danger" onClick={() => setOpen(true)}>
        Delete account…
      </button>
    );
  }

  return (
    <form className="account-choice account-danger" onSubmit={submit} noValidate>
      <p>
        This permanently deletes your account and everything synced to it from the server. Other computers will be signed out.
        The boards on this computer stay here.
      </p>
      <PasswordField
        label="Enter your password to confirm"
        value={password}
        onChange={(v) => (setPassword(v), setArmed(false))}
        autoComplete="current-password"
        autoFocus
        disabled={busy}
      />
      <ErrorNote error={error} />
      <button className={`btn btn-sm btn-ghost is-danger${armed ? " is-armed" : ""}`} type="submit" disabled={busy || !password}>
        {busy ? "Deleting…" : armed ? "Click again to delete forever" : "Delete my account"}
      </button>
      <button
        className="link"
        type="button"
        onClick={() => (setOpen(false), setArmed(false), setPassword(""), setError(null))}
        disabled={busy}
      >
        Cancel
      </button>
    </form>
  );
}
