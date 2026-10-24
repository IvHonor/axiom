import { useState, type FormEvent } from "react";
import { FileUp, Plus, ShieldCheck } from "lucide-react";
import { VaultLockBanner } from "../../shell/account/Encryption";
import { useAccount } from "../../shell/useAccount";
import { today } from "../daily_plan/time";
import { ACCOUNT_KINDS, api, errorMessage, type AccountKind, type FinanceState } from "./api";
import { AccountDialog, CategoryDialog, RecurringDialog, TransactionDialog } from "./Dialogs";
import { financeChanged, PAGES, setFinanceUi, useFinanceState, useFinanceUi, type FinancePage } from "./financeUi";
import { ImportDialog } from "./ImportDialog";
import { currencies, localCurrency } from "./money";
import { Overview } from "./Overview";
import { Accounts, Categories, RecurringPage, Transactions } from "./Pages";
import { MoneyInput } from "./parts";
import { QuickAdd } from "./QuickAdd";

const LABELS: Record<FinancePage, string> = {
  overview: "Overview",
  transactions: "Transactions",
  accounts: "Accounts",
  recurring: "Recurring",
  categories: "Budgets",
};

/** Finance: income and spending, budgets, recurring bills, statement imports. */
export function FinanceView() {
  const ui = useFinanceUi();
  const { data, error } = useFinanceState();

  if (error) return <p className="fin-error fin-pad">{error}</p>;
  if (!data) return <p className="dim fin-pad">Loading…</p>;
  if (!data.settings) return <Setup />;

  return (
    <div className="fin-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Finance">
          {PAGES.map((p) => (
            <button key={p} className={`pb-tab${ui.page === p ? " is-active" : ""}`} onClick={() => setFinanceUi({ page: p })}>
              {LABELS[p]}
            </button>
          ))}
        </nav>
        <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ dialog: { kind: "import" } })}>
          <FileUp size={14} strokeWidth={1.75} /> Import
        </button>
        <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "transaction", transaction: null } })}>
          <Plus size={14} strokeWidth={1.75} /> Add
        </button>
      </header>
      <div className="fin-content">
        <VaultLockBanner subject="finances" />
        {(ui.page === "overview" || ui.page === "transactions") && <QuickAdd state={data} />}
        {ui.page === "overview" && <Overview state={data} />}
        {ui.page === "transactions" && <Transactions state={data} />}
        {ui.page === "accounts" && <Accounts state={data} />}
        {ui.page === "recurring" && <RecurringPage state={data} />}
        {ui.page === "categories" && <Categories state={data} />}
      </div>
      <Dialogs state={data} />
    </div>
  );
}

function Dialogs({ state }: { state: FinanceState }) {
  const { dialog } = useFinanceUi();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "transaction":
      return <TransactionDialog key={dialog.transaction?.id ?? "new"} state={state} transaction={dialog.transaction} accountId={dialog.accountId} />;
    case "account":
      return <AccountDialog state={state} id={dialog.id} />;
    case "category":
      return <CategoryDialog state={state} id={dialog.id} categoryKind={dialog.categoryKind} />;
    case "recurring":
      return <RecurringDialog state={state} id={dialog.id} />;
    case "import":
      return <ImportDialog state={state} accountId={dialog.accountId} />;
  }
}

/** First visit: the home currency and a first account. */
function Setup() {
  const [home, setHome] = useState(localCurrency());
  const [name, setName] = useState("Current account");
  const [kind, setKind] = useState<AccountKind>("current");
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account] = useAccount();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const opening = (balance ?? 0) * (kind === "credit" ? -1 : 1);
      await api.setup(home, { name, kind, currency: home, openingBalance: opening, color: "blue" }, today());
      financeChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="fin-setup">
      <form className="fin-setup-card" onSubmit={submit}>
        <span className="fin-setup-icon">💷</span>
        <h1>Track your money, simply</h1>
        <p className="dim">
          Add what comes in and goes out, import statements from your bank or credit card, set budgets for what matters, and see where it all goes each month.
        </p>
        <label className="fin-field">
          <span className="fin-field-label">Your home currency</span>
          <select className="fin-select" value={home} onChange={(e) => setHome(e.currentTarget.value)}>
            {currencies().map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <small className="dim">Totals and budgets are in it. Accounts in other currencies convert at each day&apos;s rate.</small>
        </label>
        <div className="fin-pair">
          <label className="fin-field">
            <span className="fin-field-label">Your first account</span>
            <input className="fin-input" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          </label>
          <label className="fin-field">
            <span className="fin-field-label">Kind</span>
            <select className="fin-select" value={kind} onChange={(e) => setKind(e.currentTarget.value as AccountKind)}>
              {ACCOUNT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="fin-field">
          <span className="fin-field-label">{kind === "credit" ? "What you owe on it today" : "What's in it today"}</span>
          <MoneyInput value={balance} currency={home} onChange={setBalance} label="Balance today" />
        </label>
        {error && <p className="fin-error">{error}</p>}
        <button className="btn fin-setup-go" type="submit" disabled={busy || !name.trim()}>
          {busy ? "Setting up…" : "Start tracking"}
        </button>
        <p className="fin-setup-privacy">
          <ShieldCheck size={14} strokeWidth={1.75} />
          {account?.state === "signed_in"
            ? "Synced end-to-end encrypted: only your devices can read it, never the server."
            : "Kept on this computer. Sign in to sync it, end-to-end encrypted."}
        </p>
      </form>
    </div>
  );
}
