import "./learning.css";
import { Brain } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { LearningSidebar } from "./LearningSidebar";
import { LearningSummary } from "./LearningSummary";
import { LearningView } from "./LearningView";

export const learning: ExtensionManifest = {
  id: "learning",
  name: "Learning",
  description: "The skills you're learning, the books, courses and playlists you learn them from, and how far through each you are.",
  about: [
    "Track what you're teaching yourself. Add a skill, then the textbooks, online courses and YouTube playlists you're learning it from, and tick off each chapter or lecture as you finish it.",
    "There's no reliable database of textbook chapters, so Learning reads them from where they really are: the book file's own table of contents, a contents list or course curriculum you paste in, or the playlist itself.",
    "Mark anything you want to come back to and it returns for review after a few days, then a week, then a month, the spacing that helps things stick.",
  ],
  features: [
    "Skills, each with the books, courses, videos and other sources you learn from",
    "Chapters read straight from an EPUB or PDF's table of contents",
    "Paste a book's contents or a Udemy or Coursera curriculum: numbering, sections, page numbers and lengths are picked up",
    "Import a YouTube playlist, every video with its length",
    "A study timer and time log, with weekly totals and a streak",
    "Review later: chapters come back after 3 days, a week, then a month",
    "Notes on every chapter, and when you'll be done at your pace",
    "Goals can follow a source's chapters or your hours studied",
    "Syncs between your computers like everything else",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Brain,
  color: "var(--area-learning)",
  area: { View: LearningView, Summary: LearningSummary, fittedSummary: true, Sidebar: LearningSidebar },
};
