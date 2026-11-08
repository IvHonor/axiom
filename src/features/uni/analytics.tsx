import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, PERCENT, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { COLORS, CONFIDENCE, type Color } from "./api";

/** Mirrors `UniAnalytics` in src-tauri/src/features/uni/analytics.rs. */
interface UniAnalytics {
  headline: Headline;
  due: Compare;
  attendance: Compare;
  reviewed: Compare;
  behind: number;
  days: { day: string; caughtUp: number; attended: number; behind: number; upcoming: number }[];
  modules: { id: string; code: string; name: string; color: string; due: number; caughtUp: number }[];
  confidence: [number, number, number];
}

export const uniAnalytics = defineAnalytics<UniAnalytics>({
  load: (period) => invoke("uni_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Lectures caught up on", value: r.headline, measure: PERCENT }),
  Section: ({ report: r, period }) => {
    const lectures = r.days.some((d) => d.caughtUp + d.attended + d.behind + d.upcoming > 0);
    const rated = r.confidence.some(Boolean);
    return (
      <>
        <Metrics>
          <Metric label="Lectures caught up on" value={r.headline} measure={PERCENT} period={period} />
          <Metric label="Went to" value={r.attendance} measure={PERCENT} period={period} />
          <Metric label="Lectures due" value={r.due} measure={{ ...COUNT, better: "neutral" }} period={period} />
          <Metric label="Reviews done" value={r.reviewed} measure={COUNT} period={period} />
          <Metric label="Behind now" value={{ now: r.behind, before: null }} measure={COUNT} period={period} note={r.behind ? "Across every term" : "Nothing to catch up on"} />
        </Metrics>
        {lectures ? (
          <div className="analytics-charts">
            <ChartCard title="Lectures each day" note="By where each one stands">
              <DayBars
                period={period}
                mode="stack"
                series={[
                  { label: "Caught up", values: r.days.map((d) => d.caughtUp) },
                  { label: "Went to", values: r.days.map((d) => d.attended), tone: "soft" },
                  { label: "Behind", values: r.days.map((d) => d.behind), tone: "danger" },
                  { label: "Still to come", values: r.days.map((d) => d.upcoming), tone: "faint" },
                ]}
                format={(n) => plural(n, "lecture")}
                axisFormat={COUNT.format}
                label="Lectures due each day, by whether they were caught up on, gone to, missed or still to come"
              />
            </ChartCard>
            <ChartCard title="By module" note="Caught up on, of those due">
              <BarList
                max={100}
                format={PERCENT.format}
                rows={r.modules.map((m) => ({
                  key: m.id,
                  name: [m.code, m.name].filter(Boolean).join(" "),
                  value: (m.caughtUp / Math.max(1, m.due)) * 100,
                  color: COLORS[m.color as Color],
                  note: `· ${m.caughtUp} of ${m.due}`,
                }))}
              />
            </ChartCard>
            <ChartCard title="How sure you felt" note="Lectures rated">
              {rated ? (
                <BarList format={(n) => plural(n, "lecture")} rows={([1, 2, 3] as const).map((c) => ({ key: String(c), name: CONFIDENCE[c], value: r.confidence[c - 1] }))} />
              ) : (
                <ChartEmpty>Rate how sure you feel about a lecture to see it here.</ChartEmpty>
              )}
            </ChartCard>
          </div>
        ) : (
          <ChartEmpty>No lectures were due in this {period.unit}.</ChartEmpty>
        )}
      </>
    );
  },
});
