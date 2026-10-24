import { useCallback, useEffect, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, type MonthSummary } from "./api";
import { setFinanceUi, useFinanceUi } from "./financeUi";
import { money, monthName, monthOf } from "./money";
import { Bar } from "./parts";

/** The overview tile: this month's spending against budget, income, what's due. */
export function FinanceSummary({ onOpen }: { onOpen: () => void }) {
  const { revision } = useFinanceUi();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [setUp, setSetUp] = useState<boolean | null>(null);
  const load = useCallback(() => {
    api.state(today()).then((s) => {
      setSetUp(!!s.settings);
      if (s.settings) api.month(monthOf(today()), today()).then(setSummary, () => setSummary(null));
    }, () => setSetUp(false));
  }, []);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  if (setUp === false) {
    return (
      <p className="dim">
        Not set up yet.{" "}
        <button className="rd-link" onClick={onOpen}>
          Start tracking
        </button>
      </p>
    );
  }
  if (!summary) return <p className="dim">Loading…</p>;
  const home = summary.homeCurrency;
  const budget = summary.budgeted;
  const go = (page: "overview" | "transactions") => {
    setFinanceUi({ page, month: monthOf(today()) });
    onOpen();
  };
  return (
    <div className="ft-summary">
      <button className="ft-main" onClick={() => go("overview")}>
        <span className="ft-label">Spent in {monthName(summary.month, false)}</span>
        <b>{money(summary.spending, home)}</b>
        {budget !== null && (
          <>
            <Bar percent={(summary.spending / budget) * 100} />
            <span className={summary.spending > budget ? "fin-over" : "dim"}>
              {summary.spending > budget ? `${money(summary.spending - budget, home)} over budget` : `${money(budget - summary.spending, home)} left`}
            </span>
          </>
        )}
      </button>
      <footer className="rt-foot">
        <span className="fin-in">In {money(summary.income, home)}</span>
        {summary.due.length > 0 ? (
          <button className="rd-link" onClick={() => go("overview")}>
            {summary.due.length} to confirm
          </button>
        ) : (
          summary.uncategorised > 0 && (
            <button
              className="rd-link"
              onClick={() => {
                setFinanceUi({ page: "transactions", categoryId: "none" });
                onOpen();
              }}
            >
              {summary.uncategorised} to sort
            </button>
          )
        )}
      </footer>
    </div>
  );
}
