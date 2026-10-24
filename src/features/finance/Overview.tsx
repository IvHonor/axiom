import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileUp, RefreshCw, SkipForward, Sparkles } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, type Due, type FinanceState, type MonthSummary, type TransactionRow } from "./api";
import { financeChanged, setFinanceUi, useFinanceUi } from "./financeUi";
import { addMonths, money, monthName, monthOf } from "./money";
import { Amount, Bar, dot } from "./parts";

/** A month at a glance: the totals, budgets, what's due, the trend. */
export function Overview({ state }: { state: FinanceState }) {
  const { month, revision } = useFinanceUi();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [recent, setRecent] = useState<TransactionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.month(month, today()).then(
      (s) => {
        setSummary(s);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
    api.transactions({ month }).then((rows) => setRecent(rows.slice(0, 6)), () => setRecent([]));
  }, [month]);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  const home = state.settings!.homeCurrency;
  const thisMonth = monthOf(today());
  const category = (id: string | null) => state.categories.find((c) => c.id === id);

  return (
    <div className="fin-page">
      <div className="fin-month-bar">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setFinanceUi({ month: addMonths(month, -1) })}>
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <h2>{monthName(month)}</h2>
        <button className="icon-btn" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setFinanceUi({ month: addMonths(month, 1) })}>
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
        {month !== thisMonth && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ month: thisMonth })}>
            This month
          </button>
        )}
      </div>
      {error && <p className="fin-error">{error}</p>}
      {!summary ? (
        <p className="dim">Loading…</p>
      ) : (
        <>
          <Totals summary={summary} />

          {summary.unconverted > 0 && (
            <p className="fin-note">
              {summary.unconverted} transaction{summary.unconverted === 1 ? " is" : "s are"} in another currency and waiting for an exchange rate.{" "}
              <button className="link" onClick={() => void api.convert(today()).then(financeChanged, (e) => setError(errorMessage(e)))}>
                <RefreshCw size={12} strokeWidth={1.75} /> Convert now
              </button>
            </p>
          )}

          {summary.due.length > 0 && <DueList due={summary.due} state={state} />}

          <div className="fin-columns">
            <section className="fin-card">
              <header className="fin-card-head">
                <h3>Spending by category</h3>
                {summary.uncategorised > 0 && (
                  <button className="link fin-small" onClick={() => setFinanceUi({ page: "transactions", categoryId: "none", accountId: null })}>
                    <Sparkles size={12} strokeWidth={1.75} /> {summary.uncategorised} to sort
                  </button>
                )}
              </header>
              {summary.spendingByCategory.length === 0 ? (
                <p className="dim fin-empty-line">No spending this month yet.</p>
              ) : (
                <ul className="fin-categories">
                  {summary.spendingByCategory.map((c) => {
                    const cat = category(c.categoryId);
                    const percent = c.budget ? (c.total / c.budget) * 100 : 0;
                    return (
                      <li key={c.categoryId ?? "none"}>
                        <button className="fin-category-row" onClick={() => setFinanceUi({ page: "transactions", categoryId: c.categoryId ?? "none", accountId: null })}>
                          <span className="fin-category-name">
                            <span className="fin-icon">{cat?.icon ?? "❔"}</span>
                            {cat?.name ?? "Uncategorised"}
                          </span>
                          <span className="fin-category-figures">
                            <b>{money(c.total, home)}</b>
                            {c.budget !== null && <span className="dim"> of {money(c.budget, home)}</span>}
                          </span>
                          {c.budget !== null && <Bar percent={percent} color={cat ? dot(cat.color).background : undefined} />}
                          {c.budget !== null && (
                            <span className={`fin-category-left${c.total > c.budget ? " is-over" : ""}`}>
                              {c.total > c.budget ? `${money(c.total - c.budget, home)} over` : `${money(c.budget - c.total, home)} left`}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button className="btn btn-sm btn-ghost" onClick={() => setFinanceUi({ page: "categories" })}>
                Set budgets
              </button>
            </section>

            <div className="fin-stack">
              <Trend summary={summary} />
              <section className="fin-card">
                <header className="fin-card-head">
                  <h3>Recent</h3>
                  <button className="link fin-small" onClick={() => setFinanceUi({ page: "transactions", categoryId: null, accountId: null })}>
                    See all
                  </button>
                </header>
                {recent.length === 0 ? (
                  <div className="fin-empty-line">
                    <p className="dim">Nothing this month yet. Add one above, or import a statement.</p>
                    <button className="btn btn-sm" onClick={() => setFinanceUi({ dialog: { kind: "import" } })}>
                      <FileUp size={14} strokeWidth={1.75} /> Import a statement
                    </button>
                  </div>
                ) : (
                  <ul className="fin-recent">
                    {recent.map((t) => {
                      const cat = category(t.categoryId);
                      return (
                        <li key={t.id}>
                          <button onClick={() => setFinanceUi({ dialog: { kind: "transaction", transaction: t } })}>
                            <span className="fin-icon">{t.transferId ? "⇄" : (cat?.icon ?? "❔")}</span>
                            <span className="fin-recent-text">
                              <span>{t.payee || cat?.name || "—"}</span>
                              <span className="dim fin-small">{mediumDay(t.day)}</span>
                            </span>
                            <Amount minor={t.amount} currency={t.currency} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Totals({ summary }: { summary: MonthSummary }) {
  const home = summary.homeCurrency;
  const net = summary.income - summary.spending;
  const budget = summary.budgeted;
  return (
    <div className="fin-totals">
      <div className="fin-total">
        <span className="fin-total-label">Spent</span>
        <b>{money(summary.spending, home)}</b>
        {budget !== null ? (
          <>
            <Bar percent={(summary.spending / budget) * 100} />
            <span className={`fin-small${summary.spending > budget ? " fin-over" : " dim"}`}>
              {summary.spending > budget ? `${money(summary.spending - budget, home)} over budget` : `${money(budget - summary.spending, home)} left of ${money(budget, home)}`}
            </span>
          </>
        ) : (
          <span className="dim fin-small">No budgets set</span>
        )}
      </div>
      <div className="fin-total">
        <span className="fin-total-label">Income</span>
        <b className="fin-in">{money(summary.income, home)}</b>
      </div>
      <div className="fin-total">
        <span className="fin-total-label">{net >= 0 ? "Saved" : "Overspent"}</span>
        <b className={net >= 0 ? "fin-in" : "fin-over"}>{money(Math.abs(net), home)}</b>
        {summary.income > 0 && <span className="dim fin-small">{Math.round((net / summary.income) * 100)}% of income</span>}
      </div>
      {summary.netWorth !== null && (
        <div className="fin-total">
          <span className="fin-total-label">Net worth</span>
          <b>{money(summary.netWorth, home)}</b>
          <span className="dim fin-small">Across all accounts</span>
        </div>
      )}
    </div>
  );
}

function DueList({ due, state }: { due: Due[]; state: FinanceState }) {
  const [error, setError] = useState<string | null>(null);
  const act = (work: Promise<unknown>) => work.then(financeChanged, (e) => setError(errorMessage(e)));
  const now = today();
  return (
    <section className="fin-card fin-due">
      <header className="fin-card-head">
        <h3>To confirm</h3>
        <span className="dim fin-small">Recurring items that have come round</span>
      </header>
      <ul>
        {due.map((d) => {
          const cat = state.categories.find((c) => c.id === d.categoryId);
          const late = d.day < now;
          return (
            <li key={`${d.recurringId}:${d.day}`}>
              <span className="fin-icon">{cat?.icon ?? "🔁"}</span>
              <span className="fin-due-text">
                <b>{d.name}</b>
                <span className={late ? "fin-over fin-small" : "dim fin-small"}>{d.day === now ? "Today" : late ? `${mediumDay(d.day)}, overdue` : mediumDay(d.day)}</span>
              </span>
              <Amount minor={d.amount} currency={d.currency} />
              <button className="btn btn-sm" title="It happened" onClick={() => void act(api.confirm(d.recurringId, d.day, null))}>
                <Check size={14} strokeWidth={2} /> Confirm
              </button>
              <button className="icon-btn" title="It didn't happen this time" aria-label="Skip" onClick={() => void act(api.skip(d.recurringId, d.day))}>
                <SkipForward size={14} strokeWidth={1.75} />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="fin-error">{error}</p>}
    </section>
  );
}

/** Twelve months of income and spending, side by side. */
function Trend({ summary }: { summary: MonthSummary }) {
  const home = summary.homeCurrency;
  const peak = Math.max(1, ...summary.trend.flatMap((m) => [m.income, m.spending]));
  return (
    <section className="fin-card">
      <header className="fin-card-head">
        <h3>The last year</h3>
        <span className="fin-legend">
          <i className="is-in" /> Income <i className="is-out" /> Spending
        </span>
      </header>
      <div className="fin-trend" role="img" aria-label="Income and spending over the last twelve months">
        {summary.trend.map((m) => (
          <button
            key={m.month}
            className={`fin-trend-month${m.month === summary.month ? " is-current" : ""}`}
            title={`${monthName(m.month)}: income ${money(m.income, home)}, spending ${money(m.spending, home)}`}
            onClick={() => setFinanceUi({ month: m.month })}
          >
            <span className="fin-trend-bars">
              <span className="is-in" style={{ height: `${(m.income / peak) * 100}%` }} />
              <span className="is-out" style={{ height: `${(Math.max(0, m.spending) / peak) * 100}%` }} />
            </span>
            <span className="fin-trend-label">{monthName(m.month, false)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
