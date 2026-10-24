import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, CreditCard, FileUp, Landmark, Pencil, PiggyBank, Plus, Repeat, Search, Wallet, Banknote } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { longDay, mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, type AccountCard, type FinanceState, type TransactionRow } from "./api";
import { financeChanged, setFinanceUi, useFinanceUi } from "./financeUi";
import { addMonths, money, monthName, monthOf } from "./money";
import { Amount, CategorySelect, dot } from "./parts";

// ---------- Transactions ----------

export function Transactions({ state }: { state: FinanceState }) {
  const { month, accountId, categoryId, search, revision } = useFinanceUi();
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allTime, setAllTime] = useState(false);

  const load = useCallback(() => {
    api.transactions({ month: allTime ? null : month, accountId, categoryId, search: search || null }).then(
      (r) => {
        setRows(r);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [month, accountId, categoryId, search, allTime]);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  const accountOf = (id: string) => state.accounts.find((a) => a.id === id);
  const byDay = new Map<string, TransactionRow[]>();
  for (const r of rows ?? []) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const recategorise = (id: string, category: string | null) => void api.setCategory(id, category).then(financeChanged, (e) => setError(errorMessage(e)));

  return (
    <div className="fin-page">
      <div className="fin-filters">
        <label className="fin-search">
          <Search size={14} strokeWidth={1.75} />
          <input value={search} placeholder="Search payees and notes" aria-label="Search" onChange={(e) => setFinanceUi({ search: e.currentTarget.value })} />
        </label>
        <select className="fin-select" value={allTime ? "all" : month} aria-label="Month" onChange={(e) => (e.currentTarget.value === "all" ? setAllTime(true) : (setAllTime(false), setFinanceUi({ month: e.currentTarget.value })))}>
          {Array.from({ length: 24 }, (_, i) => addMonths(monthOf(today()), -i)).map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
          <option value="all">All time</option>
        </select>
        <select className="fin-select" value={accountId ?? ""} aria-label="Account" onChange={(e) => setFinanceUi({ accountId: e.currentTarget.value || null })}>
          <option value="">All accounts</option>
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <CategorySelect categories={state.categories} value={categoryId === "none" ? null : categoryId} onChange={(id) => setFinanceUi({ categoryId: id })} emptyLabel="All categories" label="Category filter" />
        <button className={`btn btn-sm${categoryId === "none" ? "" : " btn-ghost"}`} onClick={() => setFinanceUi({ categoryId: categoryId === "none" ? null : "none" })}>
          Uncategorised
        </button>
      </div>
      {error && <p className="fin-error">{error}</p>}
      {!rows ? (
        <p className="dim">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="fin-empty">
          <Wallet size={26} strokeWidth={1.25} />
          <p>No transactions {search || accountId || categoryId ? "match" : allTime ? "yet" : `in ${monthName(month)}`}.</p>
          <div className="fin-empty-actions">
            <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "transaction", transaction: null } })}>
              <Plus size={14} strokeWidth={1.75} /> Add one
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ dialog: { kind: "import", accountId: accountId ?? undefined } })}>
              <FileUp size={14} strokeWidth={1.75} /> Import a statement
            </button>
          </div>
        </div>
      ) : (
        <div className="fin-days">
          {[...byDay.entries()].map(([day, list]) => {
            const total = list.filter((t) => !t.transferId && t.homeAmount !== null).reduce((sum, t) => sum + (t.homeAmount ?? 0), 0);
            return (
              <section key={day} className="fin-day">
                <h3 className="fin-day-head">
                  <span>{day === today() ? "Today" : longDay(day)}</span>
                  <span className="dim">{money(total, state.settings!.homeCurrency, { sign: true })}</span>
                </h3>
                <ul className="fin-list">
                  {list.map((t) => {
                    const account = accountOf(t.accountId);
                    const cat = state.categories.find((c) => c.id === t.categoryId);
                    return (
                      <li key={t.id} className="fin-row">
                        <span className="fin-icon fin-row-icon" style={cat ? { background: `${dot(cat.color).background}22` } : undefined}>
                          {t.transferId ? "⇄" : (cat?.icon ?? "❔")}
                        </span>
                        <button className="fin-row-main" onClick={() => setFinanceUi({ dialog: { kind: "transaction", transaction: t } })}>
                          <span className="fin-row-payee">{t.payee || "—"}</span>
                          <span className="fin-row-meta dim">
                            {account?.name}
                            {t.notes && ` · ${t.notes}`}
                            {t.importRef && " · imported"}
                          </span>
                        </button>
                        {t.transferId ? (
                          <span className="dim fin-small fin-row-category">Transfer</span>
                        ) : (
                          <CategorySelect
                            categories={state.categories}
                            value={t.categoryId}
                            onChange={(id) => recategorise(t.id, id)}
                            kind={t.amount > 0 ? "income" : "expense"}
                            className={`fin-select fin-select-sm fin-row-category${t.categoryId ? "" : " is-empty"}`}
                          />
                        )}
                        <span className="fin-row-amount">
                          <Amount minor={t.amount} currency={t.currency} />
                          {t.currency !== state.settings!.homeCurrency && t.homeAmount !== null && <span className="dim fin-small">{money(t.homeAmount, state.settings!.homeCurrency)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Accounts ----------

const KIND_ICON = { current: Landmark, savings: PiggyBank, credit: CreditCard, cash: Banknote, other: Wallet };

export function Accounts({ state }: { state: FinanceState }) {
  const home = state.settings!.homeCurrency;
  const open = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived);
  const total = open.reduce((sum, a) => sum + (a.balanceHome ?? 0), 0);
  return (
    <div className="fin-page">
      <div className="fin-page-head">
        <div>
          <span className="fin-total-label">Net worth</span>
          <h2 className="fin-big">{money(total, home)}</h2>
        </div>
        <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "account", id: null } })}>
          <Plus size={14} strokeWidth={1.75} /> Add an account
        </button>
      </div>
      <ul className="fin-accounts">
        {open.map((a) => (
          <AccountTile key={a.id} account={a} home={home} />
        ))}
      </ul>
      {archived.length > 0 && (
        <>
          <h3 className="fin-section-title">Archived</h3>
          <ul className="fin-accounts is-archived">
            {archived.map((a) => (
              <AccountTile key={a.id} account={a} home={home} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AccountTile({ account: a, home }: { account: AccountCard; home: string }) {
  const Icon = KIND_ICON[a.kind];
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="fin-account" style={{ ["--account" as string]: dot(a.color).background }}>
      <header>
        <span className="fin-account-icon">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="fin-account-name">
          <b>{a.name}</b>
          <span className="dim fin-small">
            {a.kind === "credit" ? "Credit card" : a.kind[0].toUpperCase() + a.kind.slice(1)} · {a.currency}
          </span>
        </span>
        <button className="icon-btn" aria-label={`Edit ${a.name}`} onClick={() => setFinanceUi({ dialog: { kind: "account", id: a.id } })}>
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </header>
      <div className="fin-account-balance">
        <span className={`fin-big${a.balance < 0 ? " fin-over" : ""}`}>{money(a.balance, a.currency)}</span>
        {a.currency !== home && a.balanceHome !== null && <span className="dim fin-small">≈ {money(a.balanceHome, home)}</span>}
        {a.kind === "credit" && a.balance < 0 && <span className="dim fin-small">owed</span>}
      </div>
      <footer>
        <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ page: "transactions", accountId: a.id, categoryId: null })}>
          {a.transactions} transaction{a.transactions === 1 ? "" : "s"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ dialog: { kind: "import", accountId: a.id } })}>
          <FileUp size={13} strokeWidth={1.75} /> Import
        </button>
        <button
          className="icon-btn"
          title={a.archived ? "Bring back" : "Archive (hide it, keep its history)"}
          aria-label={a.archived ? "Unarchive" : "Archive"}
          onClick={() => void api.archiveAccount(a.id, !a.archived).then(financeChanged, (e) => setError(errorMessage(e)))}
        >
          {a.archived ? <ArchiveRestore size={14} strokeWidth={1.75} /> : <Archive size={14} strokeWidth={1.75} />}
        </button>
      </footer>
      {error && <p className="fin-error">{error}</p>}
    </li>
  );
}

// ---------- Recurring ----------

export function RecurringPage({ state }: { state: FinanceState }) {
  const home = state.settings!.homeCurrency;
  const every = { week: "Weekly", month: "Monthly", year: "Yearly" } as const;
  const perMonth = (amount: number, e: "week" | "month" | "year") => (e === "week" ? (amount * 52) / 12 : e === "year" ? amount / 12 : amount);
  const sameCurrency = state.recurring.filter((r) => state.accounts.find((a) => a.id === r.accountId)?.currency === home);
  const monthlyOut = sameCurrency.filter((r) => r.amount < 0).reduce((s, r) => s + perMonth(-r.amount, r.every), 0);
  const monthlyIn = sameCurrency.filter((r) => r.amount > 0).reduce((s, r) => s + perMonth(r.amount, r.every), 0);
  return (
    <div className="fin-page">
      <div className="fin-page-head">
        <div className="fin-page-figures">
          <span>
            <span className="fin-total-label">Out each month</span>
            <b className="fin-big">{money(Math.round(monthlyOut), home)}</b>
          </span>
          <span>
            <span className="fin-total-label">In each month</span>
            <b className="fin-big fin-in">{money(Math.round(monthlyIn), home)}</b>
          </span>
        </div>
        <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "recurring", id: null } })}>
          <Plus size={14} strokeWidth={1.75} /> Add recurring
        </button>
      </div>
      {state.recurring.length === 0 ? (
        <div className="fin-empty">
          <Repeat size={26} strokeWidth={1.25} />
          <p>Add your salary, rent, bills and subscriptions.</p>
          <p className="dim">Each time one comes round, it shows on the overview to confirm with one click, so recording a month takes seconds.</p>
        </div>
      ) : (
        <ul className="fin-list">
          {state.recurring.map((r) => {
            const account = state.accounts.find((a) => a.id === r.accountId);
            const cat = state.categories.find((c) => c.id === r.categoryId);
            return (
              <li key={r.id} className="fin-row">
                <span className="fin-icon fin-row-icon">{cat?.icon ?? "🔁"}</span>
                <button className="fin-row-main" onClick={() => setFinanceUi({ dialog: { kind: "recurring", id: r.id } })}>
                  <span className="fin-row-payee">{r.name}</span>
                  <span className="fin-row-meta dim">
                    {every[r.every]} from {mediumDay(r.startsOn)}
                    {r.endsOn && ` to ${mediumDay(r.endsOn)}`} · {account?.name}
                  </span>
                </button>
                <span className="fin-row-amount">
                  <Amount minor={r.amount} currency={account?.currency ?? home} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Categories and budgets ----------

export function Categories({ state }: { state: FinanceState }) {
  const home = state.settings!.homeCurrency;
  const [error, setError] = useState<string | null>(null);
  const [homeChoice, setHomeChoice] = useState(home);
  const section = (kind: "expense" | "income") => state.categories.filter((c) => c.kind === kind);
  const budgets = section("expense").reduce((s, c) => s + (c.budget ?? 0), 0);
  return (
    <div className="fin-page">
      <div className="fin-page-head">
        <div>
          <span className="fin-total-label">Monthly budget</span>
          <h2 className="fin-big">{budgets ? money(budgets, home) : "Not set"}</h2>
        </div>
        <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "category", id: null } })}>
          <Plus size={14} strokeWidth={1.75} /> Add a category
        </button>
      </div>
      {error && <p className="fin-error">{error}</p>}
      {(["expense", "income"] as const).map((kind) => (
        <section key={kind} className="fin-card">
          <header className="fin-card-head">
            <h3>{kind === "expense" ? "Spending" : "Income"}</h3>
            {kind === "expense" && <span className="dim fin-small">Click a category to set its monthly budget</span>}
          </header>
          <ul className="fin-category-grid">
            {section(kind).map((c) => (
              <li key={c.id}>
                <button onClick={() => setFinanceUi({ dialog: { kind: "category", id: c.id } })}>
                  <span className="fin-icon" style={{ background: `${dot(c.color).background}22` }}>
                    {c.icon}
                  </span>
                  <span className="fin-category-text">
                    <b>{c.name}</b>
                    {kind === "expense" && <span className="dim fin-small">{c.budget ? `${money(c.budget, home)} a month` : "No budget"}</span>}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button className="fin-category-add" onClick={() => setFinanceUi({ dialog: { kind: "category", id: null, categoryKind: kind } })}>
                <Plus size={14} strokeWidth={1.75} /> Add
              </button>
            </li>
          </ul>
        </section>
      ))}
      <section className="fin-card">
        <header className="fin-card-head">
          <h3>Home currency</h3>
          <span className="dim fin-small">Totals, budgets and reports are in it. Other currencies convert at each day&apos;s rate.</span>
        </header>
        <div className="fin-inline">
          <input className="fin-input fin-code" value={homeChoice} maxLength={3} aria-label="Home currency" onChange={(e) => setHomeChoice(e.currentTarget.value.toUpperCase())} />
          <button
            className="btn btn-sm"
            disabled={homeChoice === home || homeChoice.length !== 3}
            onClick={() => void api.setHomeCurrency(homeChoice, today()).then(financeChanged, (e) => setError(errorMessage(e)))}
          >
            Change
          </button>
        </div>
      </section>
    </div>
  );
}
