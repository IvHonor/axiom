// What University shows, shared by its view, side panel and overview tile:
// the page, the term picked, the open module and any open dialog.
import { useSyncExternalStore } from "react";

export type UniPage = "modules" | "behind" | "upcoming";

export const PAGES: UniPage[] = ["modules", "behind", "upcoming"];

export type UniDialog = { kind: "term"; id: string | null } | { kind: "module"; id: string | null } | null;

interface UniUi {
  page: UniPage;
  /** The term being looked at; null follows the current one. */
  term: string | null;
  /** The module whose page is open. */
  module: string | null;
  dialog: UniDialog;
  /** Bumped after any change here, so everything showing modules re-reads. */
  revision: number;
}

const PAGE_KEY = "axiom.uni.page";

function savedPage(): UniPage {
  try {
    const saved = localStorage.getItem(PAGE_KEY);
    return PAGES.find((p) => p === saved) ?? "modules";
  } catch {
    return "modules";
  }
}

let state: UniUi = { page: savedPage(), term: null, module: null, dialog: null, revision: 0 };
const listeners = new Set<() => void>();

export function setUniUi(change: Partial<UniUi>) {
  state = { ...state, ...change };
  if (change.page) {
    try {
      localStorage.setItem(PAGE_KEY, change.page);
    } catch {
      // Remembering the page is a nicety.
    }
  }
  listeners.forEach((listener) => listener());
}

export const openModule = (id: string) => setUniUi({ module: id });
export const showPage = (page: UniPage) => setUniUi({ page, module: null });
export const uniChanged = () => setUniUi({ revision: state.revision + 1 });

export function useUniUi(): UniUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
