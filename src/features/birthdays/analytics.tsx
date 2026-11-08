import { invoke } from "@tauri-apps/api/core";
import type { Compare, Headline } from "../../extensions/types";
import { periodArgs } from "../../shell/analytics/period";
import { COUNT, defineAnalytics, neutral } from "../../shell/analytics/measures";
import { ChartCard, ChartEmpty, Metric, Metrics } from "../../shell/ui/charts/Charts";
import { mediumDay } from "../daily_plan/time";
import { emojiOf, type Occasion } from "./api";

/** Mirrors `BirthdaysAnalytics` in src-tauri/src/features/birthdays/analytics.rs. */
interface BirthdaysAnalytics {
  headline: Headline;
  occasions: { personId: string; name: string; occasion: Occasion; day: string; turning: number | null; gift: "given" | "bought" | "idea" | null }[];
  ready: Compare;
}

const GIFT = { given: "Present given", bought: "Present bought", idea: "Only an idea" } as const;

export const birthdaysAnalytics = defineAnalytics<BirthdaysAnalytics>({
  load: (period) => invoke("birthdays_analytics", periodArgs(period)),
  headline: (r) => ({ label: "Birthdays and anniversaries", value: r.headline, measure: neutral(COUNT) }),
  Section: ({ report: r, period }) => {
    const past = r.occasions.filter((o) => o.day <= period.today);
    return (
      <>
        <Metrics>
          <Metric label="Birthdays and anniversaries" value={r.headline} measure={neutral(COUNT)} period={period} />
          <Metric label="With a present ready" value={r.ready} measure={COUNT} period={period} note={past.length ? `Of the ${past.length} so far` : "None yet"} />
        </Metrics>
        <ChartCard title="Occasions" note="And how ready the presents were">
          {r.occasions.length ? (
            <ul className="analytics-list">
              {r.occasions.map((o) => {
                const been = o.day <= period.today;
                const years = o.turning === null ? null : o.occasion === "anniversary" ? `${o.turning} ${o.turning === 1 ? "year" : "years"}` : `${been ? "turned" : "turns"} ${o.turning}`;
                return (
                  <li key={`${o.personId}-${o.day}`}>
                    <span aria-hidden="true">{emojiOf(o.occasion)}</span>
                    <span className="analytics-list-main">
                      {o.name}
                      {years && <span className="dim"> · {years}</span>}
                    </span>
                    <span className={`analytics-tag${o.gift === "given" || o.gift === "bought" ? " is-good" : been && !o.gift ? " is-bad" : ""}`}>{o.gift ? GIFT[o.gift] : "No present"}</span>
                    <span className="dim">{mediumDay(o.day)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ChartEmpty>Nobody's birthday or anniversary falls in this {period.unit}.</ChartEmpty>
          )}
        </ChartCard>
      </>
    );
  },
});
