// The sticky notes showing on the overview, as tiles of their own (see
// `TileSource` in extensions/types.ts). Kept here, outside React, so the
// overview can ask for them without knowing about notes.
import { listen } from "@tauri-apps/api/event";
import type { OverviewTile, TileSource } from "../../extensions/types";
import { api, nameOf, type NoteCard } from "./api";
import { notesRevision, onNotesUi } from "./notesUi";
import { showNote, StickyNote } from "./StickyNote";

let cards = new Map<string, NoteCard>();
let tiles: OverviewTile[] = [];
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
/** A sticky made from the overview, to start typing in. */
let fresh: string | null = null;

function load() {
  api.list({ shelf: "overview", sort: "created" }).then(
    (found) => {
      // Focus a new sticky once, when its tile first appears.
      if (fresh && cards.has(fresh)) fresh = null;
      cards = new Map(found.map((c) => [c.id, c]));
      tiles = found.map((c) => ({
        id: `notes.sticky:${c.id}`,
        item: c.id,
        label: nameOf(c) ? `Sticky note: ${nameOf(c)}` : "Sticky note",
        size: { w: 3, h: 4 },
        Tile: StickyTile,
      }));
      listeners.forEach((l) => l());
    },
    () => {},
  );
}

function start() {
  load();
  let seen = notesRevision();
  const offUi = onNotesUi(() => {
    if (notesRevision() !== seen) {
      seen = notesRevision();
      load();
    }
  });
  let offSync: (() => void) | undefined;
  let stopped = false;
  listen("data-changed", load).then((off) => (stopped ? off() : (offSync = off)), () => {});
  stop = () => {
    stopped = true;
    offUi();
    offSync?.();
  };
}

export const stickyTiles: TileSource = {
  subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stop?.();
        stop = null;
      }
    };
  },
  get: () => tiles,
};

/** Starts a sticky note on the overview, ready to type in. */
export async function newOverviewSticky(color?: string) {
  const note = await api.create({ sticky: true, onOverview: true, color });
  fresh = note.id;
  load();
}

function StickyTile({ item, onOpen }: { item: string; onOpen: () => void }) {
  const card = cards.get(item);
  if (!card) return null;
  return <StickyNote card={card} place="tile" onOpen={() => showNote(item, onOpen)} autofocus={fresh === item} />;
}
