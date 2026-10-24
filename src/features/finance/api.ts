// Typed wrappers for Finance's Tauri commands.
// Mirrors src-tauri/src/features/finance/{entities,types,import}.rs.
import { invoke } from "@tauri-apps/api/core";

export type AccountKind = "current" | "savings" | "credit" | "cash" | "other";
export type CategoryKind = "expense" | "income";
export type Every = "week" | "month" | "year";

export interface Settings {
  id: string;
  homeCurrency: string;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  /** Minor units. */
  openingBalance: number;
  color: string;
  position: number;
  archived: boolean;
}

export interface AccountCard extends Account {
  balance: number;
  /** In the home currency; null until the rate's known. */
  balanceHome: number | null;
  transactions: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  /** A month's budget, home currency minor units. */
  budget: number | null;
  position: number;
  archived: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  day: string;
  /** Minor units, negative = money out. */
  amount: number;
  payee: string;
  categoryId: string | null;
  notes: string;
  transferId: string | null;
  recurringId: string | null;
  importRef: string | null;
  homeAmount: number | null;
  createdAt: string;
}

export interface TransactionRow extends Transaction {
  currency: string;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  accountId: string;
  categoryId: string | null;
  every: Every;
  startsOn: string;
  endsOn: string | null;
}

export interface FinanceState {
  settings: Settings | null;
  accounts: AccountCard[];
  categories: Category[];
  recurring: Recurring[];
}

export interface Due {
  recurringId: string;
  name: string;
  day: string;
  amount: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
}

export interface CategorySpend {
  categoryId: string | null;
  total: number;
  budget: number | null;
  count: number;
}

export interface MonthSummary {
  month: string;
  homeCurrency: string;
  income: number;
  spending: number;
  budgeted: number | null;
  spendingByCategory: CategorySpend[];
  incomeByCategory: CategorySpend[];
  uncategorised: number;
  unconverted: number;
  due: Due[];
  trend: { month: string; income: number; spending: number }[];
  netWorth: number | null;
}

export interface QuickEntry {
  amount: number | null;
  currency: string;
  day: string;
  payee: string;
  categoryId: string | null;
  accountId: string | null;
}

export interface AccountFields {
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalance: number;
  color: string;
}

export interface CategoryFields {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  budget: number | null;
}

export interface TransactionFields {
  accountId: string;
  day: string;
  amount: number;
  payee: string;
  categoryId: string | null;
  notes: string;
  transferAccountId?: string | null;
  transferAmount?: number | null;
}

export interface RecurringFields {
  name: string;
  amount: number;
  accountId: string;
  categoryId: string | null;
  every: Every;
  startsOn: string;
  endsOn: string | null;
}

export interface TransactionFilter {
  month?: string | null;
  accountId?: string | null;
  /** A category id, or "none". */
  categoryId?: string | null;
  search?: string | null;
}

export interface Mapping {
  headerRow: number;
  date: number;
  dateFormat: string;
  description: number[];
  amount: number | null;
  debit: number | null;
  credit: number | null;
  decimalComma: boolean;
  invert: boolean;
  signature?: string;
}

export interface PreviewRow {
  importRef: string;
  day: string;
  amount: number;
  payee: string;
  notes: string;
  categoryId: string | null;
  /** "imported" before, or "entered" by hand (see `matches`). */
  duplicate: "imported" | "entered" | null;
  matches: string | null;
}

export interface ImportPreview {
  format: "csv" | "ofx" | "qif";
  currency: string | null;
  columns: string[];
  samples: string[][];
  mapping: Mapping | null;
  profile: string | null;
  rows: PreviewRow[];
  skipped: number;
}

export interface CommitRow {
  importRef: string;
  day: string;
  amount: number;
  payee: string;
  notes: string;
  categoryId: string | null;
  matches: string | null;
}

export const api = {
  state: (today: string) => invoke<FinanceState>("finance_state", { today }),
  setup: (homeCurrency: string, account: AccountFields, today: string) => invoke<FinanceState>("finance_setup", { homeCurrency, account, today }),
  setHomeCurrency: (code: string, today: string) => invoke<void>("finance_set_home_currency", { code, today }),
  convert: (today: string) => invoke<number>("finance_convert", { today }),
  addAccount: (fields: AccountFields) => invoke<Account>("finance_add_account", { fields }),
  updateAccount: (id: string, fields: AccountFields) => invoke<Account>("finance_update_account", { id, fields }),
  archiveAccount: (id: string, archived: boolean) => invoke<Account>("finance_archive_account", { id, archived }),
  deleteAccount: (id: string) => invoke<void>("finance_delete_account", { id }),
  addCategory: (fields: CategoryFields) => invoke<Category>("finance_add_category", { fields }),
  updateCategory: (id: string, fields: CategoryFields) => invoke<Category>("finance_update_category", { id, fields }),
  deleteCategory: (id: string) => invoke<void>("finance_delete_category", { id }),
  transactions: (filter: TransactionFilter) => invoke<TransactionRow[]>("finance_transactions", { filter }),
  addTransaction: (fields: TransactionFields) => invoke<Transaction[]>("finance_add_transaction", { fields }),
  updateTransaction: (id: string, fields: TransactionFields) => invoke<Transaction[]>("finance_update_transaction", { id, fields }),
  setCategory: (id: string, categoryId: string | null) => invoke<Transaction>("finance_set_category", { id, categoryId }),
  deleteTransaction: (id: string) => invoke<void>("finance_delete_transaction", { id }),
  quick: (text: string, today: string, monthFirst: boolean) => invoke<QuickEntry>("finance_quick", { text, today, monthFirst }),
  addRecurring: (fields: RecurringFields) => invoke<Recurring>("finance_add_recurring", { fields }),
  updateRecurring: (id: string, fields: RecurringFields) => invoke<Recurring>("finance_update_recurring", { id, fields }),
  deleteRecurring: (id: string) => invoke<void>("finance_delete_recurring", { id }),
  confirm: (id: string, day: string, amount: number | null) => invoke<Transaction>("finance_confirm", { id, day, amount }),
  skip: (id: string, day: string) => invoke<void>("finance_skip", { id, day }),
  month: (month: string, today: string) => invoke<MonthSummary>("finance_month", { month, today }),
  importPreview: (accountId: string, fileName: string, contents: string, mapping: Mapping | null) =>
    invoke<ImportPreview>("finance_import_preview", { accountId, fileName, contents, mapping }),
  importCommit: (accountId: string, rows: CommitRow[], fileName: string, contents: string | null, mapping: Mapping | null, bank: string | null, today: string) =>
    invoke<[number, number]>("finance_import_commit", { accountId, rows, fileName, contents, mapping, bank, today }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const ACCOUNT_KINDS: { id: AccountKind; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "savings", label: "Savings" },
  { id: "credit", label: "Credit card" },
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

export const COLORS: Record<string, string> = {
  blue: "#4f86f7",
  teal: "#2bb3a3",
  green: "#4caf50",
  lime: "#8bc34a",
  yellow: "#e8c13a",
  amber: "#e0a526",
  orange: "#ee7b30",
  red: "#e05252",
  pink: "#e06aa6",
  purple: "#9a6ce0",
  slate: "#7d8a99",
};
