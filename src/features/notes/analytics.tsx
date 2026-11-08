import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics } from "../../shell/ui/charts/Charts";

/** Mirrors `NotesAnalytics` in src-tauri/src/features/notes/analytics.rs. */
interface NotesAnalytics {
  headline: Headline;
  created: Compare;
  days: { day: string; created: number; workedOn: number }[];
  tags: { name: string; count: number }[];
  total: number;
}

export const notesAnalytics = defineAnalytics<NotesAnalytics>({
  load: (period) => invoke("notes_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Notes worked on", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => (
    <>
      <Metrics>
        <Metric label="Notes worked on" value={r.headline} measure={COUNT} period={period} />
        <Metric label="New notes" value={r.created} measure={COUNT} period={period} />
        <Metric label="Notes in all" value={{ now: r.total, before: null }} measure={COUNT} period={period} note="Not counting the trash" />
      </Metrics>
      <div className="analytics-charts">
        <ChartCard title="Writing each day" note="New notes are part of the notes worked on">
          {r.days.some((d) => d.workedOn) ? (
            <DayBars
              period={period}
              mode="overlay"
              series={[
                { label: "Worked on", values: r.days.map((d) => d.workedOn) },
                { label: "New", values: r.days.map((d) => d.created) },
              ]}
              format={(n) => plural(n, "note")}
              axisFormat={COUNT.format}
              label="Notes worked on and started each day"
            />
          ) : (
            <ChartEmpty>Write in a note and it shows here.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard title="What you wrote about" note="Tags of the notes worked on">
          {r.tags.length ? (
            <BarList rows={r.tags.map((t) => ({ key: t.name, name: t.name, value: t.count }))} format={(n) => plural(n, "note")} />
          ) : (
            <ChartEmpty>Tag your notes to see what you spend time on.</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </>
  ),
});
