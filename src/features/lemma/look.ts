// How Lemma looks: colours, shell, an accessory and something to hold. Part
// of the profile, so it syncs, and shared by every face. "theme" colours
// follow the colour theme, so the standard Lemma always fits.
import { Binary, Book, CircleDot, Coffee, Compass, Feather, Gamepad2, Heart, Lamp, Music, Rocket, Sprout, Star, Watch, type LucideIcon } from "lucide-react";
import type { AccountStatus } from "../../lib/account";
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";

export type Shell = "orb" | "prism" | "pyramid" | "drop";
/** The common pieces earned through Axiom's own achievements. */
export const EVERYDAY_HEADWEAR = ["bucket-hat", "beret", "flat-cap", "headband", "sun-hat"] as const;
export const EVERYDAY_NECKWEAR = ["scarf", "bandana", "chain-necklace", "lanyard", "bead-necklace"] as const;
export const EVERYDAY_FACEWEAR = ["round-glasses", "aviators", "cat-eye", "tinted-glasses"] as const;
export type EverydayHeadwear = typeof EVERYDAY_HEADWEAR[number];
export type EverydayNeckwear = typeof EVERYDAY_NECKWEAR[number];
export type EverydayFacewear = typeof EVERYDAY_FACEWEAR[number];
export type Accessory = "none" | "headphones" | "halo" | "cap" | "beanie" | "crown" | "fedora" | "gearwright-hat" | "scribe-cap" | "deerstalker" | "dragon-helm" | EverydayHeadwear;
const FACEWEAR_IDS = ["glasses", "sunglasses", "loupe", "griffin-goggles", "three-realms", ...EVERYDAY_FACEWEAR] as const;
const NECKWEAR_IDS = ["tie", "cog-bolo", "ribbon-bookmark", "counts-collar", ...EVERYDAY_NECKWEAR] as const;
export type Finish = "hologram" | "glass" | "metal" | "matte" | "skeleton" | "living-ink" | "voyage";
export type GlowEffect = "none" | "motes" | "embers" | "fireflies" | "verdigris" | "mood-ink" | "pack-of-cards";
export type Holding = "none" | "coffee" | "book" | "plant" | "star" | "heart" | "rocket" | "music" | "game" | "glitch" | "first-light" | "long-hour" | "last-word" | "gyges-ring" | "true-compass";

export interface Look {
  /** The eyes, crest and side panels. "theme" is the theme's accent. */
  glow: string;
  /** The head. "theme" is a shade of the theme's surface. */
  shell: string;
  shape: Shell;
  accessory: Accessory;
  facewear: "none" | typeof FACEWEAR_IDS[number];
  neckwear: "none" | "bow" | typeof NECKWEAR_IDS[number];
  finish: Finish;
  /** Wearable colours are editable while equipped. Held items retain their own palette. */
  headwearColor: string;
  facewearColor: string;
  neckwearColor: string;
  holdingColor: string;
  jewelColor: string;
  /** What it holds when it isn't busy (busy, it holds the area's tool). */
  holding: Holding;
  /** The Glow slot: the particles drifting around it. */
  glowEffect: GlowEffect;
}

export const STANDARD: Look = { glow: "#2ec4ff", shell: "theme", shape: "orb", accessory: "none", holding: "none", facewear: "none", neckwear: "none", finish: "hologram", headwearColor: "auto", facewearColor: "auto", neckwearColor: "auto", holdingColor: "auto", jewelColor: "auto", glowEffect: "motes" };
export const FINISHES: { id: Finish; name: string }[] = [{ id: "hologram", name: "Hologram" }, { id: "glass", name: "Frosted glass" }, { id: "metal", name: "Polished metal" }, { id: "matte", name: "Matte" }, { id: "skeleton", name: "Skeleton" }, { id: "living-ink", name: "Living ink" }, { id: "voyage", name: "Voyage of Odysseus" }];
export const GLOW_EFFECTS: { id: GlowEffect; name: string }[] = [{ id: "none", name: "No glow" }, { id: "motes", name: "Motes" }, { id: "embers", name: "Embers" }, { id: "fireflies", name: "Fireflies" }, { id: "verdigris", name: "Verdigris" }, { id: "mood-ink", name: "Mood ink" }, { id: "pack-of-cards", name: "Pack of cards" }];

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
  { id: "fedora", name: "Fedora" },
  { id: "gearwright-hat", name: "Top hat" },
  { id: "scribe-cap", name: "Scribe's cap" },
  { id: "deerstalker", name: "Deerstalker" },
  { id: "dragon-helm", name: "Dragon helm" },
  { id: "bucket-hat", name: "Bucket hat" },
  { id: "beret", name: "Beret" },
  { id: "flat-cap", name: "Flat cap" },
  { id: "headband", name: "Headband" },
  { id: "sun-hat", name: "Sun hat" },
];

export const HOLDINGS: { id: Holding; name: string; source: string; icon: LucideIcon | null; adminOnly?: boolean; earlyOnly?: boolean; future?: boolean; secret?: boolean }[] = [
  { id: "none", name: "Nothing", source: "No item equipped.", icon: null },
  { id: "coffee", name: "Coffee", source: "Available to everyone.", icon: Coffee },
  { id: "book", name: "Book", source: "Available to everyone.", icon: Book },
  { id: "plant", name: "Plant", source: "Available to everyone.", icon: Sprout },
  { id: "first-light", name: "First Light", source: "Given to users who created an account before 21 March 2027.", icon: Lamp, earlyOnly: true },
  { id: "glitch", name: "Glitch core", source: "Given to admins.", icon: Binary, adminOnly: true },
  { id: "long-hour", name: "The Long Hour", source: "Earned by planning your day 21 days in a row. Its animation is The Hour Stops.", icon: Watch },
  { id: "last-word", name: "The Last Word", source: "Earned by writing in your Journal 45 days in a row.", icon: Feather },
  { id: "gyges-ring", name: "Ring of Gyges", source: "Earned through the Reading Tracker.", icon: CircleDot },
  { id: "true-compass", name: "True Compass", source: "Its needle steadies once you've made progress today.", icon: Compass, secret: true },
  { id: "star", name: "Star", source: "Not yet available.", icon: Star, future: true },
  { id: "heart", name: "Heart", source: "Not yet available.", icon: Heart, future: true },
  { id: "rocket", name: "Rocket", source: "Not yet available.", icon: Rocket, future: true },
  { id: "music", name: "Music", source: "Not yet available.", icon: Music, future: true },
  { id: "game", name: "Game", source: "Not yet available.", icon: Gamepad2, future: true },
];

/** Eligibility follows the server's account creation time, never this device's clock or saved wardrobe. */
export function hasFirstLight(account: AccountStatus | null): boolean {
  return account?.state === "signed_in" && !!account.createdAt && Date.parse(account.createdAt) < Date.parse("2027-03-21T00:00:00Z");
}

/** Check the active account at display/apply time, including synced outfits. */
export function lookForRole(look: Look, admin: boolean, firstLight = false): Look {
  const item = HOLDINGS.find(h => h.id === look.holding);
  return item && !item.future && (!item.adminOnly || admin) && (!item.earlyOnly || firstLight) ? look : { ...look, holding: "none" };
}

/** Each earned item: the part of a look it fills, and what's worn there without it. */
const REWARD_ITEMS: { field: keyof Look; value: string; reward: string; without: string }[] = [
  { field: "accessory", value: "fedora", reward: "fedora", without: "none" },
  { field: "accessory", value: "gearwright-hat", reward: "gearwright-hat", without: "none" },
  { field: "neckwear", value: "tie", reward: "tie", without: "none" },
  { field: "neckwear", value: "cog-bolo", reward: "cog-bolo", without: "none" },
  { field: "facewear", value: "loupe", reward: "loupe", without: "none" },
  { field: "finish", value: "skeleton", reward: "skeleton", without: "hologram" },
  { field: "holding", value: "long-hour", reward: "long-hour", without: "none" },
  { field: "glowEffect", value: "verdigris", reward: "verdigris", without: STANDARD.glowEffect },
  { field: "accessory", value: "scribe-cap", reward: "scribe-cap", without: "none" },
  { field: "neckwear", value: "ribbon-bookmark", reward: "ribbon-bookmark", without: "none" },
  { field: "finish", value: "living-ink", reward: "living-ink", without: "hologram" },
  { field: "holding", value: "last-word", reward: "last-word", without: "none" },
  { field: "glowEffect", value: "mood-ink", reward: "mood-ink", without: STANDARD.glowEffect },
  { field: "facewear", value: "griffin-goggles", reward: "griffin-goggles", without: "none" },
  { field: "facewear", value: "three-realms", reward: "three-realms", without: "none" },
  { field: "accessory", value: "deerstalker", reward: "deerstalker", without: "none" },
  { field: "accessory", value: "dragon-helm", reward: "dragon-helm", without: "none" },
  { field: "neckwear", value: "counts-collar", reward: "counts-collar", without: "none" },
  { field: "glowEffect", value: "pack-of-cards", reward: "pack-of-cards", without: STANDARD.glowEffect },
  { field: "finish", value: "voyage", reward: "voyage", without: "hologram" },
  { field: "holding", value: "gyges-ring", reward: "gyges-ring", without: "none" },
  { field: "holding", value: "true-compass", reward: "true-compass", without: "none" },
  ...EVERYDAY_HEADWEAR.map(id => ({ field: "accessory" as const, value: id, reward: id, without: "none" })),
  ...EVERYDAY_NECKWEAR.map(id => ({ field: "neckwear" as const, value: id, reward: id, without: "none" })),
  ...EVERYDAY_FACEWEAR.map(id => ({ field: "facewear" as const, value: id, reward: id, without: "none" })),
];

/** The reward that unlocks this choice, if it takes one. */
export const rewardFor = (field: keyof Look, value: string) => REWARD_ITEMS.find((item) => item.field === field && item.value === value)?.reward;

/** Saved and synced outfits keep their choices, but only earned rewards are worn. */
export function lookForRewards(look: Look, rewards: readonly string[]): Look {
  const missing = REWARD_ITEMS.filter((item) => look[item.field] === item.value && !rewards.includes(item.reward));
  return missing.length ? { ...look, ...(Object.fromEntries(missing.map((item) => [item.field, item.without])) as Partial<Look>) } : look;
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
  const next = normaliseLook(saved);
  // Our own change coming back from a sync is no change at all.
  if (JSON.stringify(next) === JSON.stringify(look)) return;
  look = next;
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
    facewear: FACEWEAR_IDS.find((id) => id === value.facewear) ?? "none",
    neckwear: NECKWEAR_IDS.find((id) => id === value.neckwear) ?? (value.neckwear === "bow" || value.accessory === "bow" ? "bow" : "none"),
    finish: FINISHES.find((f) => f.id === value.finish)?.id ?? "hologram",
    ...Object.fromEntries((["headwearColor", "facewearColor", "neckwearColor", "jewelColor"] as const).map((key) => [key, color(value[key], "auto")])) as Pick<Look, "headwearColor" | "facewearColor" | "neckwearColor" | "jewelColor">,
    holdingColor: "auto",
    holding: HOLDINGS.find((h) => h.id === value.holding)?.id ?? STANDARD.holding,
    glowEffect: GLOW_EFFECTS.find((g) => g.id === value.glowEffect)?.id ?? STANDARD.glowEffect,
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
