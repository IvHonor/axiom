import { FolderClosed, Pin } from "lucide-react";
import { MAX_ON_OVERVIEW, api, colorOf, edited, nameOf, type Folder, type NewNote, type NoteCard } from "./api";
import { notesChanged, setNotesUi } from "./notesUi";

/** Folders in tree order, each with how deep it sits. */
export function flatten(folders: Folder[]): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const ids = new Set(folders.map((f) => f.id));
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => (x.parentId && ids.has(x.parentId) ? x.parentId : null) === parent)) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Uni / Maths". */
export function pathOf(folders: Folder[], id: string | null): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let f = folders.find((x) => x.id === id); f && !seen.has(f.id); f = folders.find((x) => x.id === f!.parentId)) {
    seen.add(f.id);
    names.unshift(f.name);
  }
  return names.join(" / ");
}

export function FolderSelect({ folders, value, onChange }: { folders: Folder[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <label className="nt-folder-select" title="Folder">
      <FolderClosed size={14} strokeWidth={1.75} />
      <select value={value ?? ""} onChange={(e) => onChange(e.currentTarget.value || null)} aria-label="Folder">
        <option value="">No folder</option>
        {flatten(folders).map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {"  ".repeat(depth)}
            {folder.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Starts a note (in the folder being looked at) and opens it. */
export async function newNote(note: NewNote = {}) {
  const n = await api.create(note);
  setNotesUi({ note: n.id, ...(note.sticky ? {} : { shelf: "all", tag: null, search: "" }) });
  notesChanged();
  return n;
}

/** Starts a sticky note, on the overview if there's room, ready to type in. */
export async function newSticky(color?: string) {
  const showing = (await api.list({ shelf: "overview" })).length;
  return newNote({ sticky: true, color, onOverview: showing < MAX_ON_OVERVIEW });
}

export function NoteList({ notes, open, folders, empty }: { notes: NoteCard[]; open: string | null; folders: Folder[]; empty: string }) {
  if (!notes.length) return <p className="dim nt-empty">{empty}</p>;
  return (
    <div className="nt-cards">
      {notes.map((n) => {
        const name = nameOf(n);
        const rest = n.title.trim() ? n.excerpt : n.excerpt.split("\n").slice(1).join(" ");
        const folder = pathOf(folders, n.folderId);
        return (
          <button key={n.id} className={`nt-card${open === n.id ? " is-active" : ""}`} onClick={() => setNotesUi({ note: n.id })}>
            <span className="nt-card-top">
              {n.sticky && <span className="nt-dot" style={{ background: colorOf(n.color).paper, borderColor: colorOf(n.color).band }} title="Sticky note" />}
              <b className="nt-card-title">{name || <span className="dim">New note</span>}</b>
              {n.pinned && <Pin size={12} strokeWidth={1.75} className="nt-pin" aria-label="Pinned" />}
            </span>
            {rest.trim() && <span className="nt-card-excerpt">{rest}</span>}
            <span className="nt-card-meta">
              <span>{edited(n.updatedAt)}</span>
              {folder && <span className="nt-card-folder">{folder}</span>}
              {n.tags.length > 0 && <span className="nt-card-tags">{n.tags.map((t) => `#${t}`).join(" ")}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
