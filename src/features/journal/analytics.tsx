import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, plural, RATING } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayGrid, DayLines, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { ENERGY, MOODS } from "./api";

/** Mirrors `JournalAnalytics` in src-tauri/src/features/journal/analytics.rs. */
interface JournalAnalytics {
  headline: Headline;
  words: Compare;
  mood: Compare;
  energy: Compare;
  days: { day: string; entries: number; words: number; mood: number | null; energy: number | null }[];
  tags: { name: string; count: number }[];
}

/** "4.2 · Good": the nearest word on the scale. */
const onScale = (scale: { value: number; label: string }[]) => (n: number) => `${n.toFixed(1)} · ${scale[Math.min(4, Math.max(0, Math.round(n) - 1))].label}`;

export const journalAnalytics = defineAnalytics<JournalAnalytics>({
  load: (period) => invoke("journal_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Days written", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => {
    const felt = r.days.some((d) => d.mood !== null || d.energy !== null);
    return (
      <>
        <Metrics>
          <Metric label="Days written" value={r.headline} measure={COUNT} period={period} />
          <Metric label="Words" value={r.words} measure={COUNT} period={period} />
          <Metric label="Average mood" value={r.mood} measure={{ ...RATING, format: onScale(MOODS) }} period={period} />
          <Metric label="Average energy" value={r.energy} measure={{ ...RATING, format: onScale(ENERGY) }} period={period} />
        </Metrics>
        <div className="analytics-charts">
          <ChartCard title="Days you wrote" note="Darker for more words">
            <DayGrid
              period={period}
              values={r.days.map((d) => d.words || (d.entries ? 1 : 0))}
              describe={(i) => (r.days[i].words ? plural(r.days[i].words, "word") : "a mood, no words")}
              label={`Wrote on ${r.days.filter((d) => d.entries).length} of ${r.days.filter((d) => d.day <= period.today).length} days so far`}
            />
          </ChartCard>
          <ChartCard title="Mood and energy" note="1 to 5, from entries that have them">
            {felt ? (
              <DayLines
                period={period}
                series={[
                  { label: "Mood", values: r.days.map((d) => d.mood) },
                  { label: "Energy", values: r.days.map((d) => d.energy), tone: "muted" },
                ]}
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                format={(n) => n.toFixed(1)}
                axisFormat={String}
                label="Mood and energy each day, on a scale of 1 to 5"
              />
            ) : (
              <ChartEmpty>Pick a mood or energy level with an entry to see how they move.</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="What you wrote about" note="Tags">
            {r.tags.length ? (
              <BarList rows={r.tags.map((t) => ({ key: t.name, name: t.name, value: t.count }))} format={(n) => plural(n, "entry", "entries")} />
            ) : (
              <ChartEmpty>Tag your entries to see what comes up most.</ChartEmpty>
            )}
          </ChartCard>
        </div>
      </>
    );
  },
});
