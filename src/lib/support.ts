// Writing to support, and the admin panel's tickets, wrapping the commands in
// src-tauri/src/account/commands.rs.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `axiom_protocol::TICKET_KINDS`. */
export const TICKET_KINDS = [
  { id: "question", label: "A question" },
  { id: "bug", label: "Something's broken" },
  { id: "idea", label: "An idea" },
  { id: "account", label: "My account" },
  { id: "other", label: "Something else" },
] as const;

export type TicketKind = (typeof TICKET_KINDS)[number]["id"];

/** Mirrors `TicketView` in src-tauri/src/account/mod.rs. Times are ISO strings. */
export interface Ticket {
  id: string;
  reference: string;
  email: string;
  /** Sent while signed in, so the address is confirmed. */
  signedIn: boolean;
  kind: TicketKind;
  subject: string;
  message: string;
  appVersion: string;
  createdAt: string;
  /** Null while open. */
  solvedAt: string | null;
}

/** Sends a message to support; resolves to the reference to quote. `email` is only used when signed out. */
export const sendSupport = (kind: TicketKind, subject: string, message: string, email: string | null) =>
  invoke<string>("support_send", { kind, subject, message, email });

// For admins.
export const adminTickets = () => invoke<Ticket[]>("account_admin_tickets");
export const setTicketSolved = (id: string, solved: boolean) => invoke<Ticket>("account_admin_ticket_solved", { id, solved });

export const kindLabel = (kind: string) => TICKET_KINDS.find((k) => k.id === kind)?.label ?? kind;
