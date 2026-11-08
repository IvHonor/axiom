import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline, Measure } from "../../extensions/types";
import { daysOf, previousName, periodArgs } from "../../shell/analytics/period";
import { cumulative, defineAnalytics, lessIsBetter, PERCENT, soFar } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, DayLines, Metric, Metrics, type Series } from "../../shell/ui/charts/Charts";
import { exponent, money } from "./money";
import { dot } from "./parts";

/** Mirrors `FinanceAnalytics` in src-tauri/src/features/finance/analytics.rs. Amounts are minor units. */
interface FinanceAnalytics {
  homeCurrency: string;
  headline: Headline;
  income: Compare;
  spending: Compare;
  savingsRate: Compare;
  days: { day: string; income: number; spending: number }[];
  previousSpending: number[];
  budgeted: number | null;
  categories: { id: string | null; name: string; icon: string; color: string; spent: number; budget: number | null }[];
  unconverted: number;
}

const measureIn = (currency: string): Measure => ({ format: (n) => money(n, currency), better: "up" });
const axisIn = (currency: string) => (n: number) => money(n, currency, { compact: true });

export const financeAnalytics = defineAnalytics<FinanceAnalytics>({
  load: (period) => invoke("finance_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Kept (in less out)", value: r.headline, measure: measureIn(r.homeCurrency) }),
  Section: ({ report: r, period }) => {
    const cash = measureIn(r.homeCurrency);
    const axis = axisIn(r.homeCurrency);
    // Axis steps in whole pounds (or the home currency's own unit).
    const unit = 10 ** exponent(r.homeCurrency);
    const days = daysOf(period);
    const spentSoFar = cumulative(soFar(r.days, period.today, (d) => d.spending));
    const before = previousName(period);
    const references: Series[] = [{ label: before[0].toUpperCase() + before.slice(1), values: cumulative(r.previousSpending) }];
    const budget = r.budgeted;
    if (budget) references.push({ label: "Budget pace", values: days.map((_, i) => (budget * (i + 1)) / days.length), tone: "soft" });
    const anything = r.days.some((d) => d.income || d.spending);
    return (
      <>
        <Metrics>
          <Metric label="Kept (in less out)" value={r.headline} measure={cash} period={period} />
          <Metric label="Money in" value={r.income} measure={cash} period={period} />
          <Metric label="Spent" value={r.spending} measure={lessIsBetter(cash)} period={period} />
          <Metric label="Share of income kept" value={r.savingsRate} measure={PERCENT} period={period} />
        </Metrics>
        {r.unconverted > 0 && (
          <p className="dim analytics-note">
            {r.unconverted} transaction{r.unconverted === 1 ? " is" : "s are"} in another currency and waiting for an exchange rate, so {r.unconverted === 1 ? "it isn't" : "they aren't"} counted yet.
          </p>
        )}
        <div className="analytics-charts">
          <ChartCard title="Spending so far" note={r.budgeted ? `Budgets add up to ${money(r.budgeted, r.homeCurrency)}` : `Against ${previousName(period)}`}>
            {anything || r.previousSpending.some(Boolean) ? (
              <DayLines
                period={period}
                series={[{ label: "Spent", values: spentSoFar }]}
                references={references}
                format={cash.format}
                axisFormat={axis}
                least={100 * unit}
                tickUnit={unit}
                label={`Spending added up day by day, against ${previousName(period)}${r.budgeted ? " and the budget" : ""}`}
              />
            ) : (
              <ChartEmpty>Add or import transactions and your spending adds up here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="In and out" note="Money in above the line, spending below">
            {anything ? (
              <DayBars
                period={period}
                mode="diverging"
                series={[
                  { label: "In", values: r.days.map((d) => d.income) },
                  { label: "Out", values: r.days.map((d) => d.spending) },
                ]}
                format={cash.format}
                axisFormat={axis}
                least={100 * unit}
                tickUnit={unit}
                label="Money in and spending each day"
              />
            ) : (
              <ChartEmpty>Nothing in or out yet.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Spending by category" note={period.unit === "month" ? "The line marks each budget" : undefined} wide={r.categories.length > 6}>
            {r.categories.length ? (
              <BarList
                overIsBad
                format={cash.format}
                rows={r.categories.map((c) => ({
                  key: c.id ?? "none",
                  name: c.name,
                  icon: c.icon ? <span aria-hidden="true">{c.icon}</span> : undefined,
                  value: Math.max(0, c.spent),
                  target: c.budget,
                  color: dot(c.color).background,
                  note: c.budget === null ? undefined : c.spent > c.budget ? `${money(c.spent - c.budget, r.homeCurrency)} over` : `of ${money(c.budget, r.homeCurrency)}`,
                }))}
              />
            ) : (
              <ChartEmpty>No spending yet.</ChartEmpty>
            )}
          </ChartCard>
        </div>
      </>
    );
  },
});
