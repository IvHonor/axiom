import "@fontsource-variable/caveat";
import "./notes.css";
import { NotebookText } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { NotesSidebar } from "./NotesSidebar";
import { NotesSummary } from "./NotesSummary";
import { NotesView } from "./NotesView";
import { stickyTiles } from "./overviewStickies";

export const notes: ExtensionManifest = {
  id: "notes",
  name: "Notes",
  description: "Notes in folders with tags and [[links]], and sticky notes for your overview, end-to-end encrypted.",
  about: [
    "Write things down and find them again. Notes go in folders (folders can go in folders), carry #tags, and link to each other: type [[ and pick a note, and each note shows what links back to it. Search finds any word, and pinned notes stay at the top.",
    "Sticky notes are for the quick stuff: a thought, a list, a reminder, in seven paper colours. Put as many as you like on your overview, then move and resize them like any tile. Synced end-to-end encrypted: only your devices can read your notes, never the server.",
  ],
  features: [
    "Rich text with Markdown shortcuts: headings, lists, checklists and quotes",
    "Folders inside folders, #tags, and pinned notes",
    "[[Links]] between notes, with backlinks",
    "Search across every note",
    "Sticky notes in seven colours, on a board of their own",
    "Pick which sticky notes sit on your overview, and write on them there",
    "A trash that keeps deleted notes for 30 days",
    "Edits from different computers merge, so nothing is lost",
    "Export everything as Markdown",
    "End-to-end encrypted sync, with a recovery code",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: NotebookText,
  color: "var(--area-notes)",
  area: { View: NotesView, Summary: NotesSummary, Sidebar: NotesSidebar, fittedSummary: true, tiles: stickyTiles },
};


