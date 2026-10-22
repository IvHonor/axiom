import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, KINDS, type NoteHit, type NoteKind } from "./api";
import { NoteRow } from "./BookPage";
import { setReadingUi, useReadingUi } from "./readingUi";

/** Every note, quote and bookmark across your books, searchable. */
export function NotesView() {
  const { revision } = useReadingUi();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [hits, setHits] = useState<NoteHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  useDataChanged(() => setAsked((n) => n + 1));

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      api.searchNotes(query).then(
        (found) => live && setHits(found),
        (e) => live && setError(errorMessage(e)),
      );
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, revision, asked]);

  const shown = hits?.filter((h) => kind === "all" || h.kind === kind) ?? [];
  return (
    <div className="rd-notes-view">
      <div className="rd-shelf-bar">
        <label className="rd-filter">
          <Search size={14} strokeWidth={1.75} />
          <input autoFocus value={query} placeholder="Search notes, quotes and books" aria-label="Search notes" onChange={(e) => setQuery(e.currentTarget.value)} />
        </label>
        <span className="pb-segmented" role="radiogroup" aria-label="Kind">
          {[{ id: "all" as const, label: "All" }, ...KINDS].map((k) => (
            <button key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? "is-active" : undefined} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </span>
      </div>
      {error && <p className="rd-error">{error}</p>}
      {hits && shown.length === 0 && (
        <p className="dim">{query ? `Nothing matches “${query}”.` : "Notes, quotes and bookmarks from all your books gather here. Add them from a book's page."}</p>
      )}
      <ul className="rd-notes">
        {shown.map((h) => (
          <NoteRow key={h.id} note={h} book={h.bookTitle} onOpen={() => setReadingUi({ book: h.bookId })} />
        ))}
      </ul>
    </div>
  );
}
