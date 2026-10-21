import { useState, type FormEvent } from "react";
import { changePassword } from "../../lib/account";
import { ErrorNote, PasswordField, useAction } from "./fields";

/** "Change password", opening into a small form. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { busy, error, setError, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await run(() => changePassword(current, next).then(() => true))) !== true) return;
    setOpen(false);
    setDone(true);
    setCurrent("");
    setNext("");
  }

  if (!open) {
    return (
      <>
        {done && <p className="field-hint">Password changed. Your other devices have been signed out.</p>}
        <button className="btn btn-sm btn-ghost" onClick={() => (setOpen(true), setDone(false))}>
          Change password
        </button>
      </>
    );
  }

  return (
    <form className="account-form account-subform" onSubmit={submit} noValidate>
      <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus disabled={busy} />
      <PasswordField
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={busy}
        hint="At least 8 characters. Your other devices will be signed out."
      />
      <ErrorNote error={error} />
      <div className="row">
        <button className="btn btn-sm" type="submit" disabled={busy || !current || !next}>
          {busy ? "Saving…" : "Save password"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => (setOpen(false), setError(null))} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
