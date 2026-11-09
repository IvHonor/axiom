// How the sidebar behaves, on this computer: whether it follows what's open
// and remembers each area's choice, when it tucks itself away, how wide it
// is, and which areas were opened lately (for Recent, and to fold the ones
// hardly used into More).
import { useSyncExternalStore } from "react";

export interface SidebarPrefs {
  /** An area brings its own sidebar; the overview, the list of areas. */
  follow: boolean;
  /** An area where you closed the sidebar keeps it closed (switching tabs never opens it). */
  perArea: boolean;
  /** Tucked away while the window is narrow. */
  narrow: boolean;
  /** Tucked away for areas that need the room (the board, the planner's week and month, an open journal entry). */
  roomy: boolean;
  /** Tucked away after a little while of writing in the journal or notes. */
  writing: boolean;
  /** Tucked away while a focus timer runs. */
  focus: boolean;
  /** An area's sidebar slides away once you click into the area, like a drawer. */
  closeOnUse: boolean;
}

export const DEFAULT_SIDEBAR: SidebarPrefs = { follow: true, perArea: true, narrow: true, roomy: true, writing: true, focus: false, closeOnUse: true };

export const SIDEBAR_SWITCHES: { key: keyof SidebarPrefs; label: string; hint: string }[] = [
  { key: "closeOnUse", label: "Close when I click into an area", hint: "It shows when you pick an area, then slides away once you're in it." },
  { key: "follow", label: "Follow what's open", hint: "An area brings its own sidebar; the overview, the list of areas." },
  { key: "perArea", label: "Remember each area", hint: "Where you closed it, it stays closed when you come back." },
  { key: "narrow", label: "Hide when the window is narrow", hint: "Under 1100px wide; back when there's room." },
  { key: "roomy", label: "Hide for areas that need room", hint: "The board, the planner's week and month, an open journal entry." },
  { key: "writing", label: "Hide while writing", hint: "After a few seconds of typing in the journal or notes." },
  { key: "focus", label: "Hide during a focus timer", hint: "While a task's timer runs." },
];

/** The sidebar's width: draggable between these, back to the usual with a double-click. */
export const WIDTH = { usual: 300, least: 220, most: 480 };

const PREFS_KEY = "axiom.sidebar.prefs";
const WIDTH_KEY = "axiom.sidebar.width";
const PER_AREA_KEY = "axiom.sidebar.perArea";
const USAGE_KEY = "axiom.sidebar.usage";

function read<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage, it lasts while Axiom's open.
  }
}

function parsePrefs(saved: unknown): SidebarPrefs {
  const v = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SIDEBAR };
  for (const key of Object.keys(out) as (keyof SidebarPrefs)[]) if (typeof v[key] === "boolean") out[key] = v[key] as boolean;
  return out;
}

let prefs = parsePrefs(read(PREFS_KEY, null));
let width = clampWidth(read(WIDTH_KEY, WIDTH.usual));
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function clampWidth(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : WIDTH.usual;
  return Math.round(Math.min(WIDTH.most, Math.max(WIDTH.least, n)));
}

export function setSidebarPrefs(change: Partial<SidebarPrefs>) {
  prefs = parsePrefs({ ...prefs, ...change });
  write(PREFS_KEY, prefs);
  changed();
}
export const useSidebarPrefs = () => useSyncExternalStore(subscribe, () => prefs);

export function setSidebarWidth(next: number, keep = true) {
  width = clampWidth(next);
  if (keep) write(WIDTH_KEY, width);
  changed();
}
export const useSidebarWidth = () => useSyncExternalStore(subscribe, () => width);

/** Whether the sidebar was left open in an area (undefined: never said). */
export const areaWantsSidebar = (id: string): boolean | undefined => read<Record<string, boolean>>(PER_AREA_KEY, {})[id];
export function rememberAreaSidebar(id: string, open: boolean) {
  write(PER_AREA_KEY, { ...read<Record<string, boolean>>(PER_AREA_KEY, {}), [id]: open });
}

/** When each area was last opened, and since when that's been kept track of. */
interface Usage {
  since: number;
  opened: Record<string, number>;
}
let usage: Usage = read<Usage>(USAGE_KEY, { since: Date.now(), opened: {} });
if (!usage.since) usage = { since: Date.now(), opened: usage.opened ?? {} };
export function noteOpened(id: string) {
  if (usage.opened[id] && Date.now() - usage.opened[id] < 5000) return;
  usage = { ...usage, opened: { ...usage.opened, [id]: Date.now() } };
  write(USAGE_KEY, usage);
  changed();
}
export const useUsage = () => useSyncExternalStore(subscribe, () => usage);

/** Not opened in this long (and tracked at least this long), an area folds into More. */
export const RARELY_MS = 14 * 24 * 60 * 60_000;
