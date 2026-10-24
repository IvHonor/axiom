import "./reading.css";
import { BookOpen } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { ReadingSidebar } from "./ReadingSidebar";
import { ReadingSummary } from "./ReadingSummary";
import { ReadingSummaryTitle } from "./overview/ReadingOverviewMenu";
import { ReadingView } from "./ReadingView";

export const reading: ExtensionManifest = {
  id: "reading",
  name: "Reading Tracker",
  description: "The books you're reading, want to read and have read, and what you took from them.",
  about: [
    "Keep track of every book. Search millions of titles on Open Library and the cover and page count fill in for you; then log the page you're on and watch the progress bar fill, with a finish date worked out from your pace.",
    "Write down what you want to remember: notes, exact quotes, and bookmarks for the pages that matter. Set a goal for the year, keep a reading streak going, and look back on everything you've read.",
  ],
  features: [
    "Find books by title, author or ISBN, with covers and page counts from Open Library",
    "Your own page count when Open Library's is wrong, or pick your exact edition",
    "Want to read, Reading, Finished and Did not finish shelves; read a book again without losing the first time",
    "Log your page and see when you'll finish at your pace",
    "Print, ebooks (by page or percent) and audiobooks (by time)",
    "Notes, quotes and bookmarked pages, searchable across every book and copied out as Markdown",
    "Ratings in half stars and a short review",
    "A yearly goal, a reading streak, and pages and books by month",
    "Syncs between your computers like everything else",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: BookOpen,
  color: "var(--area-reading)",
  area: { View: ReadingView, Summary: ReadingSummary, SummaryTitle: ReadingSummaryTitle, fittedSummary: true, Sidebar: ReadingSidebar },
};
