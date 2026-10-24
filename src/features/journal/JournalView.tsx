import { useEffect, useState } from "react";
import { Download, Flame, PenLine, Plus, Search, Shuffle, X } from "lucide-react";
import { VaultLockBanner } from "../../shell/account/Encryption";
import { today } from "../daily_plan/time";
import { api, errorMessage } from "./api";
import { EntryPage } from "./EntryPage";
import { exportJournal } from "./exportJournal";
import { CalendarPage, InsightsPage } from "./Pages";
import { EntryList, Memories, newEntry } from "./parts";
import { PAGES, setJournalUi, useDayEntries, useEntries, useJournalStats, useJournalUi, type JournalPage } from "./journalUi";

const LABELS: Record<JournalPage, string> = { journal: "Journal", calendar: "Calendar", insights: "Insights" };

/** The Journal: a page a day, with mood, prompts, memories and insights. */
export function JournalView() {
  const ui = useJournalUi();
  const prompts = usePrompts();
  const [note, setNote] = useState<string | null>(null);

  const exportAll = () => {
    setNote("Exporting…");
    exportJournal().then((path) => setNote(`Saved to ${path}`), (err) => setNote(errorMessage(err)));
  };

  return (
    <div className="jr-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Journal">
          {PAGES.map((p) => (
            <button key={p} className={`pb-tab${ui.page === p ? " is-active" : ""}`} onClick={() => setJournalUi({ page: p })}>
              {LABELS[p]}
            </button>
          ))}
        </nav>
        {note && (
          <span className="jr-note dim" title={note}>
            {note}
          </span>
        )}
        <button className="btn btn-sm btn-ghost" onClick={exportAll} title="Save every entry as one Markdown file in Downloads">
          <Download size={14} strokeWidth={1.75} /> Export
        </button>
        <button className="btn btn-sm" onClick={() => newEntry(today(), "")}>
          <Plus size={14} strokeWidth={1.75} /> New entry
        </button>
      </header>
      <div className="jr-banner">
        <VaultLockBanner subject="journal entries" />
      </div>
      {ui.page === "journal" && <JournalPageView prompts={prompts} />}
      {ui.page === "calendar" && <CalendarPage />}
      {ui.page === "insights" && <InsightsPage />}
    </div>
  );
}

function usePrompts(): { all: string[]; today: string } {
  const [prompts, setPrompts] = useState<{ all: string[]; today: string }>({ all: [], today: "" });
  useEffect(() => {
    api.prompts(today()).then(([all, todays]) => setPrompts({ all, today: todays }), () => {});
  }, []);
  return prompts;
}

/** The timeline beside the open entry (or today's page). */
function JournalPageView({ prompts }: { prompts: { all: string[]; today: string } }) {
  const ui = useJournalUi();
  const [search, setSearch] = useState(ui.search);
  // Search as you type, after a pause.
  useEffect(() => {
    const t = window.setTimeout(() => setJournalUi({ search }), 250);
    return () => window.clearTimeout(t);
  }, [search]);
  const { data: entries, error } = useEntries({ search: ui.search || null, tag: ui.tag });

  return (
    <div className="jr-split">
      <aside className="jr-timeline">
        <div className="jr-search">
          <Search size={14} strokeWidth={1.75} />
          <input value={search} placeholder="Search your journal" onChange={(e) => setSearch(e.currentTarget.value)} aria-label="Search your journal" />
          {search && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {ui.tag && (
          <div className="jr-filter">
            Tagged <b>#{ui.tag}</b>
            <button className="icon-btn" aria-label="Show all entries" onClick={() => setJournalUi({ tag: null })}>
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <button className={`jr-today-link${ui.entry === null ? " is-active" : ""}`} onClick={() => setJournalUi({ entry: null })}>
          <PenLine size={14} strokeWidth={1.75} /> Today
        </button>
        {error && <p className="jr-error">{error}</p>}
        {entries && <EntryList entries={entries} open={ui.entry} empty={ui.search || ui.tag ? "Nothing matches." : "Your entries will appear here."} />}
      </aside>
      <main className="jr-main">
        {ui.entry ? <EntryPage key={ui.entry} id={ui.entry} prompts={prompts.all} /> : <Today prompts={prompts} />}
      </main>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Today's page: the day's prompt, the streak, and memories from this day in
 * years gone by. */
function Today({ prompts }: { prompts: { all: string[]; today: string } }) {
  const { data: stats } = useJournalStats();
  const written = useDayEntries(today()).data ?? [];
  const [prompt, setPrompt] = useState<string | null>(null);
  const shown = prompt ?? prompts.today;

  const shuffle = () => {
    const others = prompts.all.filter((p) => p !== shown);
    if (others.length) setPrompt(others[Math.floor(Math.random() * others.length)]);
  };

  return (
    <div className="jr-today">
      <section className="jr-hero">
        <p className="jr-kicker">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1>{greeting()}</h1>
        {stats && stats.streak > 0 && (
          <p className="jr-streak">
            <Flame size={14} strokeWidth={1.75} />
            {stats.streak} {stats.streak === 1 ? "day" : "days"} in a row{stats.writtenToday ? "" : ". Write today to keep it going"}
          </p>
        )}
        {shown && (
          <div className="jr-hero-prompt">
            <p>{shown}</p>
            <button className="icon-btn" title="Another prompt" aria-label="Another prompt" onClick={shuffle}>
              <Shuffle size={15} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="jr-hero-actions">
          <button className="btn" onClick={() => newEntry(today(), shown)}>
            <PenLine size={14} strokeWidth={1.75} /> {written.length ? "Write another entry" : "Start writing"}
          </button>
          <button className="btn btn-ghost" onClick={() => newEntry(today(), "")}>
            Free write
          </button>
        </div>
        {written.length > 0 && (
          <div className="jr-written">
            <span className="jr-feel-label">Written today</span>
            <EntryList entries={written} open={null} compact />
          </div>
        )}
      </section>
      {stats && stats.onThisDay.length > 0 && <Memories memories={stats.onThisDay} />}
    </div>
  );
}
