// Typed wrappers for the Notes Tauri commands.
// Mirrors src-tauri/src/features/notes/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";
import type { Edit } from "../../lib/richtext/doc";

export interface Note {
  id: string;
  folderId: string | null;
  title: string;
  tags: string;
  text: string;
  words: number;
  pinned: boolean;
  sticky: boolean;
  color: string;
  onOverview: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteCard {
  id: string;
  folderId: string | null;
  title: string;
  tags: string[];
  excerpt: string;
  words: number;
  pinned: boolean;
  sticky: boolean;
  color: string;
  onOverview: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLink {
  id: string;
  title: string;
}

export interface NoteDetail {
  note: Note;
  tags: string[];
  edits: Edit[];
  backlinks: NoteLink[];
}

export interface NewNote {
  folderId?: string | null;
  title?: string;
  sticky?: boolean;
  color?: string;
  onOverview?: boolean;
}

/** Only what's given changes. `folderId: ""` takes it out of its folder. */
export interface NoteChange {
  folderId?: string;
  title?: string;
  tags?: string[];
  pinned?: boolean;
  sticky?: boolean;
  color?: string;
  onOverview?: boolean;
}

export type Shelf = "all" | "notes" | "stickies" | "overview" | "trash";
export type Sort = "edited" | "created" | "title";

export interface NoteFilter {
  shelf?: Shelf;
  search?: string | null;
  tag?: string | null;
  /** A folder (with its subfolders), or "none" for unfiled notes. */
  folder?: string | null;
  sort?: Sort;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  count: number;
}

export interface NotesState {
  folders: Folder[];
  tags: { tag: string; count: number }[];
  notes: number;
  stickies: number;
  unfiled: number;
  trash: number;
}

export const api = {
  state: () => invoke<NotesState>("notes_state"),
  list: (filter: NoteFilter) => invoke<NoteCard[]>("notes_list", { filter }),
  get: (id: string) => invoke<NoteDetail>("notes_get", { id }),
  titles: () => invoke<NoteLink[]>("notes_titles"),
  create: (note: NewNote) => invoke<Note>("notes_create", { note }),
  change: (id: string, change: NoteChange) => invoke<Note>("notes_change", { id, change }),
  save: (id: string, update: string | null, text: string, words: number) => invoke<Note>("notes_save", { id, update, text, words }),
  compact: (id: string, snapshot: string, replaces: string[]) => invoke<void>("notes_compact", { id, snapshot, replaces }),
  trash: (id: string) => invoke<void>("notes_trash", { id }),
  restore: (id: string) => invoke<Note>("notes_restore", { id }),
  remove: (id: string) => invoke<void>("notes_delete", { id }),
  emptyTrash: () => invoke<number>("notes_empty_trash"),
  createFolder: (name: string, parentId: string | null) => invoke<Folder>("notes_folder_create", { name, parentId }),
  renameFolder: (id: string, name: string) => invoke<Folder>("notes_folder_rename", { id, name }),
  moveFolder: (id: string, parentId: string | null) => invoke<Folder>("notes_folder_move", { id, parentId }),
  deleteFolder: (id: string) => invoke<void>("notes_folder_delete", { id }),
  exportMarkdown: (markdown: string) => invoke<string>("notes_export", { markdown }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/** What a note is called: its title, or else its first line. */
export function nameOf(n: { title: string; excerpt?: string; text?: string }): string {
  if (n.title.trim()) return n.title.trim();
  const first = (n.excerpt ?? n.text ?? "").split("\n").find((l) => l.trim());
  return first ? first.trim().slice(0, 80) : "";
}

/** Sticky note colours: the paper, and the darker band along its top. */
export const COLORS: { id: string; label: string; paper: string; band: string }[] = [
  { id: "yellow", label: "Yellow", paper: "#fff4a8", band: "#f8e47a" },
  { id: "orange", label: "Orange", paper: "#ffdcb0", band: "#fbc382" },
  { id: "pink", label: "Pink", paper: "#ffd1e3", band: "#f9adc9" },
  { id: "purple", label: "Purple", paper: "#e6d8ff", band: "#cdb7fb" },
  { id: "blue", label: "Blue", paper: "#cfe9ff", band: "#a7d3fa" },
  { id: "green", label: "Green", paper: "#d4f3c8", band: "#b0e39d" },
  { id: "grey", label: "Grey", paper: "#e9e9e6", band: "#d3d3cf" },
];

export const colorOf = (id: string) => COLORS.find((c) => c.id === id) ?? COLORS[0];

/** The overview holds this many sticky notes (the server agrees). */
export const MAX_ON_OVERVIEW = 24;

/** "5 min ago", "Yesterday", "12 Oct". */
export function edited(at: string): string {
  const then = new Date(at);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && then.getDate() === new Date().getDate()) return `${hours} h ago`;
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return then.toLocaleDateString("en-GB", { weekday: "long" });
  return then.toLocaleDateString("en-GB", then.getFullYear() === new Date().getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}
