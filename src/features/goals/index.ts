import "./goals.css";
import { Target } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { GoalsSidebar } from "./GoalsSidebar";
import { GoalsSummary } from "./GoalsSummary";
import { GoalsView } from "./GoalsView";

export const goals: ExtensionManifest = {
  id: "goals",
  name: "Goals",
  description: "Goals with progress and pace, milestones and if-then plans, following your other extensions by themselves.",
  about: [
    "Set goals that mean something, and see how far you've come. A goal is a number to reach (save £5,000, run 500 km), milestones to tick off, or one thing to do. Give it a deadline and you'll see whether you're on pace, and how much a week it takes from here.",
    "Goals can keep track by themselves: a Finance account's balance, books you finish and pages you read, days you journal, a project's cards, or a module's lectures. Each can carry why it matters, what might get in the way, and an if-then plan for when it does. Synced end-to-end encrypted: only your devices can read it, never the server.",
  ],
  features: [
    "Numbers to reach, milestones, or one-off goals",
    "Pace against the deadline: ahead, on track or behind, and what a week takes",
    "Check-ins that add up, or that say where you are (like a weight)",
    "Follows Finance, Reading, Journal, Project Board and University by itself",
    "Why it matters, what's in the way, and if-then plans (WOOP)",
    "A chart of your progress against a steady pace",
    "Areas of life, and a shelf of what you've achieved",
    "A weekly check-in on Sunday evenings",
    "End-to-end encrypted sync, with a recovery code",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Target,
  color: "var(--area-goals)",
  area: { View: GoalsView, Summary: GoalsSummary, Sidebar: GoalsSidebar, fittedSummary: true },
};
