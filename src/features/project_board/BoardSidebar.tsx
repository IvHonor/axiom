import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Check, Mail, UserPlus, Users, X } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { useDataChanged } from "../../lib/sync";
import { Section } from "../../shell/ui/Section";
import { useAccount } from "../../shell/useAccount";
import { api, errorMessage, type Project } from "./api";
import { openBoardTarget } from "./boardNavigation";
import { colorOf } from "./palette";
import { openShareDialog, roleLabel, sharing, sharingChanged, useSharingUi, type MyInvite, type SharedBoard } from "./sharing";

/** How often to look for new invitations while the panel is open. */
const INVITE_CHECK_MS = 2 * 60_000;

/** The Project Board's side panel: projects, who they're shared with, and invitations. */
export function BoardSidebar({ onOpen }: AreaSidebarProps) {
  const [account] = useAccount();
  const { revision } = useSharingUi();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [shared, setShared] = useState<SharedBoard[]>([]);
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const signedIn = account?.state === "signed_in";

  const load = useCallback(() => {
    api.listProjects().then(setProjects, () => setProjects([]));
    sharing.boards().then(setShared, () => setShared([]));
  }, []);
  const loadInvites = useCallback(() => {
    if (signedIn) sharing.invitations().then(setInvites, () => {});
    else setInvites([]);
  }, [signedIn]);

  useEffect(load, [load, revision]);
  useEffect(loadInvites, [loadInvites, revision]);
  useDataChanged(load);
  useEffect(() => {
    const timer = window.setInterval(loadInvites, INVITE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [loadInvites]);

  const open = (projectId: string) => {
    openBoardTarget(projectId);
    onOpen();
  };
  const share = (projectId: string) => {
    openBoardTarget(projectId);
    openShareDialog(projectId);
    onOpen();
  };
  const answer = async (invite: MyInvite, accept: boolean) => {
    setMessage(null);
    try {
      if (accept) {
        await sharing.accept(invite.id);
        setMessage(`You joined “${invite.boardName}”. Its cards arrive in a moment.`);
      } else {
        await sharing.decline(invite.id);
      }
      sharingChanged();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  return (
    <>
      {invites.length > 0 && (
        <Section title="Invitations" count={invites.length}>
          <ul className="bs-invites">
            {invites.map((i) => (
              <li key={i.id}>
                <Mail size={14} strokeWidth={1.75} className="bs-invite-icon" />
                <span className="bs-invite-text">
                  <b>{i.invitedBy}</b> invited you to <b>{i.boardName}</b> as {/^[aeiou]/i.test(roleLabel(i.role)) ? "an" : "a"} {roleLabel(i.role).toLowerCase()}.
                </span>
                <span className="bs-invite-actions">
                  <button className="btn btn-sm" onClick={() => answer(i, true)}>
                    <Check size={13} strokeWidth={2} /> Accept
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => answer(i, false)} aria-label={`Decline the invitation to ${i.boardName}`}>
                    <X size={13} strokeWidth={2} /> Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {message && <p className="bs-message">{message}</p>}

      <Section title="Projects" count={projects?.length}>
        {projects?.map((p) => {
          const board = shared.find((b) => b.id === p.id);
          return (
            <div key={p.id} className="bs-project">
              <button className="nav-item bs-project-name" onClick={() => open(p.id)} title={board ? `Shared by ${board.ownerEmail}` : undefined}>
                <span className="bs-dot" style={{ "--project": colorOf(p.color) } as CSSProperties} />
                <span className="bs-name">{p.name}</span>
                {board &&
                  (board.role === "owner" ? (
                    <span className="bs-shared" title={`Shared with ${board.members - 1} ${board.members === 2 ? "person" : "people"}`}>
                      <Users size={12} strokeWidth={1.75} /> {board.members}
                    </span>
                  ) : (
                    <span className="bs-role">{roleLabel(board.role)}</span>
                  ))}
              </button>
              <button
                className="icon-btn bs-share"
                title={board ? "People and permissions" : "Share this board"}
                aria-label={board ? `People and permissions for ${p.name}` : `Share ${p.name}`}
                onClick={() => share(p.id)}
              >
                {board ? <Users size={14} strokeWidth={1.75} /> : <UserPlus size={14} strokeWidth={1.75} />}
              </button>
            </div>
          );
        })}
        {projects?.length === 0 && <p className="bs-hint">No projects yet.</p>}
      </Section>

      {!signedIn && (
        <p className="bs-hint">Sign in from the Account icon (bottom left) to share boards with other people and get their invitations.</p>
      )}
    </>
  );
}
