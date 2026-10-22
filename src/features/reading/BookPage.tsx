import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Bookmark, BookOpen, ClipboardCopy, Library, NotebookPen, Pencil, Quote, RotateCcw, Trash2, X } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { mediumDay, today } from "../daily_plan/time";
import { Dialog, Segmented } from "./AddBook";
import {
  api,
  errorMessage,
  FORMATS,
  hours,
  KINDS,
  pageCount,
  progressText,
  STATUSES,
  statusLabel,
  type BookCard,
  type BookDetail,
  type BookFields,
  type Edition,
  type Note,
  type NoteKind,
  type Session,
} from "./api";
import { Cover, Progress, Stars } from "./Cover";
import { readingChanged, setReadingUi, useReadingUi } from "./readingUi";

const KIND_ICONS = { note: NotebookPen, quote: Quote, bookmark: Bookmark };

const fieldsOf = (b: BookCard): BookFields => ({
  title: b.title,
  authors: b.authors,
  coverUrl: b.coverUrl,
  pages: b.pages,
  format: b.format,
  unit: b.unit,
  audioMinutes: b.audioMinutes,
  rating: b.rating,
  review: b.review,
  startedOn: b.startedOn,
  finishedOn: b.finishedOn,
});

/** One book: where you are, your notes, its details and the reading log. */
export function BookPage({ id }: { id: string }) {
  const { page, revision } = useReadingUi();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get(id, today()).then(
      (d) => {
        setDetail(d);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [id]);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  /** Runs a change, then shows the book as it is now. */
  const run = async (change: () => Promise<unknown>) => {
    setError(null);
    try {
      await change();
      readingChanged();
    } catch (e) {
      setError(errorMessage(e));
      load();
    }
  };
  const save = (patch: Partial<BookFields>) => detail && run(() => api.update(id, { ...fieldsOf(detail.card), ...patch }, today()));

  const back = () => setReadingUi({ book: null });
  if (!detail) {
    return (
      <div className="rd-book">
        <BackBar label={page} onBack={back} />
        {error ? <p className="rd-error rd-pad">{error}</p> : <p className="dim rd-pad">Loading…</p>}
      </div>
    );
  }
  const book = detail.card;

  return (
    <div className="rd-book">
      <BackBar label={page} onBack={back}>
        <ConfirmButton
          className="btn btn-sm btn-ghost is-danger"
          confirmText="Delete it and its notes? Click again"
          onConfirm={() =>
            run(async () => {
              await api.remove(id);
              back();
            })
          }
        >
          <Trash2 size={14} strokeWidth={1.75} /> Delete
        </ConfirmButton>
      </BackBar>
      {error && <p className="rd-error rd-pad">{error}</p>}

      <div className="rd-book-body">
        <aside className="rd-book-side">
          <Cover url={book.coverUrl} title={book.title} size="lg" />
          <Stars value={book.rating} onChange={(rating) => save({ rating })} size={20} />
          <div className="rd-status" role="radiogroup" aria-label="Shelf">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={book.status === s.id}
                className={book.status === s.id ? "is-active" : undefined}
                onClick={() => run(() => api.setStatus(id, s.id, today()))}
              >
                {s.label}
              </button>
            ))}
          </div>
          {(book.status === "finished" || book.status === "dnf") && (
            <button className="btn btn-sm btn-ghost" onClick={() => run(() => api.readAgain(id, today()))}>
              <RotateCcw size={14} strokeWidth={1.75} /> Read it again
            </button>
          )}
          <Details book={book} onSave={save} onEdition={(e) => run(() => api.chooseEdition(id, { editionKey: e.key, pages: e.pages, coverUrl: e.coverUrl, isbn: e.isbn }, today()))} />
          {detail.reads.length > 0 && (
            <section className="rd-past">
              <h3 className="rd-heading">Earlier reads</h3>
              <ul>
                {detail.reads.map((r) => (
                  <li key={r.id}>
                    {r.startedOn ? mediumDay(r.startedOn) : "?"} – {r.finishedOn ? mediumDay(r.finishedOn) : "?"}
                    <span className="dim"> · {statusLabel(r.outcome)}</span>
                    {r.rating && <Stars value={r.rating} size={11} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <main className="rd-book-main">
          <header className="rd-book-title">
            <h1>{book.title}</h1>
            <p className="dim">{[book.authors, book.publishedYear].filter(Boolean).join(" · ")}</p>
          </header>

          <ProgressPanel book={book} onLog={(value, minutes) => run(() => api.logProgress(id, value, minutes, today()))} />
          <NotesPanel book={book} notes={detail.notes} run={run} />

          <section className="rd-panel">
            <h3 className="rd-heading">Review</h3>
            <Review value={book.review} onSave={(review) => save({ review })} />
          </section>

          <ReadingLog sessions={detail.sessions} onDelete={(s) => run(() => api.deleteSession(s))} />
        </main>
      </div>
    </div>
  );
}

function BackBar({ label, onBack, children }: { label: string; onBack: () => void; children?: React.ReactNode }) {
  const name = label === "all" ? "All books" : label === "stats" ? "Stats" : label === "notes" ? "Notes" : statusLabel(label as BookCard["status"]);
  return (
    <header className="rd-backbar">
      <button className="btn btn-sm btn-ghost" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={1.75} /> {name}
      </button>
      <span className="rd-fill" />
      {children}
    </header>
  );
}

/** Where you are, the finish estimate, and "I'm on page …". */
function ProgressPanel({ book, onLog }: { book: BookCard; onLog: (value: number, minutes: number | null) => void }) {
  const [value, setValue] = useState(String(book.progress));
  const [h, setH] = useState(String(Math.floor(book.progress / 60)));
  const [m, setM] = useState(String(book.progress % 60));
  const [spent, setSpent] = useState("");
  useEffect(() => {
    setValue(String(book.progress));
    setH(String(Math.floor(book.progress / 60)));
    setM(String(book.progress % 60));
  }, [book.progress, book.unit]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = book.unit === "minutes" ? (Number.parseInt(h, 10) || 0) * 60 + (Number.parseInt(m, 10) || 0) : Number.parseInt(value, 10);
    if (Number.isNaN(next)) return;
    const minutes = Number.parseInt(spent, 10);
    onLog(next, book.unit !== "minutes" && minutes > 0 ? minutes : null);
    setSpent("");
  };

  const noTotal = book.total === null;
  return (
    <section className="rd-panel rd-progress-panel">
      <div className="rd-progress-line">
        <Progress percent={book.percent} label="Progress" />
        <span className="rd-progress-text">
          {progressText(book)}
          {book.percent !== null && book.unit !== "percent" && <span className="dim"> · {Math.round(book.percent)}%</span>}
        </span>
      </div>
      <p className="dim rd-progress-note">
        {book.status === "finished" && book.finishedOn
          ? `Finished ${mediumDay(book.finishedOn)}${book.startedOn ? `, ${daysBetween(book.startedOn, book.finishedOn)} after starting` : ""}.`
          : book.status === "dnf" && book.finishedOn
            ? `Put down ${mediumDay(book.finishedOn)}.`
            : book.finishEstimate
              ? `At your pace you'll finish around ${mediumDay(book.finishEstimate)}.`
              : book.status === "reading"
                ? "Log your page as you read, and a finish date appears here."
                : "Log a page and it moves to Reading."}
        {noTotal && " Add the page count (left) to see how far through you are."}
      </p>
      <form className="rd-log-form" onSubmit={submit}>
        {book.unit === "minutes" ? (
          <label>
            I'm at
            <input className="rd-num" inputMode="numeric" value={h} aria-label="Hours in" onChange={(e) => setH(e.currentTarget.value)} /> h
            <input className="rd-num" inputMode="numeric" value={m} aria-label="Minutes in" onChange={(e) => setM(e.currentTarget.value)} /> m
          </label>
        ) : (
          <label>
            {book.unit === "percent" ? "I'm at" : "I'm on page"}
            <input className="rd-num" inputMode="numeric" value={value} aria-label={book.unit === "percent" ? "Percent read" : "Current page"} onChange={(e) => setValue(e.currentTarget.value)} />
            {book.unit === "percent" ? "%" : book.total ? `of ${book.total}` : ""}
          </label>
        )}
        {book.unit !== "minutes" && (
          <label className="dim">
            read for
            <input className="rd-num" inputMode="numeric" value={spent} placeholder="—" aria-label="Minutes spent reading" onChange={(e) => setSpent(e.currentTarget.value)} />
            min
          </label>
        )}
        <button className="btn btn-sm" type="submit">
          Update
        </button>
      </form>
    </section>
  );
}

function daysBetween(from: string, to: string): string {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Title, author, format, page count (yours over Open Library's), edition, dates and cover. */
function Details({ book, onSave, onEdition }: { book: BookCard; onSave: (patch: Partial<BookFields>) => void; onEdition: (e: Edition) => void }) {
  const { pages, yours } = pageCount(book);
  const [editions, setEditions] = useState<Edition[] | null>(null);
  const [editionError, setEditionError] = useState<string | null>(null);
  const number = (text: string) => {
    const n = Number.parseInt(text, 10);
    return Number.isNaN(n) || n <= 0 ? null : n;
  };

  const showEditions = async () => {
    if (!book.workKey) return;
    setEditionError(null);
    try {
      setEditions(await api.editions(book.workKey));
    } catch (e) {
      setEditionError(errorMessage(e));
    }
  };

  return (
    <section className="rd-details">
      <h3 className="rd-heading">Details</h3>
      <TextField label="Title" value={book.title} onSave={(title) => onSave({ title })} />
      <TextField label="Author" value={book.authors} onSave={(authors) => onSave({ authors })} />
      <div className="rd-field">
        <span>Format</span>
        <Segmented options={FORMATS} value={book.format} onChange={(format) => onSave({ format, unit: format === "audio" ? "minutes" : format === "ebook" ? "percent" : "pages" })} />
      </div>
      {book.format === "ebook" && (
        <div className="rd-field">
          <span>Track by</span>
          <Segmented
            options={[
              { id: "percent" as const, label: "Percent" },
              { id: "pages" as const, label: "Pages" },
            ]}
            value={book.unit === "pages" ? "pages" : "percent"}
            onChange={(unit) => onSave({ unit })}
          />
        </div>
      )}
      {book.format === "audio" ? (
        <TextField
          label="Length in minutes"
          value={book.audioMinutes ? String(book.audioMinutes) : ""}
          hint={book.audioMinutes ? hours(book.audioMinutes) : undefined}
          numeric
          onSave={(text) => onSave({ audioMinutes: number(text) })}
        />
      ) : (
        <>
          <TextField
            label="Pages"
            value={pages ? String(pages) : ""}
            numeric
            hint={yours ? (book.apiPages ? `Yours. Open Library says ${book.apiPages}.` : "Yours.") : book.apiPages ? "From Open Library. Change it if your copy differs." : undefined}
            onSave={(text) => {
              const n = number(text);
              onSave({ pages: n === book.apiPages ? null : n });
            }}
          />
          <div className="rd-detail-actions">
            {yours && book.apiPages && (
              <button className="btn btn-sm btn-ghost" onClick={() => onSave({ pages: null })}>
                Use Open Library's {book.apiPages}
              </button>
            )}
            {book.workKey && (
              <button className="btn btn-sm btn-ghost" onClick={showEditions}>
                <Library size={13} strokeWidth={1.75} /> Choose edition
              </button>
            )}
          </div>
          {editionError && <p className="rd-error">{editionError}</p>}
        </>
      )}
      <div className="rd-dates">
        <DateField label="Started" value={book.startedOn} onSave={(startedOn) => onSave({ startedOn })} />
        <DateField label={book.status === "dnf" ? "Stopped" : "Finished"} value={book.finishedOn} onSave={(finishedOn) => onSave({ finishedOn })} />
      </div>
      <TextField label="Cover image address" value={book.coverUrl ?? ""} onSave={(coverUrl) => onSave({ coverUrl: coverUrl || null })} />
      {book.isbn && <p className="dim rd-small">ISBN {book.isbn}</p>}

      {editions && (
        <Dialog title="Pick your edition" icon={<Library size={16} strokeWidth={1.75} />} onClose={() => setEditions(null)} wide>
          <div className="rd-dialog-body">
            <p className="dim">Editions differ in page count. Pick the one you have; its page count and cover replace Open Library's usual ones.</p>
            {editions.length === 0 && <p className="dim">Open Library doesn't list any editions for this book.</p>}
            <ul className="rd-results rd-editions">
              {editions.map((e) => (
                <li key={e.key}>
                  <button
                    className={e.key === book.editionKey ? "is-current" : undefined}
                    onClick={() => {
                      onEdition(e);
                      setEditions(null);
                    }}
                  >
                    <Cover url={e.coverUrl} title={e.title} size="sm" />
                    <span className="rd-result-text">
                      <b>{e.title}</b>
                      <span className="dim">{[e.format, e.publisher, e.published, e.language?.toUpperCase()].filter(Boolean).join(" · ")}</span>
                      <span className="rd-result-meta">
                        {e.pages ? `${e.pages} pages` : "Page count unknown"}
                        {e.key === book.editionKey && " · yours"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** A field that saves when you leave it (or press Enter). */
function TextField({ label, value, onSave, hint, numeric }: { label: string; value: string; onSave: (value: string) => void; hint?: string; numeric?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text.trim() !== value && onSave(text.trim());
  return (
    <label className="rd-field">
      <span>{label}</span>
      <input
        value={text}
        className={numeric ? "rd-num" : undefined}
        inputMode={numeric ? "numeric" : undefined}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {hint && <small className="dim">{hint}</small>}
    </label>
  );
}

function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (value: string | null) => void }) {
  return (
    <label className="rd-field">
      <span>{label}</span>
      <input type="date" value={value ?? ""} onChange={(e) => onSave(e.currentTarget.value || null)} />
    </label>
  );
}

function Review({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      className="rd-textarea"
      rows={3}
      value={text}
      placeholder="What did you think?"
      aria-label="Review"
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}

/** Notes, quotes and bookmarked pages, in page order; copied out as Markdown. */
function NotesPanel({ book, notes, run }: { book: BookCard; notes: Note[]; run: (change: () => Promise<unknown>) => Promise<void> }) {
  const [kind, setKind] = useState<NoteKind>("note");
  // A new note is for the page you're on, unless you change it.
  const pageNow = book.unit === "pages" && book.progress > 0 ? String(book.progress) : "";
  const [page, setPage] = useState(pageNow);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setPage(pageNow), [pageNow]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number.parseInt(page, 10);
    await run(async () => {
      await api.addNote(book.id, { kind, page: Number.isNaN(p) ? null : p, text });
      setText("");
      setPage(pageNow);
    });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(book, notes));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rd-panel">
      <header className="rd-panel-head">
        <h3 className="rd-heading">Notes</h3>
        <span className="rd-fill" />
        {notes.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={copy} title="Copy every note as Markdown">
            <ClipboardCopy size={13} strokeWidth={1.75} /> {copied ? "Copied" : "Copy as Markdown"}
          </button>
        )}
      </header>
      <form className="rd-note-form" onSubmit={add}>
        <div className="rd-inline">
          <Segmented options={KINDS} value={kind} onChange={setKind} />
          <label className="dim">
            page
            <input className="rd-num" inputMode="numeric" value={page} placeholder="—" aria-label="Page" onChange={(e) => setPage(e.currentTarget.value)} />
          </label>
        </div>
        <textarea
          className="rd-textarea"
          rows={kind === "bookmark" ? 1 : 3}
          value={text}
          aria-label="Note text"
          placeholder={kind === "quote" ? "The words, exactly" : kind === "bookmark" ? "Why this page matters (optional)" : "Something to remember"}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <button className="btn btn-sm" type="submit">
          Add {KINDS.find((k) => k.id === kind)?.label.toLowerCase()}
        </button>
      </form>
      {notes.length === 0 ? (
        <p className="dim rd-small">Notes, quotes and bookmarked pages you add show here in page order.</p>
      ) : (
        <ul className="rd-notes">
          {notes.map((n) =>
            editing === n.id ? (
              <NoteEditor key={n.id} note={n} onCancel={() => setEditing(null)} onSave={(fields) => run(() => api.updateNote(n.id, fields)).then(() => setEditing(null))} />
            ) : (
              <NoteRow key={n.id} note={n} onEdit={() => setEditing(n.id)} onDelete={() => run(() => api.deleteNote(n.id))} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** A note in a list. With `onOpen` (searching across books) it opens its book. */
export function NoteRow({ note, onEdit, onDelete, book, onOpen }: { note: Note; onEdit?: () => void; onDelete?: () => void; book?: string; onOpen?: () => void }) {
  const Icon = KIND_ICONS[note.kind];
  const body = (
    <>
      <span className="rd-note-meta">
        {note.page !== null && <span className="rd-note-page">p. {note.page}</span>}
        {book && <span className="dim">{book}</span>}
      </span>
      {note.text && <span className="rd-note-text">{note.kind === "quote" ? `“${note.text}”` : note.text}</span>}
    </>
  );
  return (
    <li className={`rd-note is-${note.kind}`}>
      <Icon size={14} strokeWidth={1.75} className="rd-note-icon" aria-label={note.kind} />
      {onOpen ? (
        <button className="rd-note-body rd-note-open" onClick={onOpen} title={book ? `Open ${book}` : undefined}>
          {body}
        </button>
      ) : (
        <div className="rd-note-body">{body}</div>
      )}
      {onEdit && (
        <span className="rd-note-actions">
          <button className="icon-btn" aria-label="Edit" title="Edit" onClick={onEdit}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
          <ConfirmButton className="icon-btn" confirmText="Delete?" onConfirm={() => onDelete?.()}>
            <Trash2 size={13} strokeWidth={1.75} aria-label="Delete" />
          </ConfirmButton>
        </span>
      )}
    </li>
  );
}

function NoteEditor({ note, onSave, onCancel }: { note: Note; onSave: (fields: { kind: NoteKind; page: number | null; text: string }) => void; onCancel: () => void }) {
  const [kind, setKind] = useState(note.kind);
  const [page, setPage] = useState(note.page === null ? "" : String(note.page));
  const [text, setText] = useState(note.text);
  return (
    <li className="rd-note is-editing">
      <form
        className="rd-note-form"
        onSubmit={(e) => {
          e.preventDefault();
          const p = Number.parseInt(page, 10);
          onSave({ kind, page: Number.isNaN(p) ? null : p, text });
        }}
      >
        <div className="rd-inline">
          <Segmented options={KINDS} value={kind} onChange={setKind} />
          <label className="dim">
            page
            <input className="rd-num" inputMode="numeric" value={page} aria-label="Page" onChange={(e) => setPage(e.currentTarget.value)} />
          </label>
        </div>
        <textarea className="rd-textarea" rows={3} value={text} aria-label="Note text" autoFocus onChange={(e) => setText(e.currentTarget.value)} />
        <div className="rd-inline">
          <button className="btn btn-sm" type="submit">
            Save
          </button>
          <button className="btn btn-sm btn-ghost" type="button" onClick={onCancel}>
            <X size={13} strokeWidth={1.75} /> Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

function toMarkdown(book: BookCard, notes: Note[]): string {
  const lines = [`# ${book.title}`, book.authors ? `*${book.authors}*` : "", ""];
  for (const n of notes) {
    const page = n.page !== null ? `p. ${n.page}` : "";
    if (n.kind === "quote") lines.push(`> ${n.text.replace(/\n/g, "\n> ")}`, page ? `> — ${page}` : "", "");
    else if (n.kind === "bookmark") lines.push(`- **Bookmark, ${page}**${n.text ? `: ${n.text}` : ""}`, "");
    else lines.push(`${page ? `**${page}:** ` : ""}${n.text}`, "");
  }
  if (book.review) lines.push("## Review", "", book.review, "");
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n").trim() + "\n";
}

function ReadingLog({ sessions, onDelete }: { sessions: Session[]; onDelete: (id: string) => void }) {
  if (sessions.length === 0) return null;
  const step = (s: Session) =>
    s.unit === "percent" ? `${s.startProgress}% → ${s.endProgress}%` : s.unit === "minutes" ? `${hours(s.startProgress)} → ${hours(s.endProgress)}` : `p. ${s.startProgress} → ${s.endProgress}`;
  return (
    <section className="rd-panel">
      <h3 className="rd-heading">
        <BookOpen size={13} strokeWidth={1.75} /> Reading log
      </h3>
      <ul className="rd-log">
        {sessions.map((s) => (
          <li key={s.id}>
            <span className="rd-log-day">{mediumDay(s.day)}</span>
            <span>{step(s)}</span>
            <span className="dim">
              {[s.pages > 0 && `${s.pages} pages`, s.minutes > 0 && (s.unit === "minutes" ? `${hours(s.minutes)} listened` : `${hours(s.minutes)}`)]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <ConfirmButton className="icon-btn rd-log-delete" confirmText="Remove?" onConfirm={() => onDelete(s.id)}>
              <Trash2 size={12} strokeWidth={1.75} aria-label="Remove from the log" />
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
