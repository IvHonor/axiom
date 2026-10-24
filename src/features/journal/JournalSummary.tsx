import { useEffect, useState } from "react";
import { Check, Flame } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { today } from "../daily_plan/time";
import { api, errorMessage, titleOf } from "./api";
import { setJournalUi, useJournalStats } from "./journalUi";
import { newEntry } from "./parts";
import "./summary.css";

/** Fit to the measured body, including when the dashboard itself changes width. */
export function JournalSummary({ onOpen }: { onOpen: () => void }) {
  const { width, height } = useTileLayout();
  const { data: stats, error } = useJournalStats();
  const [prompt, setPrompt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    api.prompts(today()).then(([, p]) => { if (active) setPrompt(p); }, () => {});
    return () => { active = false; };
  }, []);
  const compact = height < 125;
  const roomy = height >= 290 && width >= 200;
  const open = (page: "journal" | "insights" = "journal", entry: string | null = null) => {
    setJournalUi({ page, entry, search: "", tag: null }); onOpen();
  };
  if (!stats) return <button className="jt-status" onClick={() => open()}>{error ? "Journal unavailable. Open journal" : "Loading journal…"}</button>;
  const memories = stats.onThisDay.slice(0, Math.max(1, Math.min(4, Math.floor((height - 250) / 64))));
  return <div className="jt-summary" data-compact={compact} data-roomy={roomy} data-narrow={width < 150}>
    <button className="jt-main" disabled={creating} title={stats.writtenToday ? "Continue today's journal" : prompt || "What's on your mind?"}
      onClick={async () => {
        if (stats.writtenToday) { open(); return; }
        setCreating(true);
        try { await newEntry(today(), prompt); onOpen(); }
        catch (err) { setActionError(errorMessage(err)); }
        finally { setCreating(false); }
      }}>
      {stats.writtenToday ? <span className="jt-done"><Check size={15} />Written today</span> : <span className="jt-eyebrow">Today's prompt</span>}
      <b className="jt-prompt">{stats.writtenToday ? "A little space for your thoughts." : prompt || "What's on your mind?"}</b>
      {!compact && <span className="jt-hint">{creating ? "Creating entry…" : stats.writtenToday ? "Continue reflecting →" : "Start writing →"}</span>}
    </button>
    {height >= 190 && width >= 150 && <div className="jt-metrics">
      <button onClick={() => open("insights")}><strong>{stats.entries.toLocaleString()}</strong><span>Entries</span></button>
      {width >= 230 && <button onClick={() => open("insights")}><strong>{stats.words.toLocaleString()}</strong><span>Words written</span></button>}
      <button onClick={() => open("insights")}><strong>{stats.longestStreak.toLocaleString()}</strong><span>Best streak</span></button>
    </div>}
    {roomy && <section className="jt-memories"><span className="jt-eyebrow">On this day</span>
      {memories.length ? memories.map(memory => <button key={memory.entry.id} onClick={() => open("journal", memory.entry.id)} title={titleOf(memory.entry, "Untitled entry")}>
        <small>{memory.yearsAgo} {memory.yearsAgo === 1 ? "year" : "years"} ago</small><b>{titleOf(memory.entry, "Untitled entry")}</b>
        {height >= 450 && <span>{memory.entry.excerpt}</span>}
      </button>) : <p className="dim">Your reflections will find their way back here in years to come.</p>}
    </section>}
    {(actionError || error) && <p className="jt-notice" role="alert" title={actionError || error || ""}>{actionError || "Updates unavailable"}</p>}
    {!compact && <footer className="jt-footer"><span className="jt-streak"><Flame size={13} />{stats.streak.toLocaleString()} {stats.streak === 1 ? "day" : "days"}</span>
      {!roomy && stats.onThisDay[0] && width >= 220 && <button onClick={() => open("journal", stats.onThisDay[0].entry.id)}>On this day →</button>}
      {roomy && <button onClick={() => open("insights")}>Insights →</button>}
    </footer>}
  </div>;
}

