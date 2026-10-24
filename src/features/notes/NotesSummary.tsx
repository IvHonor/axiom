import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FilePlus2, Pin, StickyNote as StickyIcon } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { edited, errorMessage, MAX_ON_OVERVIEW, nameOf } from "./api";
import { setNotesUi, useNoteList } from "./notesUi";
import { newOverviewSticky } from "./overviewStickies";
import { newNote } from "./parts";
import "./summary.css";

export function NotesSummary({ onOpen }: { onOpen: () => void }) {
  const { width, height } = useTileLayout();
  const { data: notes, error: loadError } = useNoteList({ shelf: "notes", sort: "edited" });
  const { data: showing, error: stickyError } = useNoteList({ shelf: "overview" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const compact = height < 125;
  const cards = height >= 260 && width >= 260;
  const columns = cards ? Math.max(1, Math.min(4, Math.floor((width + 10) / 210))) : 1;
  // Reserve the footer, pagination and a possible error before allocating rows.
  const rows = Math.max(1, Math.floor((height - (compact ? 28 : 82)) / (cards ? 112 : 34)));
  const capacity = rows * columns;
  const pages = Math.max(1, Math.ceil((notes?.length ?? 0) / capacity));
  const current = Math.min(page, pages - 1);
  const full = (showing?.length ?? 0) >= MAX_ON_OVERVIEW;
  const open = (id: string | null) => { setNotesUi({ note: id, shelf: "all", folder: null, tag: null, search: "" }); onOpen(); };
  const create = async (sticky: boolean) => {
    setBusy(true);
    try { if (sticky) await newOverviewSticky(); else { await newNote(); onOpen(); } setError(null); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  return <div className="nst-summary" data-compact={compact} data-cards={cards} data-narrow={width < 150}>
    {compact && error ? <p className="nst-empty" role="alert" title={error}>{error}</p> : !notes ? <button className="nst-empty" onClick={() => open(null)}>{loadError ? "Notes unavailable. Open notes" : "Loading notes…"}</button>
      : notes.length === 0 ? <button className="nst-empty" disabled={busy} onClick={() => create(false)}><FilePlus2 size={20} /><b>No notes yet</b>{!compact && <span>Capture your first thought →</span>}</button>
      : <div className="nst-list" style={{ "--note-columns": columns, "--note-rows": rows } as CSSProperties}>
        {notes.slice(current * capacity, (current + 1) * capacity).map(n => <button key={n.id} className="nst-note" title={nameOf(n) || "New note"} onClick={() => open(n.id)}>
          <span className="nst-note-heading">{n.pinned && <Pin size={11} />}<b className="nst-name">{nameOf(n) || "New note"}</b></span>
          {cards && <span className="nst-excerpt">{n.excerpt || "A little space for a new thought."}</span>}
          {(!compact && width >= 180) && <span className="nst-date">{edited(n.updatedAt)}{cards && ` · ${n.words.toLocaleString()} words`}</span>}
        </button>)}
      </div>}
    {!compact && notes && notes.length > 0 && <nav className="nst-pagination" aria-label="Notes pages"><span>{current * capacity + 1}–{Math.min((current + 1) * capacity, notes.length)} of {notes.length}</span><div>
      <button aria-label="Previous notes page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={14} /></button>
      <button aria-label="Next notes page" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={14} /></button>
    </div></nav>}
    {(error || loadError || stickyError) && !compact && <p className="nst-notice" role="alert" title={error || loadError || stickyError || ""}>{error || "Some updates unavailable"}</p>}
    <footer className="nst-footer">
      <button disabled={busy} aria-label="New note" title="New note" onClick={() => create(false)}><FilePlus2 size={13} />{width >= 150 && <span>New note</span>}</button>
      <button disabled={busy || full || !showing || !!stickyError} title={full ? `The overview holds up to ${MAX_ON_OVERVIEW} sticky notes` : stickyError ? "Sticky note availability could not be loaded" : "Stick a note on the overview"} aria-label="Sticky note" onClick={() => create(true)}><StickyIcon size={13} />{width >= 210 && <span>Sticky note</span>}</button>
      {compact && width >= 150 && !!notes?.length && <button title="All notes" onClick={() => open(null)}>All →</button>}
    </footer>
  </div>;
}

