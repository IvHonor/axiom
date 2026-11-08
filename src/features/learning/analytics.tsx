import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { axisMinutes, COUNT, defineAnalytics, MINUTES, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics, type Series } from "../../shell/ui/charts/Charts";
import { COLORS, type Color } from "./api";

/** Mirrors `LearningAnalytics` in src-tauri/src/features/learning/analytics.rs. */
interface LearningAnalytics {
  headline: Headline;
  unitsDone: Compare;
  studyDays: Compare;
  skills: { id: string; name: string; icon: string; color: string; minutes: number; unitsDone: number }[];
  /** `minutes` follows the order of `skills`. */
  days: { day: string; minutes: number[]; unitsDone: number }[];
}

/** The most skills a stack shows by name; the rest are "Other". */
const STACKED = 5;

export const learningAnalytics = defineAnalytics<LearningAnalytics>({
  load: (period) => invoke("learning_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Time studied", value: r.headline, measure: MINUTES }),
  Section: ({ report: r, period }) => {
    const studied = r.skills.filter((s) => s.minutes > 0);
    // Skills keep their own colours, so a skill reads the same in every period.
    const series: Series[] = studied.slice(0, STACKED).map((s) => ({
      label: s.name,
      values: r.days.map((d) => d.minutes[r.skills.indexOf(s)]),
      color: COLORS[s.color as Color],
    }));
    if (studied.length > STACKED) {
      const rest = studied.slice(STACKED).map((s) => r.skills.indexOf(s));
      series.push({ label: "Other", values: r.days.map((d) => rest.reduce((sum, i) => sum + d.minutes[i], 0)), tone: "muted" });
    }
    return (
      <>
        <Metrics>
          <Metric label="Time studied" value={r.headline} measure={MINUTES} period={period} />
          <Metric label="Chapters done" value={r.unitsDone} measure={COUNT} period={period} />
          <Metric label="Days you studied" value={r.studyDays} measure={COUNT} period={period} />
        </Metrics>
        <div className="analytics-charts">
          <ChartCard title="Study time" note={series.length > 1 ? "By skill" : undefined}>
            {series.length ? (
              <DayBars period={period} mode="stack" series={series} format={MINUTES.format} axisFormat={axisMinutes} least={60} tickUnit={60} label="Minutes studied each day, by skill" />
            ) : (
              <ChartEmpty>Time a study session and it shows here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="By skill">
            {r.skills.length ? (
              <BarList
                format={MINUTES.format}
                rows={r.skills.map((s) => ({
                  key: s.id,
                  name: s.name,
                  icon: s.icon ? <span aria-hidden="true">{s.icon}</span> : undefined,
                  value: s.minutes,
                  color: COLORS[s.color as Color],
                  note: s.unitsDone ? `· ${plural(s.unitsDone, "chapter")}` : undefined,
                }))}
              />
            ) : (
              <ChartEmpty>The skills you work on show here.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Chapters done">
            {r.days.some((d) => d.unitsDone) ? (
              <DayBars period={period} series={[{ label: "Chapters", values: r.days.map((d) => d.unitsDone) }]} format={(n) => plural(n, "chapter")} axisFormat={COUNT.format} label="Chapters ticked off each day" />
            ) : (
              <ChartEmpty>Tick off a chapter and it shows here.</ChartEmpty>
            )}
          </ChartCard>
        </div>
      </>
    );
  },
});
