// How Lemma looks: colours, shell, an accessory and something to hold. Kept
// on this computer and shared by every face. "theme" colours follow the
// colour theme, so the standard Lemma always fits.
import { Book, Coffee, Gamepad2, Heart, Music, Rocket, Sprout, Star, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Shell = "orb" | "prism" | "pyramid" | "drop";
export type Accessory = "none" | "headphones" | "halo" | "cap" | "bow" | "beanie" | "crown";
export type Holding = "none" | "coffee" | "book" | "plant" | "star" | "heart" | "rocket" | "music" | "game";

export interface Look {
  /** The eyes, crest and side panels. "theme" is the theme's accent. */
  glow: string;
  /** The head. "theme" is a shade of the theme's surface. */
  shell: string;
  shape: Shell;
  accessory: Accessory;
  /** What it holds when it isn't busy (busy, it holds the area's tool). */
  holding: Holding;
}

export const STANDARD: Look = { glow: "#2ec4ff", shell: "theme", shape: "orb", accessory: "none", holding: "none" };

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
  { id: "bow", name: "Bow tie" },
];

export const HOLDINGS: { id: Holding; name: string; icon: LucideIcon | null }[] = [
  { id: "none", name: "Nothing", icon: null },
  { id: "coffee", name: "Coffee", icon: Coffee },
  { id: "book", name: "Book", icon: Book },
  { id: "plant", name: "Plant", icon: Sprout },
  { id: "star", name: "Star", icon: Star },
  { id: "heart", name: "Heart", icon: Heart },
  { id: "rocket", name: "Rocket", icon: Rocket },
  { id: "music", name: "Music", icon: Music },
  { id: "game", name: "Game", icon: Gamepad2 },
];

const KEY = "axiom.lemma.look";

let look: Look = load();
const listeners = new Set<() => void>();

function load(): Look {
  try {
    return normaliseLook(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return STANDARD;
  }
}

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
    holding: HOLDINGS.find((h) => h.id === value.holding)?.id ?? STANDARD.holding,
  };
}

export function setLook(change: Partial<Look>) {
  look = normaliseLook({ ...look, ...change });
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Storage unavailable: the look lasts for this session only.
  }
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
