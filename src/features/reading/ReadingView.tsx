import { useCallback, useEffect, useState, type DragEvent } from "react";
import { BarChart3, BookPlus, NotebookPen, Search } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { mediumDay, today } from "../daily_plan/time";
import { AddBookDialog } from "./AddBook";
import { api, errorMessage, progressText, STATUSES, type BookCard, type Status } from "./api";
import { BookPage } from "./BookPage";
import { Cover, Progress, Stars } from "./Cover";
import { NotesView } from "./NotesView";
import { readingChanged, setReadingUi, showPage, useReadingUi, type ReadingPage } from "./readingUi";
import { StatsView } from "./StatsView";

const EMPTY: Record<Status | "all", string> = {
  reading: "Nothing on the go. Add a book, or start one from Want to read.",
  want: "Books you'd like to read wait here, in the order you choose.",
  finished: "Books you finish land here, with your rating and dates.",
  dnf: "Books you put down without finishing go here. No guilt.",
  all: "Your library is empty. Add the book you're reading now to get started.",
};

/** The Reading Tracker: shelves of covers, a book's page, stats and notes. */
export function ReadingView() {
  const { page, book, adding, revision } = useReadingUi();
  const [books, setBooks] = useState<BookCard[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.list(today()).then(
      (list) => {
        setBooks(list);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  const count = (s: Status) => books?.filter((b) => b.status === s).length ?? 0;
  const shelfName = page === "all" || page === "stats" || page === "notes" ? null : page;
  const tab = (id: ReadingPage, label: string, n?: number, icon?: React.ReactNode) => (
    <button key={id} className={`pb-tab${page === id && !book ? " is-active" : ""}`} onClick={() => showPage(id)}>
      {icon}
      {label}
      {n !== undefined && n > 0 && <span className="rd-count">{n}</span>}
    </button>
  );

  return (
    <div className="rd-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Shelves">
          {STATUSES.map((s) => tab(s.id, s.label, count(s.id)))}
          {tab("all", "All", books?.length)}
          <span className="rd-tab-gap" />
          {tab("stats", "Stats", undefined, <BarChart3 size={14} strokeWidth={1.75} />)}
          {tab("notes", "Notes", undefined, <NotebookPen size={14} strokeWidth={1.75} />)}
        </nav>
        <button className="btn btn-sm" onClick={() => setReadingUi({ adding: true })}>
          <BookPlus size={14} strokeWidth={1.75} /> Add book
        </button>
      </header>
      {error && <p className="rd-error rd-pad">{error}</p>}

      <div className="rd-content">
        {book ? (
          <BookPage id={book} />
        ) : page === "stats" ? (
          <StatsView />
        ) : page === "notes" ? (
          <NotesView />
        ) : !books ? (
          <p className="dim rd-pad">Loading your library…</p>
        ) : (
          <Shelf
            status={shelfName}
            books={books.filter((b) => (shelfName ? b.status === shelfName : true))}
            filter={filter}
            onFilter={setFilter}
            onAdd={() => setReadingUi({ adding: true })}
          />
        )}
      </div>

      {adding && <AddBookDialog shelf={shelfName ?? "reading"} onClose={() => setReadingUi({ adding: false })} />}
    </div>
  );
}

function Shelf({ status, books, filter, onFilter, onAdd }: { status: Status | null; books: BookCard[]; filter: string; onFilter: (text: string) => void; onAdd: () => void }) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = books.filter((b) => words.every((w) => `${b.title} ${b.authors}`.toLowerCase().includes(w)));
  const reorder = status === "want" && !filter;

  const drop = async (e: DragEvent, before: string | null) => {
    e.preventDefault();
    const id = dragged;
    setDragged(null);
    setOver(null);
    if (!id || id === before) return;
    await api.move(id, before, today());
    readingChanged();
  };

  return (
    <div className="rd-shelf">
      {books.length > 0 && (
        <div className="rd-shelf-bar">
          <label className="rd-filter">
            <Search size={14} strokeWidth={1.75} />
            <input value={filter} placeholder="Filter by title or author" aria-label="Filter books" onChange={(e) => onFilter(e.currentTarget.value)} />
          </label>
          {reorder && books.length > 1 && <span className="dim rd-small">Drag to put them in the order you'll read them.</span>}
        </div>
      )}
      {books.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">{EMPTY[status ?? "all"]}</p>
          <button className="btn" onClick={onAdd}>
            <BookPlus size={14} strokeWidth={1.75} /> Add a book
          </button>
        </div>
      ) : (
        <ul className={`rd-grid${status === "reading" ? " is-reading" : ""}`} onDragOver={(e) => reorder && e.preventDefault()} onDrop={(e) => reorder && drop(e, null)}>
          {shown.map((b) => (
            <li
              key={b.id}
              className={over === b.id ? "is-over" : undefined}
              draggable={reorder}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", b.id);
                setDragged(b.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!reorder) return;
                e.preventDefault();
                e.stopPropagation();
                setOver(b.id);
              }}
              onDrop={(e) => {
                if (!reorder) return;
                e.stopPropagation();
                drop(e, b.id);
              }}
            >
              <BookTile book={b} showStatus={!status} />
            </li>
          ))}
        </ul>
      )}
      {books.length > 0 && shown.length === 0 && <p className="dim rd-pad">No books match “{filter}”.</p>}
    </div>
  );
}

function BookTile({ book, showStatus }: { book: BookCard; showStatus: boolean }) {
  return (
    <button className="rd-tile" onClick={() => setReadingUi({ book: book.id })} title={`${book.title}${book.authors ? ` by ${book.authors}` : ""}`}>
      <Cover url={book.coverUrl} title={book.title} />
      <span className="rd-tile-title">{book.title}</span>
      <span className="rd-tile-author dim">{book.authors || " "}</span>
      {book.status === "reading" ? (
        <span className="rd-tile-progress">
          <Progress percent={book.percent} label={`${book.title} progress`} />
          <span className="dim">
            {book.percent !== null ? `${Math.round(book.percent)}%` : progressText(book)}
            {book.finishEstimate && ` · done ~${mediumDay(book.finishEstimate)}`}
          </span>
        </span>
      ) : book.status === "finished" ? (
        <span className="rd-tile-meta">
          {book.rating ? <Stars value={book.rating} size={12} /> : <span className="dim">{book.finishedOn ? mediumDay(book.finishedOn) : "Finished"}</span>}
        </span>
      ) : showStatus ? (
        <span className="rd-tile-meta dim">{STATUSES.find((s) => s.id === book.status)?.label}</span>
      ) : null}
    </button>
  );
}
