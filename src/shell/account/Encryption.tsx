import { useState, type FormEvent } from "react";
import { Copy, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { recoverVault, recoveryCode, startOverVault, unlockVault, useVaultStatus } from "../../lib/vault";
import { ConfirmButton } from "../ui/ConfirmButton";
import { useAccount } from "../useAccount";
import { Modal } from "../ui/Modal";
import { ErrorNote, PasswordField, useAction } from "./fields";

/** The Account panel's Encryption card: whether this computer can read
 * encrypted data, the recovery code, and unlocking. */
export function Encryption() {
  const status = useVaultStatus();
  const [dialog, setDialog] = useState<"unlock" | "code" | null>(null);
  if (!status) return null;
  return (
    <>
      {status === "unlocked" ? (
        <>
          <p className="field-hint enc-line">
            <ShieldCheck size={14} strokeWidth={1.75} /> Your finances are end-to-end encrypted. Only your devices can read them, never the server.
          </p>
          <button className="btn btn-sm btn-ghost" onClick={() => setDialog("code")}>
            Show recovery code
          </button>
        </>
      ) : (
        <>
          <p className="field-hint enc-line is-locked">
            <LockKeyhole size={14} strokeWidth={1.75} />
            {status === "needs_recovery"
              ? "Your password was reset, so this computer needs your recovery code to read your encrypted finances."
              : "Enter your password once to sync your encrypted finances on this computer."}
          </p>
          <button className="btn btn-sm" onClick={() => setDialog("unlock")}>
            Unlock
          </button>
        </>
      )}
      {dialog === "unlock" && <UnlockDialog recovery={status === "needs_recovery"} onClose={() => setDialog(null)} />}
      {dialog === "code" && <RecoveryCodeDialog onClose={() => setDialog(null)} />}
    </>
  );
}

/** While signed in but locked, encrypted data stays on this computer: a
 * banner for the extensions that keep it, saying so. `subject` is plural
 * ("finances", "journal entries"). */
export function VaultLockBanner({ subject }: { subject: string }) {
  const [account] = useAccount();
  const status = useVaultStatus();
  const [open, setOpen] = useState(false);
  if (account?.state !== "signed_in" || !status || status === "unlocked") return null;
  return (
    <div className="vault-lock">
      <LockKeyhole size={16} strokeWidth={1.75} />
      <span>
        <b>Your {subject} aren&apos;t syncing on this computer yet.</b>{" "}
        {status === "needs_recovery" ? "Your password was reset: enter your recovery code to unlock them." : "They're end-to-end encrypted: enter your password once to unlock them here."}
      </span>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        Unlock
      </button>
      {open && <UnlockDialog recovery={status === "needs_recovery"} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Unlocks encrypted data: with the password, the recovery code, or (when both
 * are lost) by starting over with this computer's data. */
export function UnlockDialog({ recovery, onClose }: { recovery: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"password" | "recovery">(recovery ? "recovery" : "password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const done = await run(() => (mode === "password" ? unlockVault(password) : recoverVault(code, password)));
    if (done) onClose();
  };

  return (
    <Modal title="Unlock encrypted data" icon={<LockKeyhole size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="enc-form" onSubmit={submit}>
        <p className="dim">
          {mode === "password"
            ? "Your finances are encrypted with a key only your devices hold. Your password unlocks it on this computer."
            : "Enter the recovery code you saved when encryption was set up, and your current password."}
        </p>
        {mode === "recovery" && (
          <label className="field">
            <span className="field-label">Recovery code</span>
            <input className="code-input" value={code} autoFocus spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={(e) => setCode(e.currentTarget.value)} />
          </label>
        )}
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />
        <ErrorNote error={error} />
        <div className="enc-actions">
          <button className="btn" type="submit" disabled={busy || !password || (mode === "recovery" && !code)}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
          <button type="button" className="link" onClick={() => setMode(mode === "password" ? "recovery" : "password")}>
            {mode === "password" ? "Use the recovery code instead" : "Use just the password"}
          </button>
        </div>
        {mode === "recovery" && (
          <div className="enc-start-over">
            <p className="field-hint">Lost the recovery code too? You can start over: the finances on this computer become your account's, and other computers need the new code.</p>
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Replace the account's encrypted data? Click again"
              onConfirm={() => void run(() => startOverVault(password)).then((done) => done && onClose())}
            >
              Start over with this computer's data
            </ConfirmButton>
          </div>
        )}
      </form>
    </Modal>
  );
}

function RecoveryCodeDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = await run(() => recoveryCode(password));
    if (found) setCode(found);
  };

  return (
    <Modal title="Recovery code" icon={<KeyRound size={16} strokeWidth={1.75} />} onClose={onClose}>
      {code ? (
        <div className="enc-form">
          <p>If you ever reset your password, this code is the only way to read your encrypted finances again. Write it down or keep it in a password manager.</p>
          <div className="enc-code" aria-label="Recovery code">
            {code}
          </div>
          <div className="enc-actions">
            <button
              className="btn btn-sm"
              onClick={() =>
                void navigator.clipboard.writeText(code).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              <Copy size={14} strokeWidth={1.75} /> {copied ? "Copied" : "Copy"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="enc-form" onSubmit={submit}>
          <p className="dim">Confirm your password to see your recovery code.</p>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />
          <ErrorNote error={error} />
          <div className="enc-actions">
            <button className="btn" type="submit" disabled={busy || !password}>
              {busy ? "Checking…" : "Show code"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
