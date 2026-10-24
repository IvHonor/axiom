import { useState, type CSSProperties } from "react";
import { ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Flame, Headphones, Target } from "lucide-react";
import { mediumDay } from "../../daily_plan/time";
import { hours, progressText, type BookCard, type Goal, type ReadingSummary, type ReadingStats } from "../api";
import { Cover } from "../Cover";
import { goalMessage, goalPercent, pageLayout, percent, rowHeight, type Preferences } from "./model";

export function Meter({ value, label }: { value: number | null; label: string }) {
  const safe = percent(value);
  return <span className="rd-ov-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={safe === null ? undefined : Math.round(safe)} aria-valuetext={safe === null ? "Progress unavailable" : undefined}>
    <span style={{ width: `${safe ?? 0}%` }} />
  </span>;
}

export function BookCollection({ books, width, height, prefs, label, open, covers = false, stack = false, empty }: {
  books: BookCard[]; width: number; height: number; prefs: Preferences; label: string;
  open: (id: string) => void; covers?: boolean; stack?: boolean; empty: string;
}) {
  const [requested, setPage] = useState(0);
  const columns = stack ? Math.max(1, Math.floor((width + 12) / 100)) : covers ? Math.max(1, Math.floor((width + 12) / 122)) : width >= 650 ? Math.floor(width / 310) : 1;
  const row = stack ? Math.min(112, height - 28) : covers ? Math.min(height - 28, height < 220 ? 148 : 194)
    : Math.min(rowHeight(prefs, height), Math.max(24, height - (books.length > columns ? 28 : 0)));
  const { count, pages } = pageLayout(books.length, height, row, columns);
  const page = Math.min(requested, pages - 1);
  const start = page * count;
  if (!books.length) return <p className="rd-ov-empty-note">{empty}</p>;
  return <div className={`rd-ov-collection${covers ? " is-covers" : ""}${stack ? " is-stack" : ""}`} aria-label={label}>
    <div className="rd-ov-books" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: row,
      "--shelf-cover-height": `${stack ? Math.min(75, row - 39, (width - 8) * 1.5) : Math.max(36, row - 80)}px` } as CSSProperties}>
      {books.slice(start, start + count).map(book => <button key={book.id} className={`rd-ov-book${row < 44 ? " is-condensed" : ""}`} onClick={() => open(book.id)}
        aria-label={`Open ${book.title}`} title={`${book.title}${book.authors ? ` — ${book.authors}` : ""}\n${progressText(book)}`}>
        {(covers || (prefs.covers && row >= 48)) && <Cover url={book.coverUrl} title={book.title} size="sm" />}
        <span className="rd-ov-copy">
          <strong>{book.title}</strong>
          {(covers || row >= 70) && <span className="rd-ov-author">{book.authors || "Unknown author"}</span>}
          {row >= 44 && <span className="rd-ov-book-meta">{book.status === "finished"
            ? `${book.rating ? `★ ${book.rating / 2} · ` : ""}${book.finishedOn ? mediumDay(book.finishedOn) : "Finished"}`
            : book.status === "want" ? (book.format === "audio" ? (book.audioMinutes ? `${hours(book.audioMinutes)} audio` : "Audiobook")
              : (book.pages ?? book.apiPages) ? `${book.pages ?? book.apiPages} pages` : book.format === "ebook" ? "Ebook" : "Print book")
              : progressText(book)}</span>}
          {book.status === "reading" && row >= 44 && <Meter value={book.percent} label={`${book.title} progress`} />}
        </span>
      </button>)}
    </div>
    {pages > 1 && <div className={`rd-ov-pager${width < 120 ? " is-narrow" : ""}`}>
      <span aria-live="polite" aria-label={`${start + 1}–${Math.min(books.length, start + count)} of ${books.length}`}>{width < 120 ? `${page + 1}/${pages}` : `${start + 1}–${Math.min(books.length, start + count)} of ${books.length}`}</span>
      <button className="icon-btn" aria-label={`Previous ${label} page`} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
      <button className="icon-btn" aria-label={`Next ${label} page`} disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
    </div>}
  </div>;
}

export function FeaturedBook({ book, width, height, open }: { book: BookCard; width: number; height: number; open: (id: string) => void }) {
  const generous = height >= 230;
  const showCover = width >= 210 && height >= 110;
  const coverWidth = Math.min(width >= 400 ? 115 : 80, Math.floor((height - 10) * 2 / 3));
  const value = percent(book.percent);
  return <button className={`rd-ov-feature${generous ? " is-generous" : ""}`} onClick={() => open(book.id)}
    title={`Continue ${book.title}`} aria-label={`Continue ${book.title}`}>
    {showCover && <span className="rd-ov-feature-cover" style={{ "--cover-width": `${coverWidth}px` } as CSSProperties}><Cover url={book.coverUrl} title={book.title} /></span>}
    <span className="rd-ov-feature-copy">
      <small>{book.format === "audio" ? <Headphones size={12} /> : <BookOpen size={12} />} Continue {book.format === "audio" ? "listening" : "reading"}</small>
      <strong>{book.title}</strong>
      {height >= 125 && <span className="rd-ov-author">{book.authors || "Unknown author"}</span>}
      <span className="rd-ov-feature-progress"><span>{progressText(book)}</span>{width >= 250 && value !== null && <b>{Math.round(value)}%</b>}</span>
      <Meter value={book.percent} label={`${book.title} progress`} />
      {height >= 185 && <span className="rd-ov-estimate">{book.finishEstimate ? `At this pace, finish around ${mediumDay(book.finishEstimate)}` : "Log your progress to build a reading pace"}</span>}
      {generous && <span className="rd-ov-feature-action">Open book <ArrowUpRight size={13} /></span>}
    </span>
  </button>;
}

export function GoalCard({ goal, width, height, open }: { goal: Goal; width: number; height: number; open: () => void }) {
  const hasGoal = !!goal.books && goal.books > 0;
  const roomy = height >= 180;
  return <button className={`rd-ov-goal${roomy ? " is-roomy" : ""}`} onClick={open} title="Open reading statistics and goal">
    <span className="rd-ov-kicker"><Target size={13} /> {goal.year} reading goal</span>
    <span className="rd-ov-goal-number"><strong>{goal.finished}</strong>{hasGoal && <span> / {goal.books}</span>}<small>books finished</small></span>
    {hasGoal && <Meter value={goalPercent(goal)} label={`${goal.year} reading goal`} />}
    <span className="rd-ov-goal-message">{goalMessage(goal)}</span>
    {height >= 145 && hasGoal && <span className="rd-ov-author">{Math.max(0, goal.books! - goal.finished)} to go{width >= 240 ? ` · ${goal.expected} expected by today` : ""}</span>}
    {roomy && <span className="rd-ov-goal-action">{hasGoal ? "View your reading year" : "Set your yearly goal"} <ArrowUpRight size={13} /></span>}
  </button>;
}

export function Habit({ summary, compact = false }: { summary: ReadingSummary; compact?: boolean }) {
  return <div className={`rd-ov-habit${compact ? " is-compact" : ""}`}>
    <span><Flame size={14} /><strong>{summary.streak}</strong><small>day{summary.streak === 1 ? "" : "s"} in a row</small></span>
    <span><BookOpen size={14} /><strong>{summary.pagesToday}</strong><small>pages today</small></span>
  </div>;
}

export function ReadingYear({ stats, width, height }: { stats: ReadingStats; width: number; height: number }) {
  const months = Array.from({ length: 12 }, (_, index) => stats.months.find(month => month.month === index + 1) ?? { month: index + 1, books: 0, pages: 0, minutes: 0 });
  const maximum = Math.max(1, ...months.map(month => month.books));
  const chartHeight = Math.max(55, height - (height >= 220 ? 108 : 58));
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return <div className="rd-ov-year">
    <div className="rd-ov-year-stats"><span><strong>{stats.goal.finished}</strong> books in {stats.goal.year}</span><span><strong>{stats.pages.toLocaleString()}</strong> pages</span>{width >= 440 && <span><strong>{stats.readingDays}</strong> reading days</span>}</div>
    <div className="rd-ov-chart" style={{ height: chartHeight }} role="img" aria-label={`${stats.goal.year} books finished by month: ${months.map((month, i) => `${names[i]} ${month.books}`).join(", ")}`}>
      {months.map((month, i) => <span className="rd-ov-month" key={month.month} title={`${names[i]}: ${month.books} books · ${month.pages} pages`}>
        <span className="rd-ov-month-track"><span style={{ height: `${month.books / maximum * 100}%` }} /></span><small>{names[i]}</small>
      </span>)}
    </div>
    {height >= 220 && <div className="rd-ov-year-detail"><span>{stats.pagesPerDay.toLocaleString(undefined, { maximumFractionDigits: 1 })} pages/day · last 30 days</span><span>{stats.longestStreak} day longest streak</span></div>}
  </div>;
}
