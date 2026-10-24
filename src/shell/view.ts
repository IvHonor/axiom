import { findExtension } from "../extensions";

/** What the main panel is showing. Every view except the overview lives in a tab. */
export type View =
  | { kind: "overview" }
  | { kind: "extension"; id: string }
  | { kind: "extension-info"; id: string }
  /** The admin panel, for the server's admins. */
  | { kind: "admin" };

export const OVERVIEW: View = { kind: "overview" };
export const ADMIN: View = { kind: "admin" };

/** A stable string for a view, used as its tab key. */
export const viewKey = (view: View) => (view.kind === "overview" || view.kind === "admin" ? view.kind : `${view.kind}:${view.id}`);

export const sameView = (a: View, b: View) => viewKey(a) === viewKey(b);

/** Rebuilds a saved view, or null if it's malformed or its extension no longer exists. */
export function parseView(saved: unknown): View | null {
  const view = saved as View;
  if (view?.kind === "overview") return OVERVIEW;
  if (view?.kind === "admin") return ADMIN;
  if ((view?.kind === "extension" || view?.kind === "extension-info") && typeof view.id === "string") {
    return findExtension(view.id) ? { kind: view.kind, id: view.id } : null;
  }
  return null;
}
