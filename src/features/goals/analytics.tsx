import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, PERCENT, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics } from "../../shell/ui/charts/Charts";

/** Mirrors `GoalsAnalytics` in src-tauri/src/features/goals/analytics.rs. */
interface GoalsAnalytics {
  headline: Headline;
  checkIns: Compare;
  milestones: Compare;
  completed: Compare;
  days: { day: string; checkIns: number; milestones: number }[];
  goals: {
    id: string;
    title: string;
    icon: string;
    percent: number;
    expected: number | null;
    pace: "ahead" | "on_track" | "behind" | null;
    dueDate: string | null;
    moves: number;
  }[];
}

const PACE = { ahead: "Ahead", on_track: "On track", behind: "Behind" } as const;

export const goalsAnalytics = defineAnalytics<GoalsAnalytics>({
  load: (period) => invoke("goals_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Check-ins and milestones", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => {
    const paced = r.goals.filter((g) => g.pace);
    return (
      <>
        <Metrics>
          <Metric label="Check-ins and milestones" value={r.headline} measure={COUNT} period={period} />
          <Metric label="Goals reached" value={r.completed} measure={COUNT} period={period} />
          <Metric
            label="On track or ahead"
            value={{ now: paced.length ? (paced.filter((g) => g.pace !== "behind").length / paced.length) * 100 : null, before: null }}
            measure={PERCENT}
            period={period}
            note={paced.length ? `Of ${plural(paced.length, "goal")} with a deadline, today` : "Give a goal a deadline to see its pace"}
          />
        </Metrics>
        <div className="analytics-charts">
          <ChartCard title="Where each goal stands" note="The line is where it should be by today" wide={r.goals.length > 5}>
            {r.goals.length ? (
              <BarList
                max={100}
                format={PERCENT.format}
                rows={r.goals.map((g) => ({
                  key: g.id,
                  name: g.title,
                  icon: g.icon ? <span aria-hidden="true">{g.icon}</span> : undefined,
                  value: g.percent,
                  target: g.expected,
                  note: g.pace ? `· ${PACE[g.pace]}` : g.moves ? `· ${plural(g.moves, "step")}` : undefined,
                  noteTone: g.pace === "behind" ? "bad" : g.pace === "ahead" ? "good" : undefined,
                }))}
              />
            ) : (
              <ChartEmpty>Active goals show here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Progress logged">
            {r.days.some((d) => d.checkIns || d.milestones) ? (
              <DayBars
                period={period}
                mode="stack"
                series={[
                  { label: "Check-ins", values: r.days.map((d) => d.checkIns) },
                  { label: "Milestones", values: r.days.map((d) => d.milestones), tone: "soft" },
                ]}
                format={COUNT.format}
                label="Check-ins and milestones each day"
              />
            ) : (
              <ChartEmpty>Check in on a goal or tick off a milestone and it shows here.</ChartEmpty>
            )}
          </ChartCard>
        </div>
      </>
    );
  },
});
