import { BookOpen, Brain, Cake, CalendarClock, GraduationCap, NotebookPen, NotebookText, SquareKanban, Target, Wallet, type LucideIcon } from "lucide-react";

/** The app's areas, with the same icons and colours (see src/styles/theme.css in the app). */
export interface Area {
  name: string;
  icon: LucideIcon;
  /** Light and dark, as in the app. */
  color: [string, string];
  summary: string;
  encrypted?: boolean;
}

export const AREAS: Area[] = [
  { name: "Daily Plan", icon: CalendarClock, color: ["#956515", "#dcb567"], summary: "Plan the day in time blocks around your calendar, pick three priorities and see whether it all fits." },
  { name: "Project Board", icon: SquareKanban, color: ["#3569b3", "#86ade8"], summary: "Boards with checklists, labels, dates and estimates. Switch to a table or timeline, or share a board with others." },
  { name: "Reading", icon: BookOpen, color: ["#237c79", "#78c5bd"], summary: "Find books through Open Library, log your progress, keep notes and quotes, and build a reading streak." },
  { name: "University", icon: GraduationCap, color: ["#7954b3", "#b7a0df"], summary: "Terms, modules and lectures from your timetable, and exactly which ones you're behind on." },
  { name: "Learning", icon: Brain, color: ["#66791a", "#bcd36e"], summary: "Textbooks, courses and playlists chapter by chapter, read straight from the book file, with a study timer and spaced review." },
  { name: "Finance", icon: Wallet, color: ["#357b50", "#83bf96"], summary: "Accounts, budgets and recurring bills, statement imports and any currency.", encrypted: true },
  { name: "Notes", icon: NotebookText, color: ["#b0581c", "#efa56f"], summary: "Rich notes in folders with tags and [[links]], plus sticky notes for your overview.", encrypted: true },
  { name: "Journal", icon: NotebookPen, color: ["#a84d6b", "#e39ab2"], summary: "A page a day with prompts, mood and energy, streaks and memories from years gone by.", encrypted: true },
  { name: "Goals", icon: Target, color: ["#2f6fa8", "#7fb3e6"], summary: "Targets and milestones with pace, if-then plans, and progress that follows your other areas by itself.", encrypted: true },
  { name: "Birthdays", icon: Cake, color: ["#a8479a", "#e19ad6"], summary: "Birthdays and anniversaries, gift ideas, and reminders as far ahead as you like.", encrypted: true },
];
