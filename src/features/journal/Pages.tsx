import { useMemo, useState } from "react";
import { Flame, PenLine } from "lucide-react";
import { addDays, addMonths, longDay, mondayOf, monthName, monthOf, today } from "../daily_plan/time";
import { ENERGY, MOODS, type JournalStats } from "./api";
import { setJournalUi, useDayEntries, useJournalStats } from "./journalUi";
import { EntryList, moodColor, newEntry } from "./parts";

const WEEKS = 53;

type Mark = JournalStats["calendar"][number];

/** How dark a day is by what was written: nothing, a few lines, a page, more. */
function wordLevel(words: number): number {
  return words === 0 ? 0 : words < 100 ? 1 : words < 300 ? 2 : words < 600 ? 3 : 4;
}

/** A year of days, a column a week, coloured by words written or by mood;
 * pick one to see (or write) its entries. */
export function CalendarPage() {
  const { data: stats, error } = useJournalStats();
  const [colour, setColour] = useState<"words" | "mood">("words");
  const [picked, setPicked] = useState(today());
  const marks = useMemo(() => new Map((stats?.calendar ?? []).map((m) => [m.day, m])), [stats]);

  const now = today();
  const first = mondayOf(addDays(now, -7 * (WEEKS - 1)));
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));

  if (error) return <p className="jr-error jr-pad">{error}</p>;
  return (
    <div className="jr-page">
      <section className="jr-panel">
        <header className="jr-panel-head">
          <h2>Your year</h2>
          <span className="dim">{stats ? `${stats.calendar.length} ${stats.calendar.length === 1 ? "day" : "days"} written in the last year` : ""}</span>
          <span className="jr-grow" />
          <div className="jr-seg" role="radiogroup" aria-label="Colour by">
            {(["words", "mood"] as const).map((c) => (
              <button key={c} role="radio" aria-checked={colour === c} className={colour === c ? "is-on" : ""} onClick={() => setColour(c)}>
                {c === "words" ? "Words" : "Mood"}
              </button>
            ))}
          </div>
        </header>
        <div className="jr-heat-scroll">
          <div className="jr-heat" style={{ gridTemplateColumns: `24px repeat(${WEEKS}, 1fr)` }}>
            <span />
            {weeks.map((week, w) => {
              const startsMonth = w === 0 || week.some((d) => d.endsWith("-01"));
              const label = week.find((d) => d.endsWith("-01")) ?? week[0];
              return (
                <span key={w} className="jr-heat-month">
                  {startsMonth ? monthName(label, false).slice(0, 3) : ""}
                </span>
              );
            })}
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <Row key={d} weekday={d} weeks={weeks} marks={marks} colour={colour} now={now} picked={picked} onPick={setPicked} />
            ))}
          </div>
        </div>
        <Legend colour={colour} />
      </section>
      <DayEntries day={picked} />
    </div>
  );
}

function Row({ weekday, weeks, marks, colour, now, picked, onPick }: { weekday: number; weeks: string[][]; marks: Map<string, Mark>; colour: "words" | "mood"; now: string; picked: string; onPick: (day: string) => void }) {
  return (
    <>
      <span className="jr-heat-day">{weekday % 2 === 0 ? ["Mon", "", "Wed", "", "Fri", "", "Sun"][weekday] : ""}</span>
      {weeks.map((week) => {
        const day = week[weekday];
        if (day > now) return <span key={day} />;
        const mark = marks.get(day);
        const style =
          mark && colour === "mood" && mark.mood !== null
            ? { background: moodColor(mark.mood) }
            : mark
              ? { background: `color-mix(in srgb, var(--area-journal) ${[0, 30, 55, 78, 100][wordLevel(mark.words)]}%, var(--hover))` }
              : undefined;
        const label = `${longDay(day)}: ${mark ? `${mark.words} words${mark.mood ? `, ${MOODS[mark.mood - 1].label.toLowerCase()}` : ""}` : "nothing written"}`;
        return (
          <button
            key={day}
            className={`jr-heat-cell${day === picked ? " is-picked" : ""}${day === now ? " is-today" : ""}`}
            style={style}
            title={label}
            aria-label={label}
            onClick={() => onPick(day)}
          />
        );
      })}
    </>
  );
}

function Legend({ colour }: { colour: "words" | "mood" }) {
  if (colour === "mood") {
    return (
      <div className="jr-legend">
        {MOODS.map((m) => (
          <span key={m.value}>
            <i style={{ background: moodColor(m.value) }} /> {m.label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="jr-legend">
      <span>Fewer words</span>
      {[0, 30, 55, 78, 100].map((p) => (
        <i key={p} style={{ background: p ? `color-mix(in srgb, var(--area-journal) ${p}%, var(--hover))` : "var(--hover)" }} />
      ))}
      <span>More</span>
    </div>
  );
}

function DayEntries({ day }: { day: string }) {
  const { data: entries } = useDayEntries(day);
  return (
    <section className="jr-panel">
      <header className="jr-panel-head">
        <h2>{longDay(day)}</h2>
        <span className="jr-grow" />
        <button className="btn btn-sm" onClick={() => newEntry(day, "")}>
          <PenLine size={14} strokeWidth={1.75} /> Write for this day
        </button>
      </header>
      {entries && <EntryList entries={entries} open={null} empty="Nothing written this day." compact />}
    </section>
  );
}

/** Streaks, totals, mood and energy, how much you write and what about. */
export function InsightsPage() {
  const { data: stats, error } = useJournalStats();
  if (error) return <p className="jr-error jr-pad">{error}</p>;
  if (!stats) return <p className="dim jr-pad">Loading…</p>;
  if (!stats.entries) {
    return (
      <div className="jr-page">
        <p className="dim jr-empty">Write a few entries and your insights will grow here: streaks, mood over time, and what you write about most.</p>
      </div>
    );
  }

  const now = today();
  const mood = stats.averageMood;
  const energy = stats.averageEnergy;
  const written = stats.calendar.reduce((s, m) => s + m.entries, 0);
  const marks = new Map(stats.calendar.map((m) => [m.day, m]));
  const month = Array.from({ length: 30 }, (_, i) => addDays(now, i - 29));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(now, i - 11));
  const perMonth = months.map((m) => stats.calendar.filter((c) => monthOf(c.day) === m).reduce((s, c) => s + c.words, 0));
  const most = Math.max(1, ...perMonth);
  const topTag = Math.max(1, ...stats.tags.map((t) => t.count));

  return (
    <div className="jr-page">
      <div className="jr-tiles">
        <Tile label="Current streak" value={`${stats.streak} ${stats.streak === 1 ? "day" : "days"}`} icon={stats.streak > 0} />
        <Tile label="Longest streak" value={`${stats.longestStreak} ${stats.longestStreak === 1 ? "day" : "days"}`} />
        <Tile label="Entries" value={stats.entries.toLocaleString()} />
        <Tile label="Words" value={stats.words.toLocaleString()} sub={`about ${Math.round(stats.words / Math.max(1, stats.entries)).toLocaleString()} an entry`} />
        <Tile label="Mood, last 30 days" value={mood === null ? "–" : `${MOODS[Math.round(mood) - 1].emoji} ${MOODS[Math.round(mood) - 1].label}`} sub={mood === null ? "Tap a mood on an entry" : `${mood.toFixed(1)} out of 5`} />
        <Tile label="Energy, last 30 days" value={energy === null ? "–" : ENERGY[Math.round(energy) - 1].label} sub={energy === null ? "Rate energy on an entry" : `${energy.toFixed(1)} out of 5`} />
      </div>

      <section className="jr-panel">
        <header className="jr-panel-head">
          <h2>Mood, last 30 days</h2>
        </header>
        <div className="jr-mood-strip">
          {month.map((d) => {
            const m = marks.get(d);
            return (
              <span
                key={d}
                className={`jr-mood-cell${m ? "" : " is-blank"}`}
                style={m?.mood ? { background: moodColor(m.mood) } : undefined}
                title={`${longDay(d)}: ${m ? (m.mood ? MOODS[m.mood - 1].label : "no mood") : "nothing written"}`}
              >
                {m?.mood ? MOODS[m.mood - 1].emoji : ""}
              </span>
            );
          })}
        </div>
      </section>

      <div className="jr-pair">
        <section className="jr-panel">
          <header className="jr-panel-head">
            <h2>Words a month</h2>
            <span className="dim">{written} entries this year</span>
          </header>
          <div className="jr-bars">
            {months.map((m, i) => (
              <div key={m} className="jr-bar" title={`${monthName(m)}: ${perMonth[i].toLocaleString()} words`}>
                <span className="jr-bar-fill" style={{ height: `${(perMonth[i] / most) * 100}%` }} />
                <span className="jr-bar-label">{monthName(m, false).slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="jr-panel">
          <header className="jr-panel-head">
            <h2>What you write about</h2>
          </header>
          {stats.tags.length === 0 ? (
            <p className="dim">Tag entries (#uni, #family, #gym) to see what comes up most.</p>
          ) : (
            <div className="jr-tag-bars">
              {stats.tags.slice(0, 10).map((t) => (
                <button key={t.tag} className="jr-tag-bar" onClick={() => setJournalUi({ page: "journal", tag: t.tag, entry: null })}>
                  <span className="jr-tag-bar-name">#{t.tag}</span>
                  <span className="jr-tag-bar-track">
                    <span style={{ width: `${(t.count / topTag) * 100}%` }} />
                  </span>
                  <span className="dim">{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: boolean }) {
  return (
    <div className="jr-tile">
      <span className="jr-feel-label">{label}</span>
      <b>
        {icon && <Flame size={16} strokeWidth={1.75} />}
        {value}
      </b>
      {sub && <span className="dim">{sub}</span>}
    </div>
  );
}
