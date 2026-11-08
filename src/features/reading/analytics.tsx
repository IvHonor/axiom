import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, MINUTES, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, DayGrid, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { mediumDay } from "../daily_plan/time";
import { Cover, Stars } from "./Cover";
import { setReadingUi } from "./readingUi";

/** Mirrors `ReadingAnalytics` in src-tauri/src/features/reading/analytics.rs. */
interface ReadingAnalytics {
  headline: Headline;
  minutes: Compare;
  readingDays: Compare;
  finished: Compare;
  days: { day: string; pages: number; minutes: number }[];
  books: { id: string; title: string; pages: number; minutes: number }[];
  ended: { id: string; title: string; coverUrl: string | null; day: string; outcome: "finished" | "dnf"; rating: number | null }[];
}

export const readingAnalytics = defineAnalytics<ReadingAnalytics>({
  load: (period) => invoke("reading_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Pages read", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period, onOpen }) => {
    const read = r.days.some((d) => d.pages || d.minutes);
    const open = (book: string) => {
      setReadingUi({ book });
      onOpen();
    };
    return (
      <>
        <Metrics>
          <Metric label="Pages read" value={r.headline} measure={COUNT} period={period} />
          <Metric label="Time reading and listening" value={r.minutes} measure={MINUTES} period={period} />
          <Metric label="Days you read" value={r.readingDays} measure={COUNT} period={period} />
          <Metric label="Books finished" value={r.finished} measure={COUNT} period={period} />
        </Metrics>
        <div className="analytics-charts">
          <ChartCard title="Pages each day">
            {r.days.some((d) => d.pages) ? (
              <DayBars period={period} series={[{ label: "Pages", values: r.days.map((d) => d.pages) }]} format={(n) => plural(n, "page")} axisFormat={COUNT.format} least={20} label="Pages read each day" />
            ) : (
              <ChartEmpty>{read ? "Only listening logged so far." : "Log your progress in a book and it shows here."}</ChartEmpty>
            )}
          </ChartCard>
          <ChartCard title="Reading days" note="Darker for more">
            <DayGrid
              period={period}
              values={r.days.map((d) => d.pages || d.minutes)}
              describe={(i) => [r.days[i].pages && plural(r.days[i].pages, "page"), r.days[i].minutes && MINUTES.format(r.days[i].minutes)].filter(Boolean).join(", ")}
              label={`Read on ${r.days.filter((d) => d.pages || d.minutes).length} of ${r.days.filter((d) => d.day <= period.today).length} days so far`}
            />
          </ChartCard>
          <ChartCard title="What you read">
            {r.books.length ? (
              <BarList
                format={(n) => plural(n, "page")}
                rows={r.books.map((b) =>
                  b.pages ? { key: b.id, name: b.title, value: b.pages, note: b.minutes ? `· ${MINUTES.format(b.minutes)}` : undefined } : { key: b.id, name: b.title, value: 0, text: `${MINUTES.format(b.minutes)} listened` },
                )}
              />
            ) : (
              <ChartEmpty>The books you read show here.</ChartEmpty>
            )}
          </ChartCard>
          {r.ended.length > 0 && (
            <ChartCard title="Finished">
              <ul className="analytics-list">
                {r.ended.map((b) => (
                  <li key={`${b.id}-${b.day}`}>
                    <Cover url={b.coverUrl} title={b.title} size="sm" />
                    <button className="link analytics-list-main" onClick={() => open(b.id)} title={b.title}>
                      {b.title}
                    </button>
                    {b.rating ? <Stars value={b.rating} size={12} /> : null}
                    <span className="dim">
                      {b.outcome === "dnf" ? "Put down" : "Finished"} {mediumDay(b.day)}
                    </span>
                  </li>
                ))}
              </ul>
            </ChartCard>
          )}
        </div>
      </>
    );
  },
});
