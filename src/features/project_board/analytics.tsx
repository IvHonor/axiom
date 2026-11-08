import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline, Measure } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, lessIsBetter, neutral, PERCENT, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { colorOf } from "./palette";

/** Mirrors `BoardAnalytics` in src-tauri/src/features/project_board/analytics.rs. */
interface BoardAnalytics {
  headline: Headline;
  created: Compare;
  onTime: Compare;
  cycleDays: Compare;
  open: number;
  overdue: number;
  days: { day: string; completed: number; created: number }[];
  projects: { id: string; name: string; color: string; completed: number }[];
}

/** Days to finish: hours under a day. */
const CYCLE: Measure = lessIsBetter({ format: (d) => (d < 1 ? `${Math.round(d * 24)}h` : `${d.toFixed(1)}d`), better: "up" });

export const boardAnalytics = defineAnalytics<BoardAnalytics>({
  load: (period) => invoke("board_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Tasks completed", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => (
    <>
      <Metrics>
        <Metric label="Tasks completed" value={r.headline} measure={COUNT} period={period} />
        <Metric label="Tasks added" value={r.created} measure={neutral(COUNT)} period={period} />
        <Metric label="Done by the due date" value={r.onTime} measure={PERCENT} period={period} />
        <Metric label="Typical time to finish" value={r.cycleDays} measure={CYCLE} period={period} />
        <Metric label="Open now" value={{ now: r.open, before: null }} measure={COUNT} period={period} note={r.overdue ? `${plural(r.overdue, "task")} overdue` : "None overdue"} />
      </Metrics>
      <div className="analytics-charts">
        <ChartCard title="Completed and added" note="More finished than added shrinks the backlog">
          {r.days.some((d) => d.completed || d.created) ? (
            <DayBars
              period={period}
              mode="diverging"
              series={[
                { label: "Completed", values: r.days.map((d) => d.completed) },
                { label: "Added", values: r.days.map((d) => d.created) },
              ]}
              format={COUNT.format}
              label={`Tasks completed and added each day: ${r.days.reduce((s, d) => s + d.completed, 0)} completed, ${r.days.reduce((s, d) => s + d.created, 0)} added`}
            />
          ) : (
            <ChartEmpty>Nothing finished or added yet.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard title="Completed by project">
          {r.projects.length ? (
            <BarList rows={r.projects.map((p) => ({ key: p.id, name: p.name, value: p.completed, color: colorOf(p.color) }))} format={COUNT.format} />
          ) : (
            <ChartEmpty>Projects you finish tasks in show here.</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </>
  ),
});
