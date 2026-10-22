import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Users, X } from "lucide-react";
import { useAccount } from "../../shell/useAccount";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { errorMessage } from "./api";
import { atLeast, ROLES, roleLabel, sharing, sharingChanged, type Members, type Role, type SharedBoard } from "./sharing";

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  /** After a change that affects the project list (leaving, stopping sharing). */
  onChanged: () => void;
}

/** Sharing one board: who's on it, their roles, invitations, and leaving. */
export function ShareDialog({ projectId, projectName, onClose, onChanged }: ShareDialogProps) {
  const [account] = useAccount();
  const [board, setBoard] = useState<SharedBoard | null | undefined>(undefined);
  const [people, setPeople] = useState<Members | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const found = (await sharing.boards()).find((b) => b.id === projectId) ?? null;
      setBoard(found);
      setPeople(found ? await sharing.members(projectId) : null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [projectId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Runs a change, then reads everything again. Returns whether it worked. */
  const run = async (change: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      after?.();
      sharingChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
      await load();
    }
  };

  const signedIn = account?.state === "signed_in";
  const role = board?.role;
  const admin = !!role && atLeast(role, "admin");

  return (
    <div className="pb-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="pb-dialog" role="dialog" aria-label={`Share ${projectName}`}>
        <header className="pb-dialog-head">
          <Users size={16} strokeWidth={1.75} />
          <h2>Share “{projectName}”</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="pb-dialog-body">
          {error && <p className="pb-dialog-error">{error}</p>}

          {!signedIn ? (
            <p className="dim">
              Sign in to share boards: open the Account panel (the person icon at the bottom left) and sign in, or create an account. Then the
              people you invite can work on this board with you.
            </p>
          ) : board === undefined ? (
            <p className="dim">Loading…</p>
          ) : board === null ? (
            <>
              <p>Invite people to work on this board with you. You choose what each person can do:</p>
              <RoleList />
              <p className="dim">The board moves to your shared space, so everyone on it sees changes as they happen. Your other projects stay private.</p>
              <button className="btn" disabled={busy} onClick={() => run(() => sharing.share(projectId))}>
                {busy ? "Sharing…" : "Share this board"}
              </button>
            </>
          ) : (
            <>
              <p className="dim pb-share-who">
                {role === "owner" ? "You shared this board." : `Shared by ${board.ownerEmail}.`} You're {role === "admin" || role === "owner" ? "an" : "a"}{" "}
                <b>{roleLabel(role!)}</b>: {ROLES.find((r) => r.id === role)?.can.toLowerCase()}
              </p>

              {admin && <InviteForm owner={role === "owner"} busy={busy} onInvite={(email, r) => run(() => sharing.invite(projectId, email, r))} />}

              <h3 className="pb-dialog-heading">People</h3>
              <ul className="pb-people">
                {people?.members.map((m) => {
                  const canManage = !m.you && m.role !== "owner" && (role === "owner" || (role === "admin" && m.role !== "admin"));
                  return (
                    <li key={m.userId}>
                      <span className="pb-person">
                        {m.email}
                        {m.you && <span className="dim"> (you)</span>}
                      </span>
                      {canManage ? (
                        <>
                          <select
                            aria-label={`${m.email}'s role`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => run(() => sharing.setRole(projectId, m.userId, e.currentTarget.value as Role))}
                          >
                            {ROLES.filter((r) => r.id !== "owner" && (r.id !== "admin" || role === "owner")).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Remove?" onConfirm={() => run(() => sharing.remove(projectId, m.userId))}>
                            Remove
                          </ConfirmButton>
                        </>
                      ) : (
                        <span className="pb-role">{roleLabel(m.role)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {admin && !!people?.invites.length && (
                <>
                  <h3 className="pb-dialog-heading">Invited</h3>
                  <ul className="pb-people">
                    {people.invites.map((i) => (
                      <li key={i.id}>
                        <span className="pb-person">
                          {i.email}
                          <span className="dim"> · waiting · expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                        </span>
                        <span className="pb-role">{roleLabel(i.role)}</span>
                        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => sharing.withdraw(projectId, i.id))}>
                          Withdraw
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <footer className="pb-dialog-foot">
                {role === "owner" ? (
                  <ConfirmButton
                    className="btn btn-sm btn-ghost is-danger"
                    confirmText="Everyone else loses it. Click again"
                    onConfirm={() => run(() => sharing.stopSharing(projectId), onChanged)}
                  >
                    Stop sharing
                  </ConfirmButton>
                ) : (
                  <ConfirmButton
                    className="btn btn-sm btn-ghost is-danger"
                    confirmText="It leaves this computer. Click again"
                    onConfirm={async () => {
                      if (await run(() => sharing.leave(projectId), onChanged)) onClose();
                    }}
                  >
                    Leave board
                  </ConfirmButton>
                )}
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function RoleList() {
  return (
    <ul className="pb-roles">
      {ROLES.filter((r) => r.id !== "owner").map((r) => (
        <li key={r.id}>
          <b>{r.label}</b> {r.can}
        </li>
      ))}
    </ul>
  );
}

function InviteForm({ owner, busy, onInvite }: { owner: boolean; busy: boolean; onInvite: (email: string, role: Role) => Promise<boolean> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await onInvite(email, role)) setEmail("");
  };
  return (
    <form className="pb-invite" onSubmit={submit}>
      <h3 className="pb-dialog-heading">Invite someone</h3>
      <div className="pb-invite-row">
        <input type="email" value={email} placeholder="Their email address" aria-label="Email address" onChange={(e) => setEmail(e.currentTarget.value)} />
        <select value={role} aria-label="Role" onChange={(e) => setRole(e.currentTarget.value as Role)}>
          {ROLES.filter((r) => r.id !== "owner" && (r.id !== "admin" || owner)).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={busy || !email.trim()}>
          Invite
        </button>
      </div>
      <p className="dim pb-invite-hint">
        {ROLES.find((r) => r.id === role)?.can} They'll get an email, and the invitation waits in their Project Board side panel. If they don't have an Axiom
        account yet, they create one with this email.
      </p>
    </form>
  );
}
