// The first time Axiom opens on a computer (or in a browser): a few areas
// are on to start with rather than all of them, and Lemma shows the person
// around (see tour/). Anyone who had Axiom here before is left exactly as
// they were.
//
// The catch is an account that already exists, signed in on a new computer.
// Its choices must win, and if it never switched anything off it has
// everything on. So the starter set stays on this computer, unsynced, until
// someone signs in: an account made around or after the first run is new
// and takes the starter set with it; an older one keeps its own.
//
// Import this before anything else in the app, so it looks at local storage
// before anything has written to it.
import type { AccountStatus } from "../lib/account";
import { holdSync, markImported, onSettingSynced, readSetting, releaseSync, saveSetting, setLocalSetting } from "../lib/settings";

/** On this computer only: when Axiom first ran here, and whether that's still to be settled with an account. */
const FIRST_RUN = "axiom.firstRun";
/** The extensions switched off (see useInstalled). */
const DISABLED = "axiom.disabled";
/** The tour has been seen (or skipped) here. */
export const TOUR_SEEN = "axiom.tour.seen";

/** The areas a first run starts with. */
export const STARTER_AREAS = ["lemma", "daily_plan", "notes"];

/**
 * An account made this long before the first run still counts as new: on
 * the web, people create their account first and open Axiom straight after.
 */
const NEW_ACCOUNT_GRACE_MS = 60 * 60 * 1000;

interface FirstRun {
  at: string;
  /** Not yet settled with an account. */
  pending: boolean;
}

/** Anything of Axiom's in local storage means Axiom has run here before. */
function ranBefore(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("axiom.")) return true;
    }
    return false;
  } catch {
    // Can't tell: leave everything as it is.
    return true;
  }
}

function load(): FirstRun | null {
  const saved = readSetting(FIRST_RUN) as Partial<FirstRun> | undefined;
  if (saved && typeof saved.at === "string") return { at: saved.at, pending: saved.pending === true };
  if (ranBefore()) return null;
  const fresh = { at: new Date().toISOString(), pending: true };
  try {
    localStorage.setItem(FIRST_RUN, JSON.stringify(fresh));
  } catch {
    return null;
  }
  // Nothing here predates profiles, so nothing of this computer's is sent
  // over an account's own settings when it signs in.
  markImported();
  return fresh;
}

const firstRun = load();

/** The account's own list arrived by sync: that's what counts, not ours. */
let accountHasList = false;
let restoring = false;
if (firstRun?.pending) {
  holdSync(DISABLED);
  onSettingSynced(DISABLED, () => {
    if (!restoring) accountHasList = true;
  });
}

/** Axiom first ran here with this version or later (so: a starter set, a tour, no back catalogue of news). */
export const firstRanHere = (): boolean => firstRun !== null;

/** The starter set is in use here and not yet settled with an account. */
export const starterPending = (): boolean => !!firstRun?.pending;

/** The tour is still to be shown: Axiom's new here and it hasn't been seen or skipped. */
export const tourDue = (): boolean => firstRun !== null && readSetting(TOUR_SEEN) !== true;

/**
 * Once someone's signed in on a first run: is the account new, or older
 * than Axiom here? A new one takes the starter set to its other computers;
 * an older one keeps its own choices (everything on, if it never made any)
 * and skips the tour.
 */
export function settleFirstRun(account: AccountStatus | null): void {
  if (!firstRun?.pending || account?.state !== "signed_in") return;
  const created = account.createdAt ? Date.parse(account.createdAt) : NaN;
  // Unknown creation time: treat it as existing, so nobody loses anything.
  const existing = !(created >= Date.parse(firstRun.at) - NEW_ACCOUNT_GRACE_MS);
  firstRun.pending = false;
  try {
    localStorage.setItem(FIRST_RUN, JSON.stringify(firstRun));
  } catch {
    // It's settled again next time, the same way.
  }
  releaseSync(DISABLED);
  if (existing) {
    if (!accountHasList) {
      restoring = true;
      setLocalSetting(DISABLED, []);
      restoring = false;
    }
    setLocalSetting(TOUR_SEEN, true);
  } else {
    const list = readSetting(DISABLED);
    if (Array.isArray(list)) saveSetting(DISABLED, list);
  }
}
