import { invoke } from "@tauri-apps/api/core";
import { findExtension } from "../../extensions";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, neutral, plural } from "../../shell/analytics/measures";
import { BarList, ChartCard, ChartEmpty, DayBars, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { ExtensionIcon } from "../../shell/ui/ExtensionIcon";

/** Mirrors `LemmaAnalytics` in src-tauri/src/ai/analytics.rs. */
interface LemmaAnalytics {
  headline: Headline;
  asked: Compare;
  days: { day: string; asked: number; confirmed: number }[];
  areas: { area: string; confirmed: number; discarded: number; other: number }[];
}

export const lemmaAnalytics = defineAnalytics<LemmaAnalytics>({
  load: (period) => invoke("assistant_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Changes made for you", value: r.headline, measure: COUNT }),
  Section: ({ report: r, period }) => (
    <>
      <Metrics>
        <Metric label="Changes made for you" value={r.headline} measure={COUNT} period={period} />
        <Metric label="Messages you sent" value={r.asked} measure={neutral(COUNT)} period={period} />
      </Metrics>
      <div className="analytics-charts">
        <ChartCard title="Messages each day">
          {r.days.some((d) => d.asked) ? (
            <DayBars period={period} series={[{ label: "Messages", values: r.days.map((d) => d.asked) }]} format={(n) => plural(n, "message")} axisFormat={COUNT.format} label="Messages you sent each day" />
          ) : (
            <ChartEmpty>Ask something and it shows here.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard title="Changes by area" note="Made, of those offered">
          {r.areas.length ? (
            <BarList
              format={(n) => plural(n, "change")}
              rows={r.areas.map((a) => {
                const ext = findExtension(a.area);
                return {
                  key: a.area,
                  name: ext?.name ?? a.area,
                  icon: ext ? <ExtensionIcon ext={ext} size={13} /> : undefined,
                  value: a.confirmed,
                  target: a.confirmed + a.discarded + a.other,
                  note: a.discarded ? `· ${a.discarded} turned down` : undefined,
                };
              })}
            />
          ) : (
            <ChartEmpty>Changes offered in a chat show here.</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </>
  ),
});
