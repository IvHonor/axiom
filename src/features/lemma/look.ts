// How Lemma looks: colours, shell, an accessory and something to hold. Part
// of the profile, so it syncs, and shared by every face. "theme" colours
// follow the colour theme, so the standard Lemma always fits.
import { Binary, Book, Coffee, Gamepad2, Heart, Music, Rocket, Sprout, Star, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";

export type Shell = "orb" | "prism" | "pyramid" | "drop";
export type Accessory = "none" | "headphones" | "halo" | "cap" | "beanie" | "crown";
export type Finish = "hologram" | "glass" | "metal" | "matte";
export type Holding = "none" | "coffee" | "book" | "plant" | "star" | "heart" | "rocket" | "music" | "game" | "glitch";

export interface Look {
  /** The eyes, crest and side panels. "theme" is the theme's accent. */
  glow: string;
  /** The head. "theme" is a shade of the theme's surface. */
  shell: string;
  shape: Shell;
  accessory: Accessory;
  facewear: "none" | "glasses" | "sunglasses";
  neckwear: "none" | "bow";
  finish: Finish;
  /** Wearable colours are editable while equipped. Held items retain their own palette. */
  headwearColor: string;
  facewearColor: string;
  neckwearColor: string;
  holdingColor: string;
  jewelColor: string;
  /** What it holds when it isn't busy (busy, it holds the area's tool). */
  holding: Holding;
}

export const STANDARD: Look = { glow: "#2ec4ff", shell: "theme", shape: "orb", accessory: "none", holding: "none", facewear: "none", neckwear: "none", finish: "hologram", headwearColor: "auto", facewearColor: "auto", neckwearColor: "auto", holdingColor: "auto", jewelColor: "auto" };
export const FINISHES: { id: Finish; name: string }[] = [{ id: "hologram", name: "Hologram" }, { id: "glass", name: "Frosted glass" }, { id: "metal", name: "Polished metal" }, { id: "matte", name: "Matte" }];

export const GLOWS: { id: string; name: string; color: string }[] = [
  { id: "theme", name: "Theme", color: "var(--accent)" },
  { id: "#2ec4ff", name: "Cyan", color: "#2ec4ff" },
  { id: "#3ddc84", name: "Green", color: "#3ddc84" },
  { id: "#ffb627", name: "Amber", color: "#ffb627" },
  { id: "#ff5c8a", name: "Pink", color: "#ff5c8a" },
  { id: "#a77bff", name: "Violet", color: "#a77bff" },
  { id: "#ff5a3c", name: "Ember", color: "#ff5a3c" },
  { id: "#f2f2f4", name: "White", color: "#f2f2f4" },
];

export const SHELLS: { id: string; name: string; color: string }[] = [
  { id: "theme", name: "Theme", color: "color-mix(in srgb, var(--surface) 88%, var(--text))" },
  { id: "#f4f4f2", name: "Snow", color: "#f4f4f2" },
  { id: "#3a3d44", name: "Graphite", color: "#3a3d44" },
  { id: "#1f3a5f", name: "Navy", color: "#1f3a5f" },
  { id: "#4b5e3c", name: "Olive", color: "#4b5e3c" },
  { id: "#c9a46b", name: "Sand", color: "#c9a46b" },
  { id: "#7a2e3a", name: "Wine", color: "#7a2e3a" },
];

export const SHAPES: { id: Shell; name: string; description: string }[] = [
  { id: "orb", name: "Orb", description: "A little world of possibility." },
  { id: "prism", name: "Prism", description: "Sharp thinking. Soft spot for you." },
  { id: "pyramid", name: "Pyramid", description: "A different angle on your day." },
  { id: "drop", name: "Drop", description: "Curious by nature. Always in your orbit." },
];

export const ACCESSORIES: { id: Accessory; name: string }[] = [
  { id: "none", name: "None" },
  { id: "headphones", name: "Headphones" },
  { id: "halo", name: "Halo" },
  { id: "cap", name: "Cap" },
  { id: "beanie", name: "Beanie" },
  { id: "crown", name: "Crown" },
];

export const HOLDINGS: { id: Holding; name: string; icon: LucideIcon | null; adminOnly?: boolean; future?: boolean }[] = [
  { id: "none", name: "Nothing", icon: null },
  { id: "coffee", name: "Coffee", icon: Coffee },
  { id: "book", name: "Book", icon: Book },
  { id: "plant", name: "Plant", icon: Sprout },
  { id: "glitch", name: "Glitch core", icon: Binary, adminOnly: true },
  { id: "star", name: "Star", icon: Star, future: true },
  { id: "heart", name: "Heart", icon: Heart, future: true },
  { id: "rocket", name: "Rocket", icon: Rocket, future: true },
  { id: "music", name: "Music", icon: Music, future: true },
  { id: "game", name: "Game", icon: Gamepad2, future: true },
];

/** Check the active account at display/apply time, including synced outfits. */
export function lookForRole(look: Look, admin: boolean): Look {
  const item = HOLDINGS.find(h => h.id === look.holding);
  return item && !item.future && (!item.adminOnly || admin) ? look : { ...look, holding: "none" };
}

const KEY = "axiom.lemma.look";

let look: Look = normaliseLook(readSetting(KEY));
const listeners = new Set<() => void>();
let colourSave: number | undefined;
function saveLook() {
  window.clearTimeout(colourSave); colourSave = undefined;
  saveSetting(KEY, look);
}
window.addEventListener("pagehide", () => { if (colourSave !== undefined) saveLook(); });

onSettingSynced(KEY, (saved) => {
  look = normaliseLook(saved);
  listeners.forEach((listener) => listener());
});

/** Keep old wardrobes, and ignore corrupt or obsolete preference fields. */
export function normaliseLook(saved: unknown): Look {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...STANDARD };
  const value = saved as Record<string, unknown>;
  const legacy: Record<string, Shell> = { round: "orb", bubble: "orb", hex: "prism", shield: "drop" };
  const shape = typeof value.shape === "string" ? legacy[value.shape] ?? value.shape : undefined;
  const color = (input: unknown, fallback: string) => typeof input === "string" && (input === "theme" || /^#[\da-f]{6}$/i.test(input)) ? input : fallback;
  return {
    glow: color(value.glow, STANDARD.glow),
    shell: color(value.shell, STANDARD.shell),
    shape: SHAPES.find((s) => s.id === shape)?.id ?? STANDARD.shape,
    accessory: ACCESSORIES.find((a) => a.id === value.accessory)?.id ?? STANDARD.accessory,
    facewear: value.facewear === "glasses" || value.facewear === "sunglasses" ? value.facewear : "none",
    neckwear: value.neckwear === "bow" || value.accessory === "bow" ? "bow" : "none",
    finish: FINISHES.find((f) => f.id === value.finish)?.id ?? "hologram",
    ...Object.fromEntries((["headwearColor", "facewearColor", "neckwearColor", "jewelColor"] as const).map((key) => [key, color(value[key], "auto")])) as Pick<Look, "headwearColor" | "facewearColor" | "neckwearColor" | "jewelColor">,
    holdingColor: "auto",
    holding: HOLDINGS.find((h) => h.id === value.holding)?.id ?? STANDARD.holding,
  };
}

export function setLook(change: Partial<Look>) {
  look = normaliseLook({ ...look, ...change });
  window.clearTimeout(colourSave);
  // Native colour pickers emit a stream of input events while the selector moves.
  if (Object.keys(change).every(key => ["headwearColor", "facewearColor", "neckwearColor", "jewelColor"].includes(key))) colourSave = window.setTimeout(saveLook, 180);
  else saveLook();
  listeners.forEach((listener) => listener());
}

export function useLook(): Look {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => look,
  );
}

/** A look's colours as the CSS variables the face reads. */
export function lookColors(l: Look): Record<string, string> {
  const glow = GLOWS.find((g) => g.id === l.glow)?.color ?? l.glow;
  const shell = SHELLS.find((s) => s.id === l.shell)?.color ?? l.shell;
  return { "--lemma-glow": glow, "--lemma-shell": shell };
}
