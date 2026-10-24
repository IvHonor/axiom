import { useState, type FormEvent } from "react";
import { IDLE_CHOICES, setLock, turnOffLock, useLockStatus } from "../../lib/appLock";
import { ErrorNote, useAction } from "./fields";

/** The Account panel's PIN lock: turn it on, change it, or turn it off. */
export function AppLockSettings() {
  const status = useLockStatus();
  const [form, setForm] = useState<"set" | "change" | "off" | null>(null);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [idle, setIdle] = useState(5);
  const { busy, error, setError, run } = useAction();

  if (!status) return null;

  const open = (next: "set" | "change" | "off") => {
    setForm(next);
    setCurrent("");
    setPin("");
    setRepeat("");
    setIdle(status.enabled ? status.idleMinutes : 5);
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pin && pin !== repeat) return setError("The two PINs don't match.");
    const done = await run(() =>
      form === "off" ? turnOffLock(current) : setLock(form === "change" ? current : null, pin || null, idle),
    );
    if (done) setForm(null);
  }

  if (!form) {
    const when = IDLE_CHOICES.find((c) => c.minutes === status.idleMinutes);
    return (
      <>
        <p className="field-hint">
          {status.enabled
            ? `Axiom asks for your PIN when it opens${status.idleMinutes ? `, and ${when?.label.toLowerCase() ?? `after ${status.idleMinutes} minutes idle`}` : ""}.`
            : "Ask for a PIN when Axiom opens and after it's been idle, so nobody else at this computer can look through it. Forget it, and we'll email you a code."}
        </p>
        {status.enabled ? (
          <div className="row">
            <button className="btn btn-sm btn-ghost" onClick={() => open("change")}>
              Change
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => open("off")}>
              Turn off
            </button>
          </div>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => open("set")}>
            Set a PIN
          </button>
        )}
      </>
    );
  }

  const ready = form === "set" ? pin.length >= 4 && repeat : current.length >= 4 && (!pin || repeat);
  return (
    <form className="account-form account-subform" onSubmit={submit} noValidate>
      {form !== "set" && <PinField label="Current PIN" value={current} onChange={setCurrent} autoFocus disabled={busy} />}
      {form !== "off" && (
        <>
          <PinField
            label={form === "change" ? "New PIN (leave empty to keep it)" : "PIN"}
            value={pin}
            onChange={setPin}
            autoFocus={form === "set"}
            disabled={busy}
          />
          {(form === "set" || pin) && <PinField label="Repeat PIN" value={repeat} onChange={setRepeat} disabled={busy} />}
          <label className="field">
            <span className="field-label">Lock</span>
            <select value={idle} disabled={busy} onChange={(e) => setIdle(Number(e.currentTarget.value))}>
              {IDLE_CHOICES.map((c) => (
                <option key={c.minutes} value={c.minutes}>
                  {c.minutes ? `When Axiom opens, and ${c.label.toLowerCase()}` : c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">4 to 8 digits. This keeps people out of Axiom on this computer; it doesn&apos;t encrypt anything.</p>
        </>
      )}
      <ErrorNote error={error} />
      <div className="row">
        <button className="btn btn-sm" type="submit" disabled={busy || !ready}>
          {busy ? "Saving…" : form === "off" ? "Turn off" : "Save"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setForm(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PinField({ label, value, onChange, autoFocus, disabled }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value.replace(/\D/g, ""))}
      />
    </label>
  );
}
