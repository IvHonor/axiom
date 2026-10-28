import { BookOpen, Brain, Cake, CalendarClock, GraduationCap, NotebookPen, NotebookText, SquareKanban, Target, Wallet } from "lucide-react";

/** Each area stays explicitly in progress until its desktop parity checks pass. */
export const TERMINAL_AREAS = [
  { id: "daily-plan", name: "Daily Plan", icon: CalendarClock, light: "#956515", dark: "#dcb567", encrypted: false, stage: "Building", description: "Tasks, timelines, calendar views, focus timers, routines, rituals and insights. Import calendar files or subscribe to iCal links; direct provider sign-in and publishing are still in progress.", tables: ["daily_plan_tasks"] },
  { id: "project-board", name: "Project Board", icon: SquareKanban, light: "#3569b3", dark: "#86ade8", encrypted: false, stage: "Building", description: "Personal boards, cards, columns, labels, checklists, templates, recurring work, archive and insights. Shared boards are still in progress.", tables: ["project_board_projects"] },
  { id: "reading", name: "Reading Tracker", icon: BookOpen, light: "#237c79", dark: "#78c5bd", encrypted: false, stage: "Planned", description: "Your library, reading progress, notes, quotes and annual goals.", tables: [] },
  { id: "university", name: "University", icon: GraduationCap, light: "#7954b3", dark: "#b7a0df", encrypted: false, stage: "Planned", description: "Terms, modules, timetables, lectures and catch-up tracking.", tables: [] },
  { id: "learning", name: "Learning", icon: Brain, light: "#66791a", dark: "#bcd36e", encrypted: false, stage: "Planned", description: "Skills, study sources, chapter progress, timers and spaced review.", tables: [] },
  { id: "finance", name: "Finance", icon: Wallet, light: "#357b50", dark: "#83bf96", encrypted: true, stage: "Locked", description: "Accounts, transactions, budgets, recurring bills and statement imports.", tables: [] },
  { id: "notes", name: "Notes", icon: NotebookText, light: "#b0581c", dark: "#efa56f", encrypted: true, stage: "Locked", description: "Rich text, folders, tags, backlinks and sticky notes.", tables: [] },
  { id: "journal", name: "Journal", icon: NotebookPen, light: "#a84d6b", dark: "#e39ab2", encrypted: true, stage: "Locked", description: "Daily entries, prompts, mood, energy, calendars and memories.", tables: [] },
  { id: "goals", name: "Goals", icon: Target, light: "#2f6fa8", dark: "#7fb3e6", encrypted: true, stage: "Locked", description: "Targets, milestones, check-ins and progress linked to other areas.", tables: [] },
  { id: "birthdays", name: "Birthdays", icon: Cake, light: "#a8479a", dark: "#e19ad6", encrypted: true, stage: "Locked", description: "Birthdays, anniversaries, gift ideas and reminders.", tables: [] },
] as const;
export type AreaId = typeof TERMINAL_AREAS[number]["id"];
export type TerminalTab = "overview" | "themes" | AreaId;
export const isTab = (value: unknown): value is TerminalTab => value === "overview" || value === "themes" || TERMINAL_AREAS.some(area => area.id === value);
