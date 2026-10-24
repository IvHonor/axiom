import { useEffect, useState } from "react";
import { Download, FilePlus2, NotebookText, Plus, Search, StickyNote as StickyIcon, Trash2, X } from "lucide-react";
import { VaultLockBanner } from "../../shell/account/Encryption";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Switch } from "../../shell/ui/Switch";
import { COLORS, MAX_ON_OVERVIEW, api, errorMessage, type Folder, type Sort } from "./api";
import { exportNotes } from "./exportNotes";
import { NotePage } from "./NotePage";
import { notesChanged, setNotesUi, useNoteList, useNotesState, useNotesUi } from "./notesUi";
import { NoteList, newNote, newSticky, pathOf } from "./parts";
import { StickyNote } from "./StickyNote";

const SORTS: { id: Sort; label: string }[] = [
  { id: "edited", label: "Last edited" },
  { id: "created", label: "Newest first" },
  { id: "title", label: "A to Z" },
];

/** Notes: notes in folders with tags and links, and a board of sticky notes. */
export function NotesView() {
  const ui = useNotesUi();
  const { data: state } = useNotesState();
  const folders = state?.folders ?? [];
  const [note, setNote] = useState<string | null>(null);

  const heading =
    ui.shelf === "stickies"
      ? "Sticky notes"
      : ui.shelf === "trash"
        ? "Trash"
        : ui.tag
          ? `#${ui.tag}`
          : ui.folder === "none"
            ? "Unfiled"
            : ui.folder
              ? pathOf(folders, ui.folder) || "Folder"
              : "All notes";

  const exportAll = () => {
    setNote("Exporting…");
    exportNotes(folders).then((path) => setNote(`Saved to ${path}`), (err) => setNote(errorMessage(err)));
  };
  const folderForNew = ui.folder && ui.folder !== "none" ? ui.folder : null;

  return (
    <div className="nt-view">
      <header className="pb-toolbar">
        <h2 className="nt-heading">{heading}</h2>
        {note && (
          <span className="nt-note dim" title={note}>
            {note}
          </span>
        )}
        {ui.shelf !== "stickies" && ui.shelf !== "trash" && (
          <select className="nt-sort" value={ui.sort} onChange={(e) => setNotesUi({ sort: e.currentTarget.value as Sort })} aria-label="Order">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-sm btn-ghost" onClick={exportAll} title="Save every note as one Markdown file in Downloads">
          <Download size={14} strokeWidth={1.75} /> Export
        </button>
        {ui.shelf === "stickies" ? (
          <button className="btn btn-sm" onClick={() => newSticky().catch(() => {})}>
            <Plus size={14} strokeWidth={1.75} /> New sticky note
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => newNote({ folderId: folderForNew }).catch(() => {})}>
            <Plus size={14} strokeWidth={1.75} /> New note
          </button>
        )}
      </header>
      <div className="nt-banner">
        <VaultLockBanner subject="notes" />
      </div>
      {ui.shelf === "stickies" ? <StickyBoard /> : <NotesSplit folders={folders} />}
    </div>
  );
}

/** The list of notes beside the open one. */
function NotesSplit({ folders }: { folders: Folder[] }) {
  const ui = useNotesUi();
  const [search, setSearch] = useState(ui.search);
  useEffect(() => setSearch(ui.search), [ui.search]);
  // Search as you type, after a pause.
  useEffect(() => {
    const t = window.setTimeout(() => search !== ui.search && setNotesUi({ search }), 250);
    return () => window.clearTimeout(t);
  }, [search, ui.search]);
  const { data: notes, error } = useNoteList({ shelf: ui.shelf, search: ui.search || null, tag: ui.tag, folder: ui.folder, sort: ui.sort });
  const [emptying, setEmptying] = useState<string | null>(null);

  return (
    <div className="nt-split">
      <aside className="nt-list">
        <div className="nt-search">
          <Search size={14} strokeWidth={1.75} />
          <input value={search} placeholder={ui.shelf === "trash" ? "Search the trash" : "Search notes"} onChange={(e) => setSearch(e.currentTarget.value)} aria-label="Search notes" />
          {search && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {(ui.tag || ui.folder) && (
          <div className="nt-filter">
            {ui.tag ? (
              <>
                Tagged <b>#{ui.tag}</b>
              </>
            ) : (
              <>
                In <b>{ui.folder === "none" ? "no folder" : pathOf(folders, ui.folder)}</b>
              </>
            )}
            <button className="icon-btn" aria-label="Show all notes" onClick={() => setNotesUi({ tag: null, folder: null })}>
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        )}
        {ui.shelf === "trash" && notes && notes.length > 0 && (
          <div className="nt-trash-bar">
            <span className="dim">Notes here go for good after 30 days.</span>
            <ConfirmButton
              className="btn btn-sm btn-ghost nt-delete"
              confirmText="Delete them all?"
              onConfirm={() =>
                api.emptyTrash().then(() => {
                  setNotesUi({ note: null });
                  notesChanged();
                }, (err) => setEmptying(errorMessage(err)))
              }
            >
              <Trash2 size={13} strokeWidth={1.75} /> Empty
            </ConfirmButton>
          </div>
        )}
        {(error || emptying) && <p className="nt-error">{error ?? emptying}</p>}
        {notes && (
          <NoteList
            notes={notes}
            open={ui.note}
            folders={folders}
            empty={ui.shelf === "trash" ? "The trash is empty." : ui.search || ui.tag ? "Nothing matches." : ui.folder ? "No notes in here yet." : "Your notes will appear here."}
          />
        )}
      </aside>
      <main className="nt-main">{ui.note ? <NotePage key={ui.note} id={ui.note} folders={folders} /> : <Blank folder={ui.folder && ui.folder !== "none" ? ui.folder : null} trash={ui.shelf === "trash"} />}</main>
    </div>
  );
}

function Blank({ folder, trash }: { folder: string | null; trash: boolean }) {
  if (trash) {
    return (
      <div className="nt-blank">
        <Trash2 size={30} strokeWidth={1.25} />
        <p className="dim">Pick a note to restore it or delete it for good.</p>
      </div>
    );
  }
  return (
    <div className="nt-blank">
      <NotebookText size={32} strokeWidth={1.25} />
      <h3>Write it down</h3>
      <p className="dim">Pick a note, or start a new one. Type [[ in a note to link to another, and # tags to group them.</p>
      <div className="nt-blank-actions">
        <button className="btn" onClick={() => newNote({ folderId: folder }).catch(() => {})}>
          <FilePlus2 size={14} strokeWidth={1.75} /> New note
        </button>
        <button className="btn btn-ghost" onClick={() => newSticky().then(() => setNotesUi({ shelf: "stickies" }), () => {})}>
          <StickyIcon size={14} strokeWidth={1.75} /> New sticky note
        </button>
      </div>
    </div>
  );
}

/** Every sticky note on a corkboard: pick which go on the overview. */
function StickyBoard() {
  const ui = useNotesUi();
  const { data: stickies, error } = useNoteList({ shelf: "stickies", sort: "created" });
  const [problem, setProblem] = useState<string | null>(null);
  const showing = stickies?.filter((s) => s.onOverview).length ?? 0;

  const add = (color: string) => newSticky(color).then(() => setProblem(null), (err) => setProblem(errorMessage(err)));

  return (
    <div className="nt-board-page">
      <div className="nt-board-head">
        <div>
          <p className="nt-board-count">
            <b>{showing}</b> of {stickies?.length ?? 0} on your overview
          </p>
          <p className="dim">Click the overview button on a note to show or hide it there. The overview holds up to {MAX_ON_OVERVIEW}.</p>
        </div>
        <span className="nt-grow" />
        <label className="nt-hand">
          <span>Handwriting</span>
          <Switch on={ui.handwriting} onChange={(on) => setNotesUi({ handwriting: on })} label="Handwritten font" />
        </label>
        <div className="nt-new-stickies" aria-label="New sticky note">
          {COLORS.map((c) => (
            <button key={c.id} title={`New ${c.label.toLowerCase()} sticky note`} aria-label={`New ${c.label.toLowerCase()} sticky note`} style={{ background: c.paper, borderColor: c.band }} onClick={() => add(c.id)}>
              <Plus size={14} strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
      {(error || problem) && <p className="nt-error">{error ?? problem}</p>}
      {stickies && stickies.length === 0 ? (
        <div className="nt-blank">
          <StickyIcon size={32} strokeWidth={1.25} />
          <h3>No sticky notes yet</h3>
          <p className="dim">Quick thoughts, reminders and lists, in colour. Pick a colour above to stick one up.</p>
        </div>
      ) : (
        <div className="nt-board">
          {stickies?.map((s) => (
            <div key={s.id} className="nt-board-slot">
              <StickyNote card={s} place="board" autofocus={ui.note === s.id && !s.words} onOpen={() => setNotesUi({ shelf: "all", note: s.id, folder: null, tag: null })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
