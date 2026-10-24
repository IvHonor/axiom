import { FileUp, LayoutGrid, ListOrdered, PiggyBank, Repeat, Wallet } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { setFinanceUi, useFinanceState, useFinanceUi, type FinancePage } from "./financeUi";
import { money } from "./money";
import { dot } from "./parts";

/** Finance's side panel: its pages, and every account with its balance. */
export function FinanceSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useFinanceUi();
  const { data } = useFinanceState();
  const go = (page: FinancePage, change: Parameters<typeof setFinanceUi>[0] = {}) => {
    setFinanceUi({ page, ...change });
    onOpen();
  };
  const nav = (page: FinancePage, label: string, Icon: typeof Wallet) => (
    <button key={page} className={`nav-item${active && ui.page === page ? " is-active" : ""}`} onClick={() => go(page)}>
      <Icon size={14} strokeWidth={1.5} />
      <span className="bs-name">{label}</span>
    </button>
  );
  const home = data?.settings?.homeCurrency;
  const open = data?.accounts.filter((a) => !a.archived) ?? [];

  return (
    <>
      <Section title="Finance">
        {nav("overview", "Overview", LayoutGrid)}
        {nav("transactions", "Transactions", ListOrdered)}
        {nav("accounts", "Accounts", Wallet)}
        {nav("recurring", "Recurring", Repeat)}
        {nav("categories", "Budgets", PiggyBank)}
        <button
          className="nav-item"
          onClick={() => {
            setFinanceUi({ dialog: { kind: "import" } });
            onOpen();
          }}
        >
          <FileUp size={14} strokeWidth={1.5} />
          <span className="bs-name">Import a statement</span>
        </button>
      </Section>
      {home && open.length > 0 && (
        <Section title="Accounts" count={open.length}>
          <div className="fs-accounts">
            {open.map((a) => (
              <button key={a.id} className="fs-account" onClick={() => go("transactions", { accountId: a.id, categoryId: null })}>
                <span className="fs-dot" style={dot(a.color)} />
                <span className="fs-name">{a.name}</span>
                <span className={`fs-balance${a.balance < 0 ? " fin-over" : ""}`}>{money(a.balance, a.currency)}</span>
              </button>
            ))}
            <div className="fs-total">
              <span className="dim">Net worth</span>
              <b>{money(open.reduce((s, a) => s + (a.balanceHome ?? 0), 0), home)}</b>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
