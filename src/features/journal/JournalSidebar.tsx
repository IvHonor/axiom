import { BarChart3, CalendarDays, Flame, NotebookPen, PenLine } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { today } from "../daily_plan/time";
import { setJournalUi, useJournalStats, useJournalUi, type JournalPage } from "./journalUi";
import { newEntry } from "./parts";

/** The Journal's side panel: its pages, writing today, and tags. */
export function JournalSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useJournalUi();
  const { data: stats } = useJournalStats();
  const go = (page: JournalPage, change: Parameters<typeof setJournalUi>[0] = {}) => {
    setJournalUi({ page, ...change });
    onOpen();
  };
  const nav = (page: JournalPage, label: string, Icon: typeof PenLine) => (
    <button key={page} className={`nav-item${active && ui.page === page ? " is-active" : ""}`} onClick={() => go(page, page === "journal" ? { entry: null } : {})}>
      <Icon size={14} strokeWidth={1.5} />
      <span className="bs-name">{label}</span>
    </button>
  );

  return (
    <>
      <Section title="Journal">
        {nav("journal", "Today", NotebookPen)}
        {nav("calendar", "Calendar", CalendarDays)}
        {nav("insights", "Insights", BarChart3)}
        <button
          className="nav-item"
          onClick={() => {
            onOpen();
            newEntry(today(), "");
          }}
        >
          <PenLine size={14} strokeWidth={1.5} />
          <span className="bs-name">New entry</span>
        </button>
      </Section>
      {stats && stats.entries > 0 && (
        <Section title="Streak">
          <div className="js-streak">
            <Flame size={15} strokeWidth={1.75} className={stats.streak > 0 ? "is-lit" : ""} />
            <span>
              <b>
                {stats.streak} {stats.streak === 1 ? "day" : "days"}
              </b>
              <span className="dim">{stats.writtenToday ? "Written today" : stats.streak > 0 ? "Write today to keep it going" : `Longest ${stats.longestStreak}`}</span>
            </span>
          </div>
        </Section>
      )}
      {stats && stats.tags.length > 0 && (
        <Section title="Tags" count={stats.tags.length}>
          <div className="js-tags">
            {stats.tags.map((t) => (
              <button key={t.tag} className={`js-tag${ui.tag === t.tag ? " is-active" : ""}`} onClick={() => go("journal", { tag: ui.tag === t.tag ? null : t.tag, entry: null })}>
                #{t.tag} <span className="dim">{t.count}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
