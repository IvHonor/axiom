import "./journal.css";
import { NotebookPen } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { JournalSidebar } from "./JournalSidebar";
import { JournalSummary } from "./JournalSummary";
import { JournalView } from "./JournalView";

export const journal: ExtensionManifest = {
  id: "journal",
  name: "Journal",
  description: "A private page a day: prompts, mood and energy, streaks, memories from years gone by, end-to-end encrypted.",
  about: [
    "Write a little each day. A fresh prompt waits every morning and evening if the page feels blank, or just free write. Tap how you feel and how much energy you have, tag what it was about, and the day's intention from your Daily Plan sits beside it.",
    "Look back with a calendar of your year, your writing streak, mood over the last month, and entries from this day in years gone by. Edits from your other computers merge, never overwrite. Synced end-to-end encrypted: only your devices can read your journal, never the server.",
  ],
  features: [
    "Rich text with Markdown shortcuts: headings, lists, checklists and quotes",
    "Daily writing prompts, with a shuffle for another",
    "One-tap mood and energy on every entry",
    "Tags, and search across everything you've written",
    "Your Daily Plan's intention and reflection beside the day's entry",
    "On this day: entries from the same date in past years",
    "Writing streaks, a calendar of your year, and mood and word insights",
    "An evening reminder if you haven't written yet",
    "Edits from different computers merge, so nothing is lost",
    "Export everything as Markdown",
    "End-to-end encrypted sync, with a recovery code",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: NotebookPen,
  color: "var(--area-journal)",
  area: { View: JournalView, Summary: JournalSummary, Sidebar: JournalSidebar, fittedSummary: true },
};


