// What Finance shows, shared by its view, side panel and overview tile: the
// page, the month, the transaction filters and any open dialog.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useDataChanged, useTauriEvent } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type FinanceState, type Transaction } from "./api";
import { monthOf } from "./money";

export type FinancePage = "overview" | "transactions" | "accounts" | "recurring" | "categories";

export const PAGES: FinancePage[] = ["overview", "transactions", "accounts", "recurring", "categories"];

export type FinanceDialog =
  | { kind: "transaction"; transaction: Transaction | null; accountId?: string }
  | { kind: "account"; id: string | null }
  | { kind: "recurring"; id: string | null }
  | { kind: "category"; id: string | null; categoryKind?: "expense" | "income" }
  | { kind: "import"; accountId?: string }
  | null;

interface FinanceUi {
  page: FinancePage;
  month: string;
  /** Transactions shown: one account, one category ("none" = uncategorised), a search. */
  accountId: string | null;
  categoryId: string | null;
  search: string;
  dialog: FinanceDialog;
  /** Bumped after any change here, so everything showing money re-reads. */
  revision: number;
}

const PAGE_KEY = "axiom.finance.page";

function savedPage(): FinancePage {
  try {
    return PAGES.find((p) => p === localStorage.getItem(PAGE_KEY)) ?? "overview";
  } catch {
    return "overview";
  }
}

let state: FinanceUi = { page: savedPage(), month: monthOf(today()), accountId: null, categoryId: null, search: "", dialog: null, revision: 0 };
const listeners = new Set<() => void>();

export function setFinanceUi(change: Partial<FinanceUi>) {
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

export const financeChanged = () => setFinanceUi({ revision: state.revision + 1 });

export function useFinanceUi(): FinanceUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Accounts, categories, recurring items and settings, kept current. */
export function useFinanceState(): { data: FinanceState | null; error: string | null; reload: () => void } {
  const { revision } = useFinanceUi();
  const [data, setData] = useState<FinanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api.state(today()).then(
      (s) => {
        setData(s);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(reload, [reload, revision]);
  useDataChanged(reload);
  useTauriEvent("vault-changed", reload);
  return { data, error, reload };
}
