import { BookOpen, BookPlus, ArrowUpRight, RefreshCw } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { progressText, type BookCard, STATUSES } from "./api";
import { setReadingUi, type ReadingPage } from "./readingUi";
import { useReadingOverviewData } from "./overview/data";
import { goalMessage, resolveView, rowHeight, sortBooks, VIEWS } from "./overview/model";
import { useReadingPreferences } from "./overview/preferences";
import { BookCollection, FeaturedBook, GoalCard, Habit, Meter, ReadingYear } from "./overview/ReadingOverviewParts";
import "./overview/overview.css";

/** Reading's fitted overview: allocation uses the measured body, never the nominal grid size. */
export function ReadingSummary({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs } = useReadingPreferences(size);
  const view = resolveView(prefs, width, height);
  const needBooks = view === "queue" || view === "finished" || view === "dashboard";
  const data = useReadingOverviewData(width > 0 && height > 0, needBooks, view === "year");
  const open = (page: ReadingPage = "reading", book: string | null = null, adding = false) => {
    setReadingUi({ page, book, adding });
    onOpen();
  };
  const add = () => open("reading", null, true);
  const openBook = (id: string) => open("reading", id);
  const summary = data.summary;
  const notice = data.error ?? data.extraError;

  if (!summary) return <div className="rd-ov-status" role={data.error ? "alert" : "status"}>
    <span title={data.error ?? undefined}>{data.error ? "Couldn't load reading" : "Loading reading…"}</span>
    {data.error && <button className="rd-ov-link" onClick={data.reload}>Retry</button>}
  </div>;
  if (notice && height < 220) return <button className="rd-ov-status" title={notice} onClick={data.reload}><strong>Reading needs a refresh</strong><span className="rd-ov-link">Retry</span></button>;

  const heading = height >= 220 && width >= 190 && !notice;
  const footer = height >= 170 && width >= 170;
  const contentHeight = Math.max(0, height - (heading ? 32 : 0) - (footer ? 32 : 0) - (notice ? 32 : 0));
  const reading = sortBooks(summary.reading, prefs.sort);
  const queue = (data.books ?? []).filter(book => book.status === "want").sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const finished = (data.books ?? []).filter(book => book.status === "finished").sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? "") || a.id.localeCompare(b.id));
  const totalBooks = Object.values(summary.shelves).reduce((sum, count) => sum + count, 0);
  const collection = (books: BookCard[], label: string, available = contentHeight, availableWidth = width, covers = false, empty = "No books on this shelf yet.") =>
    <BookCollection key={`${view}-${label}-${prefs.sort}`} books={books} width={availableWidth} height={available} prefs={prefs} label={label} open={openBook} covers={covers} stack={view === "stack"} empty={empty} />;
  const emptyReading = (available = contentHeight) => <div className={`rd-ov-start${available < 140 ? " is-small" : ""}`}>
    {available >= 175 && <BookOpen size={32} strokeWidth={1.25} />}
    <strong>{totalBooks ? "Your next chapter awaits" : "Make room for a good book"}</strong>
    {available >= 120 && <p>{summary.shelves.want ? `${summary.shelves.want} book${summary.shelves.want === 1 ? "" : "s"} waiting on your shelf.` : "Keep your place, build a habit, and watch your reading grow."}</p>}
    <button className="rd-ov-link" onClick={summary.shelves.want ? () => open("want") : add}>{summary.shelves.want ? "Choose your next book" : "Add your first book"} <ArrowUpRight size={13} /></button>
  </div>;
  const featured = (available: number, availableWidth = width) => reading[0]
    ? <FeaturedBook book={reading[0]} width={availableWidth} height={available} open={openBook} /> : emptyReading(available);
  const goal = (available: number, availableWidth = width) => <GoalCard goal={summary.goal} width={availableWidth} height={available} open={() => open("stats")} />;

  const content = () => {
    if (view === "strip") {
      const count = Math.min(5, Math.floor((width - 70) / 175));
      return reading.length ? <div className="rd-ov-strip" style={{ gridTemplateColumns: `repeat(${Math.min(reading.length, count)}, minmax(0, 1fr))${reading.length > count ? " 60px" : ""}` }}>
        {reading.slice(0, count).map(book => <button key={book.id} onClick={() => openBook(book.id)} title={`${book.title} · ${progressText(book)}`}>
          <strong>{book.title}</strong><span>{progressText(book)}</span><Meter value={book.percent} label={`${book.title} progress`} />
        </button>)}
        {reading.length > count && <button className="rd-ov-strip-more" onClick={() => open()}>+{reading.length - count} more</button>}
      </div> : <div className="rd-ov-glance"><button onClick={add}><strong>Add a book</strong><small>Your reading starts here</small></button></div>;
    }
    if (view === "glance") return <div className="rd-ov-glance">
      <button onClick={reading[0] ? () => openBook(reading[0].id) : summary.shelves.want ? () => open("want") : add} title={reading[0]?.title ?? "Find your next book"}>
        <strong>{reading[0]?.title ?? (summary.shelves.want ? "Pick your next book" : "Add a book")}</strong>
        {height >= 58 && <small>{reading[0] ? `${summary.shelves.reading} on the go` : `${summary.goal.finished} finished this year`}</small>}
      </button>
      {width >= 210 && reading[0] && <span className="rd-ov-glance-percent">{reading[0].percent === null ? "—" : `${Math.round(reading[0].percent)}%`}</span>}
      {height >= 92 && <Meter value={reading[0]?.percent ?? null} label="Current book progress" />}
    </div>;
    if (view === "continue") return <div className="rd-ov-continue">{featured(contentHeight - (contentHeight >= 235 ? 66 : 0))}{contentHeight >= 235 && <Habit summary={summary} />}</div>;
    if (view === "goal") return goal(contentHeight);
    if (view === "reading") return reading.length ? collection(reading, "reading books") : emptyReading();
    if (view === "covers") return reading.length ? collection(reading, "book covers", contentHeight, width, true) : emptyReading();
    if (view === "stack") return reading.length ? collection(reading, "compact covers", contentHeight, width, true)
      : <div className="rd-ov-narrow-empty"><BookOpen size={24} /><button className="rd-ov-link" onClick={summary.shelves.want ? () => open("want") : add}>{summary.shelves.want ? "Next book" : "Add a book"}</button></div>;
    if (view === "queue" || view === "finished") {
      if (!data.books && data.loading) return <div className="rd-ov-status" role="status">Loading your shelves…</div>;
      if (!data.books && data.extraError) return <div className="rd-ov-status">Shelf unavailable <button className="rd-ov-link" onClick={data.reload}>Retry</button></div>;
      const books = view === "queue" ? queue : finished;
      return books.length ? collection(books, view === "queue" ? "next books" : "finished books") : <div className="rd-ov-start is-small"><strong>{view === "queue" ? "A place for your next reads" : "Every finished book belongs here"}</strong><button className="rd-ov-link" onClick={view === "queue" ? add : () => open("finished")}>{view === "queue" ? "Add a book" : "Open finished shelf"} <ArrowUpRight size={13} /></button></div>;
    }
    if (view === "library") return <div className="rd-ov-library">
      <div className="rd-ov-shelves">{STATUSES.map(shelf => <button key={shelf.id} onClick={() => open(shelf.id)}><strong>{summary.shelves[shelf.id]}</strong><span>{shelf.short === "DNF" ? "Put down" : shelf.label}</span></button>)}</div>
      <div className="rd-ov-subheading"><strong>On the go</strong><button className="rd-ov-link" onClick={() => open("all")}>Library <ArrowUpRight size={12} /></button></div>
      <div className="rd-ov-library-list">{reading.length ? collection(reading, "library books", contentHeight - 110) : emptyReading(contentHeight - 110)}</div>
    </div>;
    if (view === "year") return data.stats ? <ReadingYear stats={data.stats} width={width} height={contentHeight} />
      : <div className="rd-ov-status" role="status">{data.extraError ? "Reading year unavailable" : "Loading your reading year…"}{data.extraError && <button className="rd-ov-link" onClick={data.reload}>Retry</button>}</div>;
    const mainWidth = Math.floor((width - 20) * .59), sideWidth = width - mainWidth - 20;
    const heroHeight = Math.min(225, Math.floor(contentHeight * .47));
    const goalHeight = Math.min(200, Math.max(125, Math.floor(contentHeight * .44)));
    const mainListHeight = Math.max(0, contentHeight - heroHeight - 40);
    const sideListHeight = Math.max(0, contentHeight - goalHeight - 108);
    return <div className="rd-ov-dashboard" style={{ gridTemplateColumns: `minmax(0, ${mainWidth}fr) minmax(0, ${sideWidth}fr)` }}>
      <section className="rd-ov-dashboard-main">
        <div style={{ height: heroHeight, flex: "none" }}>{featured(heroHeight, mainWidth)}</div>
        <div className="rd-ov-subheading"><strong>{reading.length > 1 ? "Also on the go" : "Currently reading"}</strong><span>{reading.length > 1 ? summary.shelves.reading - 1 : summary.shelves.reading}</span></div>
        <div className="rd-ov-dashboard-list">{reading.length > 1 ? collection(reading.slice(1), "other reading books", mainListHeight, mainWidth)
          : <div className="rd-ov-reflection"><BookOpen size={20} /><span>{reading.length ? "One book, one chapter at a time." : "Find something you can get lost in."}</span><button className="rd-ov-link" onClick={() => open("reading")}>Open your reading shelf <ArrowUpRight size={12} /></button></div>}</div>
      </section>
      <section className="rd-ov-dashboard-side">
        <div style={{ height: goalHeight, flex: "none" }}>{goal(goalHeight, sideWidth)}</div>
        <Habit summary={summary} compact />
        {sideListHeight >= rowHeight(prefs, sideListHeight) + 28 && <><div className="rd-ov-subheading"><strong>Up next</strong><button className="rd-ov-link" onClick={() => open("want")}>Shelf <ArrowUpRight size={12} /></button></div>
          <div className="rd-ov-dashboard-list">{data.books ? collection(queue, "dashboard next books", sideListHeight, sideWidth, false, "Save something you'd like to read next.") : <p className="rd-ov-empty-note">{data.extraError ? "Next reads unavailable" : "Loading next reads…"}</p>}</div></>}
      </section>
    </div>;
  };

  return <div className="rd-ov-root" data-view={view} data-width={width} data-height={height}>
    {heading && <header className="rd-ov-heading"><strong>{VIEWS.find(option => option.id === view)?.label}</strong><button className="icon-btn" onClick={add} title="Add a book" aria-label="Add a book"><BookPlus size={15} /></button></header>}
    {notice && <div className="rd-ov-notice" role="alert"><span title={notice}>{data.error ? "Showing saved reading data" : "Some shelves are unavailable"}</span><button className="icon-btn" title={notice} aria-label="Retry reading data" onClick={data.reload}><RefreshCw size={13} /></button></div>}
    <div className="rd-ov-content">{content()}</div>
    {footer && <footer className="rd-ov-footer"><span title={goalMessage(summary.goal)}>{summary.goal.finished}{summary.goal.books ? ` / ${summary.goal.books}` : ""} finished in {summary.goal.year}</span><button className="rd-ov-link" onClick={() => open()}>Open reading <ArrowUpRight size={12} /></button></footer>}
  </div>;
}
