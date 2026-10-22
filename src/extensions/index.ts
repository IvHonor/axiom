import { GraduationCap, Wallet } from "lucide-react";
import { dailyPlan } from "../features/daily_plan";
import { projectBoard } from "../features/project_board";
import { emberThemes } from "../themes/ember_themes";
import { modernThemes } from "../themes/modern_themes";
import { wireframeThemes } from "../themes/wireframe_themes";
import { catppuccinThemes } from "../themes/catppuccin_themes";
import { tokyoNightThemes } from "../themes/tokyo_night_themes";
import { rosePineThemes } from "../themes/rose_pine_themes";
import { gruvboxThemes } from "../themes/gruvbox_themes";
import { nordThemes } from "../themes/nord_themes";
import type { ExtensionManifest } from "./types";

/**
 * Every extension Axiom knows about. Extensions are built into the app for now.
 *
 * Areas: when one is ready, give it a folder (e.g. src/features/finance/) that
 * exports its manifest with a View and Summary, and import it here in place of
 * the inline entry. Until then it shows as "Coming soon".
 *
 * Themes: each theme extension lives in src/themes/<id>/ and exports its manifest.
 */
export const EXTENSIONS: ExtensionManifest[] = [
  {
    id: "finance",
    name: "Finance",
    description: "Spending, income and budgets across your accounts.",
    about: [
      "See where your money goes. Finance brings your spending, income and budgets into one place, so you can tell at a glance whether the month is on track.",
    ],
    features: [
      "Record spending and income by category",
      "Set monthly budgets and watch how much is left",
      "Spot trends with month-by-month charts",
    ],
    version: "0.1.0",
    publisher: "Axiom",
    icon: Wallet,
    area: {},
  },
  {
    id: "uni",
    name: "University",
    description: "Modules, deadlines and grades for each term.",
    about: [
      "Keep your studies organised. University tracks your modules, coursework deadlines and grades term by term, so nothing sneaks up on you.",
    ],
    features: [
      "Organise modules by term",
      "Track coursework deadlines and exams",
      "Record grades and follow your running average",
    ],
    version: "0.1.0",
    publisher: "Axiom",
    icon: GraduationCap,
    area: {},
  },
  dailyPlan,
  projectBoard,
  wireframeThemes,
  emberThemes,
  catppuccinThemes,
  tokyoNightThemes,
  rosePineThemes,
  gruvboxThemes,
  nordThemes,
  modernThemes,
];

/**
 * Extensions and themes that were renamed, old id to new. Saved settings that
 * use an old id are read as the new one, so nobody loses what they picked.
 */
export const RENAMED: Record<string, string> = {
  ubuntu_themes: "ember_themes",
  "ubuntu-ambiance": "ember-dark",
  "ubuntu-radiance": "ember-light",
};

export const currentId = (id: string) => RENAMED[id] ?? id;

export function findExtension(id: string): ExtensionManifest | undefined {
  return EXTENSIONS.find((ext) => ext.id === id);
}

/** An area that's announced but not built yet: listed, but can't be installed. */
export function isComingSoon(ext: ExtensionManifest): boolean {
  return !!ext.area && !ext.area.View;
}
