import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, BookPlus, Loader2, Search, X } from "lucide-react";
import { today } from "../daily_plan/time";
import { api, errorMessage, FORMATS, type Edition, type Format, type Found, type Status } from "./api";
import { Cover } from "./Cover";
import { readingChanged, setReadingUi } from "./readingUi";

/** Waits for a pause in typing before searching: Open Library allows a few requests a second. */
const SEARCH_DELAY_MS = 450;

const SHELVES: { id: Status; label: string }[] = [
  { id: "want", label: "Want to read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
];

/** A centred dialog over the Reading Tracker. */
export function Dialog({ title, icon, onClose, children, wide }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="rd-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`rd-dialog${wide ? " is-wide" : ""}`} role="dialog" aria-label={title}>
        <header className="rd-dialog-head">
          {icon}
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/** What's being added: a search result (or one typed in by hand), with your choices. */
interface Draft {
  found: Found | null;
  title: string;
  authors: string;
  coverUrl: string;
  pages: string;
  /** Open Library's count: the edition's if one was chosen, else the usual one. */
  libraryPages: number | null;
  editionKey: string | null;
  isbn: string | null;
  format: Format;
  status: Status;
  hours: string;
  minutes: string;
}

const draftOf = (found: Found | null, status: Status): Draft => ({
  found,
  title: found?.title ?? "",
  authors: found?.authors ?? "",
  coverUrl: found?.coverUrl ?? "",
  pages: found?.pages ? String(found.pages) : "",
  libraryPages: found?.pages ?? null,
  editionKey: found?.editionKey ?? null,
  isbn: found?.isbn ?? null,
  format: "print",
  status,
  hours: "",
  minutes: "",
});

/** Finding a book on Open Library (by title, author or ISBN) and adding it. */
export function AddBookDialog({ onClose, shelf }: { onClose: () => void; shelf: Status }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const asked = useRef(0);

  const run = async (text: string) => {
    const id = ++asked.current;
    if (!text.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const found = await api.search(text);
      if (id === asked.current) setResults(found);
    } catch (e) {
      if (id === asked.current) setError(errorMessage(e));
    } finally {
      if (id === asked.current) setSearching(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => run(query), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (draft) return <ConfirmBook draft={draft} onBack={() => setDraft(null)} onClose={onClose} />;

  return (
    <Dialog title="Add a book" icon={<BookPlus size={16} strokeWidth={1.75} />} onClose={onClose} wide>
      <form
        className="rd-search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <Search size={15} strokeWidth={1.75} />
        <input autoFocus value={query} placeholder="Title, author or ISBN" aria-label="Search for a book" onChange={(e) => setQuery(e.currentTarget.value)} />
        {searching && <Loader2 size={15} strokeWidth={1.75} className="rd-spin" />}
      </form>
      <div className="rd-dialog-body">
        {error && <p className="rd-error">{error}</p>}
        {results?.length === 0 && !searching && <p className="dim">Nothing on Open Library matches “{query}”. Try fewer words, the author, or the ISBN from the back of the book.</p>}
        {!results && !error && <p className="dim">Search millions of books on Open Library. The cover and page count fill in for you.</p>}
        {results && results.length > 0 && (
          <ul className="rd-results">
            {results.map((r) => (
              <li key={r.workKey}>
                <button onClick={() => setDraft(draftOf(r, shelf))}>
                  <Cover url={r.coverUrl} title={r.title} size="sm" />
                  <span className="rd-result-text">
                    <b>{r.title}</b>
                    <span className="dim">{[r.authors, r.year].filter(Boolean).join(" · ")}</span>
                    <span className="rd-result-meta">
                      {r.pages ? `${r.pages} pages` : "Page count unknown"}
                      {r.editions > 1 && ` · ${r.editions} editions`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-sm btn-ghost rd-manual" onClick={() => setDraft({ ...draftOf(null, shelf), title: query.trim() })}>
          Can't find it? Add it yourself
        </button>
      </div>
    </Dialog>
  );
}

function ConfirmBook({ draft: initial, onBack, onClose }: { draft: Draft; onBack: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [editions, setEditions] = useState<Edition[] | null>(null);
  const [loadingEditions, setLoadingEditions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const found = draft.found;

  const showEditions = async () => {
    if (!found) return;
    setLoadingEditions(true);
    setError(null);
    try {
      setEditions(await api.editions(found.workKey));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingEditions(false);
    }
  };

  const pick = (e: Edition) => {
    set({
      editionKey: e.key,
      isbn: e.isbn,
      libraryPages: e.pages ?? draft.libraryPages,
      pages: e.pages ? String(e.pages) : draft.pages,
      coverUrl: e.coverUrl ?? draft.coverUrl,
    });
    setEditions(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pages = Number.parseInt(draft.pages, 10);
    const audio = (Number.parseInt(draft.hours, 10) || 0) * 60 + (Number.parseInt(draft.minutes, 10) || 0);
    // Your own count is kept only when it differs from Open Library's.
    const yours = Number.isNaN(pages) || pages === draft.libraryPages ? null : pages;
    setBusy(true);
    setError(null);
    try {
      const card = await api.add(
        {
          title: draft.title,
          authors: draft.authors,
          coverUrl: draft.coverUrl || null,
          workKey: found?.workKey ?? null,
          editionKey: draft.editionKey,
          isbn: draft.isbn,
          publishedYear: found?.year ?? null,
          apiPages: draft.libraryPages,
          pages: yours,
          format: draft.format,
          audioMinutes: draft.format === "audio" && audio > 0 ? audio : null,
          status: draft.status,
        },
        today(),
      );
      readingChanged();
      setReadingUi({ page: card.status, book: card.id, adding: false });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog title={found ? "Add this book" : "Add a book yourself"} icon={<BookPlus size={16} strokeWidth={1.75} />} onClose={onClose} wide>
      <form className="rd-dialog-body rd-confirm" onSubmit={submit}>
        <button type="button" className="btn btn-sm btn-ghost rd-back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.75} /> Back to search
        </button>
        {error && <p className="rd-error">{error}</p>}

        {editions ? (
          <>
            <h3 className="rd-heading">Pick your edition</h3>
            <p className="dim">Editions differ in page count. Pick the one you have, so your progress is right.</p>
            <ul className="rd-results rd-editions">
              {editions.map((e) => (
                <li key={e.key}>
                  <button type="button" onClick={() => pick(e)}>
                    <Cover url={e.coverUrl} title={e.title} size="sm" />
                    <span className="rd-result-text">
                      <b>{e.title}</b>
                      <span className="dim">{[e.format, e.publisher, e.published, e.language?.toUpperCase()].filter(Boolean).join(" · ")}</span>
                      <span className="rd-result-meta">{e.pages ? `${e.pages} pages` : "Page count unknown"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditions(null)}>
              Keep the one I had
            </button>
          </>
        ) : (
          <div className="rd-confirm-grid">
            <Cover url={draft.coverUrl || null} title={draft.title || "?"} size="lg" />
            <div className="rd-fields">
              {found ? (
                <div>
                  <div className="rd-confirm-title">{draft.title}</div>
                  <div className="dim">{[draft.authors, found.year].filter(Boolean).join(" · ")}</div>
                </div>
              ) : (
                <>
                  <label className="rd-field">
                    <span>Title</span>
                    <input required autoFocus value={draft.title} onChange={(e) => set({ title: e.currentTarget.value })} />
                  </label>
                  <label className="rd-field">
                    <span>Author</span>
                    <input value={draft.authors} onChange={(e) => set({ authors: e.currentTarget.value })} />
                  </label>
                  <label className="rd-field">
                    <span>Cover image address (optional)</span>
                    <input type="url" value={draft.coverUrl} placeholder="https://…" onChange={(e) => set({ coverUrl: e.currentTarget.value })} />
                  </label>
                </>
              )}

              <div className="rd-field">
                <span>Shelf</span>
                <Segmented options={SHELVES} value={draft.status} onChange={(status) => set({ status })} />
              </div>
              <div className="rd-field">
                <span>Format</span>
                <Segmented options={FORMATS} value={draft.format} onChange={(format) => set({ format })} />
              </div>

              {draft.format === "audio" ? (
                <div className="rd-field">
                  <span>Length</span>
                  <span className="rd-inline">
                    <input className="rd-num" inputMode="numeric" value={draft.hours} aria-label="Hours" onChange={(e) => set({ hours: e.currentTarget.value })} /> h
                    <input className="rd-num" inputMode="numeric" value={draft.minutes} aria-label="Minutes" onChange={(e) => set({ minutes: e.currentTarget.value })} /> m
                  </span>
                </div>
              ) : (
                <div className="rd-field">
                  <span>Pages</span>
                  <span className="rd-inline">
                    <input className="rd-num" inputMode="numeric" value={draft.pages} aria-label="Pages" onChange={(e) => set({ pages: e.currentTarget.value })} />
                    {found && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={showEditions} disabled={loadingEditions}>
                        {loadingEditions ? "Loading editions…" : "Choose edition"}
                      </button>
                    )}
                  </span>
                  <small className="dim">
                    {found
                      ? draft.editionKey
                        ? "From your edition. Change it if your copy differs."
                        : "The usual count across editions. Change it, or choose your edition, if your copy differs."
                      : "You can add or change this later."}
                  </small>
                </div>
              )}
            </div>
          </div>
        )}

        {!editions && (
          <footer className="rd-dialog-foot">
            <button className="btn" type="submit" disabled={busy || !draft.title.trim()}>
              {busy ? "Adding…" : "Add to library"}
            </button>
          </footer>
        )}
      </form>
    </Dialog>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <span className="pb-segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? "is-active" : undefined} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
