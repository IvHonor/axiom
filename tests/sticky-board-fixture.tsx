// Real Notes view and editors, with notes saved only in this browser fixture.
import { createRoot } from "react-dom/client";
import { NotesView } from "../src/features/notes/NotesView";
import { api, type Note, type NoteDetail } from "../src/features/notes/api";
import { setNotesUi } from "../src/features/notes/notesUi";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "@fontsource-variable/caveat";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/project_board/board.css";
import "../src/features/notes/notes.css";

const key = "fixture.sticky-notes";
const stored = localStorage.getItem(key);
let notes: NoteDetail[] = stored ? JSON.parse(stored) : Array.from({ length: 8 }, (_, i) => ({
  note: { id: `note-${i + 1}`, title: `Note ${i + 1}`, folderId: null, tags: "[]", text: "", words: 1,
    sticky: true, pinned: false, onOverview: i < 2, color: ["yellow", "pink", "blue", "green"][i % 4],
    trashedAt: null, createdAt: "2026-11-08T12:00:00Z", updatedAt: "2026-11-08T12:00:00Z" },
  tags: [], edits: [], backlinks: [],
}));
const save = () => localStorage.setItem(key, JSON.stringify(notes));
const find = (id: string) => notes.find((detail) => detail.note.id === id)!;
api.list = async (filter) => notes.filter(({ note }) => !note.trashedAt && (filter.shelf !== "overview" || note.onOverview))
  .map(({ note }) => ({ ...note, tags: [], excerpt: note.text }));
api.get = async (id) => structuredClone(find(id));
api.state = async () => ({ folders: [], tags: [], notes: 0, stickies: notes.length, unfiled: 0, trash: 0 });
api.titles = async () => [];
api.save = async (id, update, text, words) => {
  const detail = find(id);
  if (update) detail.edits.push({ ids: [`edit-${detail.edits.length}`], data: update });
  Object.assign(detail.note, { text, words }); save(); return detail.note;
};
api.change = async (id, change) => { Object.assign(find(id).note, change); save(); return find(id).note; };
api.trash = async (id) => { find(id).note.trashedAt = "2026-11-08T12:00:00Z"; save(); };
api.create = async (input) => {
  const note: Note = { ...notes[0].note, ...input, id: `note-${notes.length + 1}`, title: `Note ${notes.length + 1}`, text: "", words: 0 };
  notes = [...notes, { note, tags: [], edits: [], backlinks: [] }]; save(); return note;
};
applyTheme(modernThemes.themes![new URLSearchParams(location.search).has("light") ? 1 : 0]);
setNotesUi({ shelf: "stickies", note: null });
createRoot(document.getElementById("root")!).render(<main style={{ height: "100dvh", minWidth: 0 }}><NotesView /></main>);
