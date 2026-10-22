import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BarChart3, BookPlus, Flame, NotebookPen } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { useDataChanged } from "../../lib/sync";
import { Section } from "../../shell/ui/Section";
import { today } from "../daily_plan/time";
import { api, errorMessage, STATUSES, type BookCard, type ReadingSummary } from "./api";
import { Cover, Progress } from "./Cover";
import { readingChanged, setReadingUi, showPage, useReadingUi, type ReadingPage } from "./readingUi";

/** The Reading Tracker's side panel: what you're reading (with a quick page
 * update), your shelves, and the year's goal. */
export function ReadingSidebar({ active, onOpen }: AreaSidebarProps) {
  const { page, book, revision } = useReadingUi();
  const [summary, setSummary] = useState<ReadingSummary | null>(null);

  const load = useCallback(() => {
    api.summary(today()).then(setSummary, () => setSummary(null));
  }, []);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  const go = (next: ReadingPage) => {
    showPage(next);
    onOpen();
  };
  const navItem = (id: ReadingPage, label: string, count?: number, icon?: React.ReactNode) => (
    <button key={id} className={`nav-item${active && page === id && !book ? " is-active" : ""}`} onClick={() => go(id)}>
      {icon}
      <span className="bs-name">{label}</span>
      {count !== undefined && count > 0 && <span className="rd-count">{count}</span>}
    </button>
  );

  return (
    <>
      <Section title="Reading now" count={summary?.reading.length}>
        <div className="rs-reading">
          {summary?.reading.map((b) => (
            <QuickUpdate
              key={b.id}
              book={b}
              onOpen={() => {
                setReadingUi({ book: b.id });
                onOpen();
              }}
            />
          ))}
          {summary && summary.reading.length === 0 && <p className="bs-hint">Nothing on the go right now.</p>}
          <button
            className="btn btn-sm btn-ghost rs-add"
            onClick={() => {
              setReadingUi({ adding: true });
              onOpen();
            }}
          >
            <BookPlus size={14} strokeWidth={1.75} /> Add a book
          </button>
        </div>
      </Section>

      <Section title="Shelves">
        {STATUSES.map((s) => navItem(s.id, s.label, summary?.shelves[s.id]))}
        {navItem("all", "All books")}
        {navItem("stats", "Stats", undefined, <BarChart3 size={14} strokeWidth={1.5} />)}
        {navItem("notes", "Notes", undefined, <NotebookPen size={14} strokeWidth={1.5} />)}
      </Section>

      {summary && (
        <Section title={`${summary.goal.year}`}>
          <div className="rs-goal">
            {summary.goal.books ? (
              <>
                <span>
                  <b>{summary.goal.finished}</b> of {summary.goal.books} books
                </span>
                <Progress percent={Math.min(100, (summary.goal.finished / summary.goal.books) * 100)} label="Reading goal" />
              </>
            ) : (
              <button className="btn btn-sm btn-ghost" onClick={() => go("stats")}>
                Set a reading goal
              </button>
            )}
            {summary.streak > 0 && (
              <span className="rs-streak">
                <Flame size={13} strokeWidth={1.75} /> {summary.streak} day{summary.streak === 1 ? "" : "s"} in a row
                {summary.pagesToday > 0 && <span className="dim"> · {summary.pagesToday} pages today</span>}
              </span>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/** A book you're reading, with "I'm on page …" right there. */
function QuickUpdate({ book, onOpen }: { book: BookCard; onOpen: () => void }) {
  const [value, setValue] = useState(String(book.progress));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(String(book.progress)), [book.progress]);
  const unit = book.unit === "percent" ? "%" : book.unit === "minutes" ? "min" : book.total ? `/ ${book.total}` : "";

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n) || n === book.progress) return;
    try {
      await api.logProgress(book.id, n, null, today());
      setError(null);
      readingChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="rs-book">
      <button className="rs-book-open" onClick={onOpen} title={`Open ${book.title}`}>
        <Cover url={book.coverUrl} title={book.title} size="sm" />
      </button>
      <div className="rs-book-body">
        <button className="rs-book-title" onClick={onOpen}>
          {book.title}
        </button>
        <Progress percent={book.percent} label={`${book.title} progress`} />
        <form className="rs-book-form" onSubmit={save}>
          <span className="dim">{book.unit === "pages" ? "p." : book.unit === "minutes" ? "at" : ""}</span>
          <input className="rd-num" inputMode="numeric" value={value} aria-label={`Where you are in ${book.title}`} onChange={(e) => setValue(e.currentTarget.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
          <span className="dim">{unit}</span>
        </form>
        {error && <span className="rd-error">{error}</span>}
      </div>
    </div>
  );
}
