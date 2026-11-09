// Settings the window keeps, and which of them are the person's profile:
// those sync to their other computers through the profile table
// (src-tauri/src/profile). Every setting is kept in local storage too, so
// the window can paint straight away (and works offline, or on the web).
//
// A synced setting goes to the profile only when it's changed here, never
// just for being read, so a new computer's defaults can't overwrite the
// account's. When a sync brings another computer's change, the local copy
// is updated and whoever's listening hears the new value.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getAccountStatus } from "./account";
import { hasProfileSync } from "./platform";

/**
 * The settings that make up the profile: local storage key → the name it
 * syncs under. Anything not listed stays on this computer (open tabs, the
 * page each view was on, the microphone).
 */
export const SYNCED: Record<string, string> = {
  "axiom.themePrefs": "theme",
  "axiom.tilePositions.v1": "overview.tilePositions",
  "axiom.tileSizes": "overview.tileSizes",
  "axiom.overview.hidden.v1": "overview.hidden",
  "axiom.dailyPlan.overviewLayouts.v2": "dailyPlan.overviewLayouts",
  "axiom.projectBoard.overviewLayouts.v1": "projectBoard.overviewLayouts",
  "axiom.reading.overviewLayouts.v1": "reading.overviewLayouts",
  "axiom.uni.overviewLayouts.v1": "uni.overviewLayouts",
  "axiom.activityOrder.v1": "activityOrder",
  "axiom.installed": "extensions.installed",
  "axiom.disabled": "extensions.disabled",
  "axiom.lemma.look": "lemma.look",
  "axiom.lemma.preferences": "lemma.preferences",
  "axiom.lemma.persona": "lemma.persona",
  "axiom.lemma.compact": "lemma.compact",
  "axiom.assistant.areas": "lemma.areas",
  "axiom.assistant.aloud": "lemma.aloud",
  "axiom.desk": "lemma.desk",
  "axiom.dailyPlan.view": "dailyPlan.view",
  "axiom.dailyPlan.connectHintDismissed": "dailyPlan.connectHintDismissed",
  "axiom.board.view": "board.view",
  "axiom.board.groupBy": "board.groupBy",
  "axiom.board.zoom": "board.zoom",
  "axiom.notes.sort": "notes.sort",
  "axiom.notes.handwriting": "notes.handwriting",
  "axiom.notes.stickyToOverview": "notes.stickyToOverview",
  "axiom.whatsNew.seen": "whatsNew.seen",
};

/** Set once this computer's settings from before profiles synced have been sent. */
const IMPORTED = "axiom.profile.imported";
/** Changes wait this long, so dragging a tile sends where it ended up, once. */
const SEND_AFTER_MS = 400;

const listeners = new Map<string, Set<(value: unknown) => void>>();
const unsent = new Map<string, ReturnType<typeof setTimeout>>();

/** A saved setting, or undefined. Values saved as plain text by older versions read as that text. */
export function readSetting(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Synced settings kept to this computer for now (see `holdSync`). */
const held = new Set<string>();

/**
 * Keeps a synced setting to this computer until `releaseSync`: changes are
 * saved here but not sent. For a first run, before it's known whether the
 * account that signs in already has its own choice (see shell/firstRun).
 */
export function holdSync(key: string) {
  held.add(key);
}

export function releaseSync(key: string) {
  held.delete(key);
}

/** This computer has nothing from before profiles synced: there's nothing to send. */
export function markImported() {
  try {
    localStorage.setItem(IMPORTED, "1");
  } catch {
    // Storage unavailable: nothing was saved to send either.
  }
}

/**
 * Sets a setting on this computer only, as if it had been read, not chosen:
 * whoever's listening hears it, and it isn't sent to the profile.
 */
export function setLocalSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the listeners still get it.
  }
  listeners.get(key)?.forEach((listener) => listener(value));
}

/** Saves a setting here, and to the profile if it's part of it. */
export function saveSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: it lasts for this session, and still syncs.
  }
  const name = SYNCED[key];
  if (!name || !hasProfileSync() || held.has(key)) return;
  clearTimeout(unsent.get(key));
  unsent.set(
    key,
    setTimeout(() => {
      unsent.delete(key);
      invoke("profile_set", { name, value }).catch(() => {});
    }, SEND_AFTER_MS),
  );
}

/**
 * Calls `listener` with a setting's new value whenever it changes from
 * elsewhere: a sync, or Axiom's other window (Lemma on the desktop shares
 * this computer's storage). Returns a way to stop.
 */
export function onSettingSynced(key: string, listener: (value: unknown) => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

// The other window saved a setting: whoever's listening here hears it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || e.newValue === null) return;
    const set = listeners.get(e.key);
    if (!set?.size) return;
    let value: unknown;
    try {
      value = JSON.parse(e.newValue);
    } catch {
      value = e.newValue;
    }
    set.forEach((listener) => listener(value));
  });
}

/** Brings the local copies up to date with the profile. */
async function pull() {
  const profile = await invoke<Record<string, unknown>>("profile_settings");
  for (const [key, name] of Object.entries(SYNCED)) {
    // A change made here that hasn't gone yet is newer.
    if (!(name in profile) || unsent.has(key)) continue;
    const json = JSON.stringify(profile[name]);
    let current: string | null = null;
    try {
      current = localStorage.getItem(key);
    } catch {
      // No local copy to compare: tell the listeners anyway.
    }
    if (json === current) continue;
    try {
      localStorage.setItem(key, json);
    } catch {
      // Storage unavailable: the listeners still get it.
    }
    listeners.get(key)?.forEach((listener) => listener(profile[name]));
  }
}

/**
 * Once per computer: sends the settings it had from before profiles synced,
 * where the profile hasn't got them. Waits until a sync has brought the
 * account's (or there's no account), so this computer's never replace them.
 */
async function importOnce(signedOut: boolean) {
  try {
    if (localStorage.getItem(IMPORTED)) return;
  } catch {
    return;
  }
  if (signedOut && (await getAccountStatus()).state !== "signed_out") return;
  const profile = await invoke<Record<string, unknown>>("profile_settings");
  for (const [key, name] of Object.entries(SYNCED)) {
    const value = readSetting(key);
    if (value !== undefined && !(name in profile)) await invoke("profile_set", { name, value });
  }
  try {
    localStorage.setItem(IMPORTED, "1");
  } catch {
    // It tries again next time; settings already there are left alone.
  }
}

if (hasProfileSync()) {
  void pull().catch(() => {});
  void listen("data-changed", () => void pull().catch(() => {})).catch(() => {});
  const status = (state: string) => {
    if (state === "synced" || state === "off") void importOnce(state === "off").catch(() => {});
  };
  void invoke<{ state: string }>("sync_status").then((s) => status(s.state), () => {});
  void listen<{ state: string }>("sync-status", (e) => status(e.payload.state)).catch(() => {});
}
