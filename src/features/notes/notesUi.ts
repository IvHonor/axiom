// What Notes shows, shared by its view, side panel, overview tile and sticky
// notes: the shelf or folder, the open note and the filters.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type NoteFilter, type Shelf, type Sort } from "./api";

interface NotesUi {
  shelf: Shelf;
  /** A folder's notes, or "none" for unfiled ones. */
  folder: string | null;
  tag: string | null;
  search: string;
  sort: Sort;
  /** The note open in the editor. */
  note: string | null;
  /** Sticky notes in a handwritten font. */
  handwriting: boolean;
  /** Bumped after any change here, so lists re-read. */
  revision: number;
}

const SORT_KEY = "axiom.notes.sort";
const HAND_KEY = "axiom.notes.handwriting";

function savedHandwriting(): boolean {
  try {
    return localStorage.getItem(HAND_KEY) !== "off";
  } catch {
    return true;
  }
}

function savedSort(): Sort {
  try {
    const s = localStorage.getItem(SORT_KEY);
    return s === "created" || s === "title" ? s : "edited";
  } catch {
    return "edited";
  }
}

let state: NotesUi = { shelf: "all", folder: null, tag: null, search: "", sort: savedSort(), handwriting: savedHandwriting(), note: null, revision: 0 };
const listeners = new Set<() => void>();

export function setNotesUi(change: Partial<NotesUi>) {
  state = { ...state, ...change };
  try {
    if (change.sort) localStorage.setItem(SORT_KEY, change.sort);
    if (change.handwriting !== undefined) localStorage.setItem(HAND_KEY, change.handwriting ? "on" : "off");
  } catch {
    // Remembering these is a nicety.
  }
  listeners.forEach((listener) => listener());
}

export const notesChanged = () => setNotesUi({ revision: state.revision + 1 });

/** Hears every change here (for stores outside React). */
export function onNotesUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const notesRevision = () => state.revision;

export function useNotesUi(): NotesUi {
  return useSyncExternalStore(onNotesUi, () => state);
}

/** Reads again after any change here or a sync. */
function useNotesData<T>(read: () => Promise<T>, key: string): { data: T | null; error: string | null; reload: () => void } {
  const { revision } = useNotesUi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reader = useRef(read);
  reader.current = read;
  const load = useCallback(() => {
    reader.current().then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, []);
  useEffect(load, [load, revision, key]);
  useDataChanged(load);
  return { data, error, reload: load };
}

export const useNotesState = () => useNotesData(api.state, "");

export const useNoteList = (filter: NoteFilter) => useNotesData(() => api.list(filter), JSON.stringify(filter));

export const useTitles = () => useNotesData(api.titles, "");
