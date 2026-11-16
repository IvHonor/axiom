// The Playground tile's layouts: what each shows, the least room it needs,
// and which one Automatic picks for a tile's measured size. Layouts that need
// your numbers (boards, streaks) are only picked once you're on the boards;
// social layouts work for anyone with a handle.
import type { Period, Scope } from "../api";

export type View = "pulse" | "flame" | "rival" | "race" | "board" | "podium" | "cheers" | "garden" | "dashboard";

export interface Preferences {
  view: View | "auto";
  /** The board the board layouts show. */
  metric: string;
  period: Period;
  scope: Scope;
}

export const DEFAULTS: Preferences = { view: "auto", metric: "active", period: "week", scope: "friends" };

/** `boards`: needs you on the boards. Width and height are the tile body's, in px. */
export const VIEWS: { id: View; label: string; description: string; width: number; height: number; boards: boolean }[] = [
  { id: "pulse", label: "Pulse", description: "One line: your rank, score and streak", width: 0, height: 0, boards: true },
  { id: "flame", label: "Your flame", description: "Your streak's flame, its next tier and whether it's at risk", width: 110, height: 110, boards: true },
  { id: "rival", label: "Rival", description: "You and the friend just ahead, face to face", width: 240, height: 90, boards: true },
  { id: "race", label: "Week race", description: "Everyone's AI racing down their lane to the finish", width: 340, height: 110, boards: true },
  { id: "board", label: "Leaderboard", description: "Friends or global standings, with your place always included", width: 110, height: 70, boards: true },
  { id: "podium", label: "Mini podium", description: "The top three on their pedestals, and your place", width: 230, height: 180, boards: true },
  { id: "cheers", label: "Cheers and requests", description: "Who cheered you, who's asking, and friends to cheer", width: 210, height: 110, boards: false },
  { id: "garden", label: "Garden window", description: "The live friends garden, right on your overview", width: 280, height: 160, boards: false },
  { id: "dashboard", label: "Playground dashboard", description: "Ranked standings, a podium and your streak together", width: 560, height: 260, boards: true },
];

export const viewOf = (id: View) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

export const fits = (view: View, width: number, height: number) => {
  const v = viewOf(view);
  return width >= v.width && height >= v.height;
};

/** Automatic always prioritises standings, including when you have no friends yet. */
export function recommendedView(width: number, height: number, competing: boolean): View {
  if (height < 70 || width < 110) return "pulse";
  if (!competing) return "board";
  if (fits("dashboard", width, height)) return "dashboard";
  if (height < 170 && width >= 420 && fits("race", width, height)) return "race";
  return "board";
}

/**
 * What shows: your choice when it fits, or Automatic's. A board layout chosen
 * before you left the boards stays, and invites you back (`JoinBoards`).
 */
export function resolveView(prefs: Preferences, width: number, height: number, competing: boolean): View {
  const chosen = prefs.view;
  if (chosen !== "auto" && VIEWS.some((v) => v.id === chosen) && fits(chosen, width, height)) return chosen;
  return recommendedView(width, height, competing);
}
