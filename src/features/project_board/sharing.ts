// Sharing boards with other accounts. Mirrors src-tauri/src/sync/sharing.rs;
// the server checks every permission, these calls just ask.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Role = "owner" | "admin" | "editor" | "viewer";

/** A board shared with you (or by you), as this computer knows it. */
export interface SharedBoard {
  id: string;
  role: Role;
  name: string;
  ownerEmail: string;
  members: number;
}

export interface Member {
  userId: string;
  email: string;
  role: Role;
  joinedAt: string;
  you: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface Members {
  members: Member[];
  /** Only filled in for admins. */
  invites: Invite[];
}

/** An invitation waiting for you. */
export interface MyInvite {
  id: string;
  boardId: string;
  boardName: string;
  role: Role;
  invitedBy: string;
  expiresAt: string;
}

export const sharing = {
  boards: () => invoke<SharedBoard[]>("board_shared_boards"),
  share: (projectId: string) => invoke<SharedBoard>("board_share", { projectId }),
  stopSharing: (projectId: string) => invoke<void>("board_stop_sharing", { projectId }),
  leave: (projectId: string) => invoke<void>("board_leave", { projectId }),
  members: (projectId: string) => invoke<Members>("board_members", { projectId }),
  invite: (projectId: string, email: string, role: Role) => invoke<Invite>("board_invite", { projectId, email, role }),
  withdraw: (projectId: string, inviteId: string) => invoke<void>("board_withdraw_invite", { projectId, inviteId }),
  setRole: (projectId: string, userId: string, role: Role) => invoke<void>("board_set_role", { projectId, userId, role }),
  remove: (projectId: string, userId: string) => invoke<void>("board_remove_member", { projectId, userId }),
  invitations: () => invoke<MyInvite[]>("board_invitations"),
  accept: (inviteId: string) => invoke<SharedBoard>("board_accept_invite", { inviteId }),
  decline: (inviteId: string) => invoke<void>("board_decline_invite", { inviteId }),
};

export const ROLES: { id: Role; label: string; can: string }[] = [
  { id: "viewer", label: "Viewer", can: "Sees the board but can't change it." },
  { id: "editor", label: "Editor", can: "Adds, edits, moves and completes cards." },
  { id: "admin", label: "Admin", can: "Also changes columns, labels and templates, and invites and removes people." },
  { id: "owner", label: "Owner", can: "Everything, including making admins and stopping sharing." },
];

export const roleLabel = (role: Role) => ROLES.find((r) => r.id === role)?.label ?? role;
const rank = (role: Role) => ROLES.findIndex((r) => r.id === role);
/** Whether `role` can do what `needed` can. */
export const atLeast = (role: Role, needed: Role) => rank(role) >= rank(needed);

// ---------- Which sharing dialog is open, from the side panel or the board ----------

interface SharingUi {
  /** The project whose "Share" dialog is open. */
  dialog: string | null;
  /** Bumped after sharing changes, so everything showing it re-reads. */
  revision: number;
}

let state: SharingUi = { dialog: null, revision: 0 };
const listeners = new Set<() => void>();

function set(change: Partial<SharingUi>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

export const openShareDialog = (projectId: string) => set({ dialog: projectId });
export const closeShareDialog = () => set({ dialog: null });
export const sharingChanged = () => set({ revision: state.revision + 1 });

export function useSharingUi(): SharingUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
