import { birthdays } from "../features/birthdays";
import { dailyPlan } from "../features/daily_plan";
import { finance } from "../features/finance";
import { goals } from "../features/goals";
import { journal } from "../features/journal";
import { learning } from "../features/learning";
import { notes } from "../features/notes";
import { projectBoard } from "../features/project_board";
import { reading } from "../features/reading";
import { uni } from "../features/uni";
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
  birthdays,
  dailyPlan,
  finance,
  goals,
  journal,
  learning,
  notes,
  projectBoard,
  reading,
  uni,
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
