import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { adminAiUsage, type AdminAiUsage, type AiUsageDay, type AiUsageTotals } from "../../lib/account";
import { addDays } from "../../features/daily_plan/time";
import type { Period } from "../analytics/period";
import { ErrorNote, useAction } from "../account/fields";
import { ago } from "../format";
import { Avatar } from "../ui/Avatar";
import { BarList, ChartCard, ChartEmpty, DayBars, Sparkline } from "../ui/charts/Charts";
import { Panel } from "../ui/Panel";
import { useNow } from "../useSync";

const PERIODS = [7, 30, 90] as const;

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();
const count = (n: number) => (n < 10_000 ? whole.format(n) : compact.format(n));

const tokens = (t: AiUsageTotals) => t.input_tokens + t.output_tokens;

/** The admin panel's view of Lemma's AI: how much each person uses, so
 * allowances can be set from what people really do. */
export function AdminAiUsage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [usage, setUsage] = useState<AdminAiUsage | null>(null);
  const { busy, error, run } = useAction();
  const now = useNow();

  useEffect(() => {
    void run(async () => setUsage(await adminAiUsage(days)));
    // `run` is recreated each render; loading on a new period is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const picker = (
    <div className="pb-segmented admin-usage-period" role="radiogroup" aria-label="Period">
      {PERIODS.map((d) => (
        <button key={d} role="radio" aria-checked={days === d} className={days === d ? "is-active" : undefined} onClick={() => setDays(d)}>
          {d} days
        </button>
      ))}
    </div>
  );

  if (!usage) {
    return (
      <Panel title="AI usage" actions={picker}>
        <ErrorNote error={error} />
        <p className="dim">{busy ? "Loading…" : "Couldn't load the AI usage."}</p>
      </Panel>
    );
  }

  const total = usage.daily.reduce<AiUsageTotals>(
    (sum, d) => ({
      prompts: sum.prompts + d.prompts,
      calls: sum.calls + d.calls,
      input_tokens: sum.input_tokens + d.input_tokens,
      cached_tokens: sum.cached_tokens + d.cached_tokens,
      output_tokens: sum.output_tokens + d.output_tokens,
      transcriptions: sum.transcriptions + d.transcriptions,
      failures: sum.failures + d.failures,
    }),
    { prompts: 0, calls: 0, input_tokens: 0, cached_tokens: 0, output_tokens: 0, transcriptions: 0, failures: 0 },
  );
  const last = usage.daily[usage.daily.length - 1].day;
  // The days as the charts take them; days are UTC, as the server counts them.
  const period: Period = { unit: usage.days <= 7 ? "week" : "month", start: usage.daily[0].day, end: addDays(last, 1), today: last };
  const failRate = total.calls ? Math.round((total.failures / total.calls) * 100) : 0;

  /** A person's tokens on every day of the period, for their trend. */
  const trend = (daily: AiUsageDay[]) => {
    const byDay = new Map(daily.map((d) => [d.day, tokens(d)]));
    return usage.daily.map((d) => byDay.get(d.day) ?? 0);
  };

  return (
    <>
      <Panel
        title="AI usage"
        meta={
          usage.daily_limit === null
            ? "No limits: counts only, what people ask is never kept"
            : `Brake on: ${whole.format(usage.daily_limit)} calls a day across everyone`
        }
        actions={picker}
      >
        <ErrorNote error={error} />
        <div className="chart-metrics">
          <Figure label="Questions" value={count(total.prompts)} note={`${count(total.calls)} AI calls`} />
          <Figure label="Tokens" value={count(tokens(total))} note={`${count(total.output_tokens)} written`} />
          <Figure label="Failed calls" value={count(total.failures)} note={total.calls ? `${failRate}% of calls` : "None yet"} bad={total.failures > 0} />
          <Figure label="Recordings" value={count(total.transcriptions)} note="Spoken to Lemma" />
        </div>
      </Panel>

      <div className="admin-usage-charts">
        <ChartCard title="Questions each day" note="Each step Lemma takes is another AI call">
          {total.prompts ? (
            <DayBars period={period} series={[{ label: "Questions", values: usage.daily.map((d) => d.prompts) }]} format={count} label="Questions asked each day" />
          ) : (
            <ChartEmpty>Nobody has asked Lemma anything in these {usage.days} days.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard title="Tokens each day" note="What the AI read, and what it wrote">
          {tokens(total) ? (
            <DayBars
              period={period}
              mode="stack"
              series={[
                { label: "Read", values: usage.daily.map((d) => d.input_tokens) },
                { label: "Written", values: usage.daily.map((d) => d.output_tokens), tone: "soft" },
              ]}
              format={count}
              axisFormat={(n) => compact.format(n)}
              least={1000}
              label="Tokens the AI read and wrote each day"
            />
          ) : (
            <ChartEmpty>No tokens used yet.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard title="Who uses it most" note="By tokens" wide>
          {usage.people.length ? (
            <BarList
              format={count}
              rows={usage.people.slice(0, 10).map((p) => ({
                key: p.id,
                name: p.display_name || p.email,
                value: tokens(p),
                text: `${count(tokens(p))} tokens`,
                note: `${count(p.prompts)} ${p.prompts === 1 ? "question" : "questions"}`,
              }))}
            />
          ) : (
            <ChartEmpty>Nobody yet.</ChartEmpty>
          )}
        </ChartCard>
      </div>

      <Panel title="By person" meta={`${usage.people.length} used Lemma in the last ${usage.days} days`}>
        <div className="admin-table" role="table" aria-label="AI usage by person">
          <div className="admin-row admin-usage-row admin-row-head" role="row">
            <span role="columnheader">Person</span>
            <span role="columnheader">Questions</span>
            <span role="columnheader">Tokens</span>
            <span role="columnheader">AI calls</span>
            <span role="columnheader">Failed</span>
            <span role="columnheader">Trend</span>
          </div>
          {usage.people.map((p) => (
            <div key={p.id} className="admin-row admin-usage-row" role="row">
              <span className="admin-person" role="cell">
                <Avatar email={p.email} profile={{ displayName: p.display_name, avatar: null }} size={30} />
                <span className="admin-person-text">
                  <span className="admin-person-name">{p.display_name || p.email.split("@")[0]}</span>
                  <span className="admin-person-meta" title={p.email}>
                    {p.email}
                    {p.last_used_at && ` · used ${ago(p.last_used_at, now)}`}
                  </span>
                  {p.last_error && (
                    <span className="admin-usage-error" title={p.last_error}>
                      <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" /> Last failure: {p.last_error}
                    </span>
                  )}
                </span>
              </span>
              <span role="cell">{count(p.prompts)}</span>
              <span role="cell" title={`${whole.format(p.input_tokens)} read (${whole.format(p.cached_tokens)} kept from before), ${whole.format(p.output_tokens)} written`}>
                {count(tokens(p))}
              </span>
              <span role="cell">{count(p.calls)}</span>
              <span role="cell" className={p.failures ? "admin-usage-bad" : "dim"}>
                {p.failures ? `${count(p.failures)} (${Math.round((p.failures / Math.max(1, p.calls)) * 100)}%)` : "None"}
              </span>
              <span role="cell" className="admin-usage-trend">
                <Sparkline values={trend(p.daily)} label={`${p.email}'s tokens each day`} />
              </span>
            </div>
          ))}
          {usage.people.length === 0 && <p className="dim admin-none">Nobody has used Lemma in these {usage.days} days.</p>}
        </div>
      </Panel>
    </>
  );
}

function Figure({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) {
  return (
    <div className="chart-metric">
      <div className="chart-metric-value">{value}</div>
      <div className="chart-metric-label">{label}</div>
      <span className={`chart-delta ${bad ? "is-bad" : "is-none"}`}>
        {bad && <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />} {note}
      </span>
    </div>
  );
}
