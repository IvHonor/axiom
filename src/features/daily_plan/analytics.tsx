import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { axisMinutes, COUNT, defineAnalytics, MINUTES, PERCENT } from "../../shell/analytics/measures";
import { ChartCard, ChartEmpty, DayBars, DotRows, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { paceText } from "./Capacity";

/** Mirrors `PlanAnalytics` in src-tauri/src/features/daily_plan/analytics.rs. */
interface PlanAnalytics {
  headline: Headline;
  planned: Compare;
  completion: Compare;
  focusMinutes: Compare;
  priorities: Compare;
  pace: number | null;
  days: {
    day: string;
    planned: number;
    done: number;
    focusMinutes: number;
    priorities: number;
    prioritiesDone: number;
    plannedRitual: boolean;
    shutdown: boolean;
  }[];
}

export const planAnalytics = defineAnalytics<PlanAnalytics>({
  load: (period) => invoke("plan_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Tasks done", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => {
    const planned = r.days.some((d) => d.planned > 0);
    return (
      <>
        <Metrics>
          <Metric label="Tasks done" value={r.headline} measure={COUNT} period={period} />
          <Metric label="Done of planned" value={r.completion} measure={PERCENT} period={period} />
          <Metric label="Top priorities done" value={r.priorities} measure={PERCENT} period={period} />
          <Metric label="Focus time" value={r.focusMinutes} measure={MINUTES} period={period} />
          <Metric
            label="Time against estimates"
            value={{ now: r.pace, before: null }}
            measure={{ format: (n) => `${n.toFixed(1)}×`, better: "neutral" }}
            period={period}
            note={r.pace === null ? "Time three estimated tasks to see" : paceText(r.pace)}
          />
        </Metrics>
        <div className="analytics-charts">
          <ChartCard title="Planned and done">
            {planned ? (
              <DayBars
                period={period}
                mode="overlay"
                series={[
                  { label: "Planned", values: r.days.map((d) => d.planned) },
                  { label: "Done", values: r.days.map((d) => d.done) },
                ]}
                format={COUNT.format}
                label={`Tasks planned and done each day: ${r.days.reduce((s, d) => s + d.done, 0)} of ${r.days.reduce((s, d) => s + d.planned, 0)} done`}
              />
            ) : (
              <ChartEmpty>Plan a few days and they show here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Focus time" note="From task timers">
            {r.days.some((d) => d.focusMinutes > 0) ? (
              <DayBars period={period} series={[{ label: "Focus", values: r.days.map((d) => d.focusMinutes) }]} format={MINUTES.format} axisFormat={axisMinutes} least={60} tickUnit={60} label="Minutes of focus each day" />
            ) : (
              <ChartEmpty>Start a task's timer and your focus time adds up here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Daily habits">
            <DotRows
              period={period}
              rows={[
                { label: "Planned the day", values: r.days.map((d) => d.plannedRitual) },
                { label: "Top 3 done", values: r.days.map((d) => d.priorities > 0 && d.prioritiesDone === d.priorities) },
                { label: "Shut down", values: r.days.map((d) => d.shutdown) },
              ]}
            />
          </ChartCard>
        </div>
      </>
    );
  },
});
