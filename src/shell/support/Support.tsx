import { useState, type FormEvent } from "react";
import { CircleCheck, LifeBuoy } from "lucide-react";
import { sendSupport, TICKET_KINDS, type TicketKind } from "../../lib/support";
import { ErrorNote, SlowHint, useAction } from "../account/fields";
import { Modal } from "../ui/Modal";
import { useAccount } from "../useAccount";

/** The top bar's support button, next to the bell. */
export function SupportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`bell-button${open ? " is-open" : ""}`} title="Help and support" aria-label="Help and support" onClick={() => setOpen(true)}>
        <LifeBuoy size={16} strokeWidth={1.75} />
      </button>
      {open && <SupportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Write to support: a question, a bug, an idea. Replies come by email. */
export function SupportDialog({ onClose }: { onClose: () => void }) {
  const [account] = useAccount();
  const signedIn = account?.state === "signed_in" ? account.email : null;
  const [kind, setKind] = useState<TicketKind>("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const reference = await run(() => sendSupport(kind, subject, message, signedIn ? null : email));
    if (reference) setSent(reference);
  };

  return (
    <Modal title="Help and support" icon={<LifeBuoy size={16} strokeWidth={1.75} />} onClose={onClose}>
      {sent ? (
        <div className="support-sent">
          <CircleCheck size={28} strokeWidth={1.5} />
          <p>
            <b>Thanks, it's on its way.</b> Your reference is <b>{sent}</b>.
          </p>
          <p className="dim">We'll reply to {signedIn ?? email} by email as soon as we can.</p>
          <button className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form className="account-form" onSubmit={submit} noValidate>
          <p className="dim modal-intro">Ask a question, tell us something's broken, or share an idea. We'll reply by email.</p>
          <label className="field">
            <span className="field-label">What's it about?</span>
            <select value={kind} disabled={busy} onChange={(e) => setKind(e.currentTarget.value as TicketKind)}>
              {TICKET_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Subject</span>
            <input value={subject} maxLength={120} autoFocus disabled={busy} onChange={(e) => setSubject(e.currentTarget.value)} />
          </label>
          <label className="field">
            <span className="field-label">Message</span>
            <textarea
              rows={7}
              value={message}
              maxLength={5000}
              disabled={busy}
              placeholder={kind === "bug" ? "What happened, and what did you expect? Steps to make it happen again help a lot." : undefined}
              onChange={(e) => setMessage(e.currentTarget.value)}
            />
          </label>
          {signedIn ? (
            <p className="field-hint">We'll reply to {signedIn}. Your Axiom version is included, to help us look into it.</p>
          ) : (
            <label className="field">
              <span className="field-label">Your email</span>
              <input type="email" value={email} autoComplete="email" spellCheck={false} disabled={busy} onChange={(e) => setEmail(e.currentTarget.value)} />
              <span className="field-hint">So we can reply. Your Axiom version is included, to help us look into it.</span>
            </label>
          )}
          <ErrorNote error={error} />
          <div className="row">
            <button className="btn btn-sm" type="submit" disabled={busy || !subject.trim() || !message.trim() || (!signedIn && !email.trim())}>
              {busy ? "Sending…" : "Send"}
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
          <SlowHint busy={busy} />
        </form>
      )}
    </Modal>
  );
}
