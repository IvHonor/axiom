import { History } from "lucide-react";
import { mediumDay, monthName } from "../daily_plan/time";
import { api, moodOf, titleOf, type EntryCard, type JournalStats } from "./api";
import { journalChanged, setJournalUi } from "./journalUi";

/** Starts an entry for a day and opens it. */
export async function newEntry(day: string, prompt: string) {
  const entry = await api.create(day, prompt);
  setJournalUi({ page: "journal", entry: entry.id, search: "", tag: null });
  journalChanged();
}

export const openEntry = (id: string) => setJournalUi({ page: "journal", entry: id });

/** Entries newest first, under a heading for each month. */
export function EntryList({ entries, open, empty, compact }: { entries: EntryCard[]; open: string | null; empty?: string; compact?: boolean }) {
  if (!entries.length) return empty ? <p className="dim jr-empty">{empty}</p> : null;
  if (compact) return <div className="jr-cards">{entries.map((e) => <Card key={e.id} entry={e} open={open === e.id} />)}</div>;
  const months: { month: string; entries: EntryCard[] }[] = [];
  for (const e of entries) {
    const month = e.day.slice(0, 7);
    if (months[months.length - 1]?.month !== month) months.push({ month, entries: [] });
    months[months.length - 1].entries.push(e);
  }
  return (
    <div className="jr-months">
      {months.map((m) => (
        <section key={m.month}>
          <h4 className="jr-month">{monthName(`${m.month}-01`)}</h4>
          <div className="jr-cards">
            {m.entries.map((e) => (
              <Card key={e.id} entry={e} open={open === e.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({ entry, open }: { entry: EntryCard; open: boolean }) {
  const mood = moodOf(entry.mood);
  const title = titleOf(entry, "Untitled");
  const rest = entry.title.trim() ? entry.excerpt : entry.excerpt.split("\n").slice(1).join(" ");
  return (
    <button className={`jr-card${open ? " is-active" : ""}`} onClick={() => openEntry(entry.id)}>
      <span className="jr-card-top">
        <span className="jr-card-day">{mediumDay(entry.day)}</span>
        {mood && (
          <span className="jr-card-mood" title={mood.label}>
            {mood.emoji}
          </span>
        )}
      </span>
      <b className="jr-card-title">{entry.words ? title : <span className="dim">Empty entry</span>}</b>
      {rest.trim() && <span className="jr-card-excerpt">{rest}</span>}
      {entry.tags.length > 0 && <span className="jr-card-tags">{entry.tags.map((t) => `#${t}`).join(" ")}</span>}
    </button>
  );
}

/** Entries from this day in past years. */
export function Memories({ memories }: { memories: JournalStats["onThisDay"] }) {
  return (
    <section className="jr-memories">
      <h3>
        <History size={14} strokeWidth={1.75} /> On this day
      </h3>
      {memories.map((m) => (
        <button key={m.entry.id} className="jr-memory" onClick={() => openEntry(m.entry.id)}>
          <span className="jr-kicker">
            {m.yearsAgo} {m.yearsAgo === 1 ? "year" : "years"} ago {moodOf(m.entry.mood)?.emoji ?? ""}
          </span>
          <b>{titleOf(m.entry, mediumDay(m.entry.day))}</b>
          <span className="jr-card-excerpt">{m.entry.excerpt}</span>
        </button>
      ))}
    </section>
  );
}

/** The colour for a mood, from low (warm) to great (green). */
export function moodColor(mood: number | null): string {
  if (mood === null) return "var(--area-journal)";
  return ["#d0614f", "#df9a4a", "#c9b85a", "#79b46a", "#3f9d6e"][Math.round(mood) - 1] ?? "var(--area-journal)";
}
