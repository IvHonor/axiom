// What Rust is to the desktop app, for Axiom on the web: who's signed in,
// the account's data (an IndexedDB copy of what syncs, with a queue of edits
// still to send), and the sync loop. Sync goes through the website's
// /api/terminal/sync, which keeps the sign-in in httpOnly cookies, so no
// token ever reaches this page.
//
// The browser holds the same rows the desktop does, in the desktop's own
// wire format (snake_case columns, soft deletes, per-field timestamps), so a
// change made here lands on the desktop exactly as one made there.
import { queueChanges, readWorkspace, SessionChanged, syncWorkspace } from "../../site/src/lib/terminal/database";
import { coalesceEdits, validateChanges, type Fields, type SyncRecord } from "../../site/src/lib/terminal/protocol";
import { emitNow } from "./tauri/event";
import { browserSessionId } from "../../site/src/lib/browser-session";

export interface WebAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  admin: boolean;
  createdAt: string | null;
}

export interface Edit {
  table: string;
  id: string;
  fields: Fields;
}

export type SyncState =
  | { state: "off" }
  | { state: "syncing"; lastSynced: string | null }
  | { state: "synced"; at: string }
  | { state: "offline"; lastSynced: string | null }
  | { state: "error"; message: string };

export interface Snapshot {
  /** Rows that aren't deleted, with this browser's unsent edits applied. */
  records: SyncRecord[];
  /** Deleted ones too (routines' skipped days are kept as deleted blocks). */
  allRecords: SyncRecord[];
}

/** Demo mode (`?demo` while developing): no account, nothing leaves the browser. */
export const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");

let account: WebAccount | null = null;
let status: SyncState = { state: "syncing", lastSynced: null };
let lastSynced: string | null = null;
let cached: Promise<Snapshot> | null = null;
let clock = 0;
let channel: BroadcastChannel | null = null;
let busy = false;
let again = false;
let soon = 0;
let expired = false;
let browserSession: string | null = null;

export const currentAccount = () => checkSession() ? account : null;
export const syncState = () => status;

function setStatus(next: SyncState) {
  status = next;
  emitNow("sync-status", next);
}

/**
 * Who was signed in when Axiom last reached the website, so the app (above
 * all once installed on a phone) opens with no connection: the data is on
 * this device, and sync catches up once it's back. Not the picture, which can
 * be large. Forgotten when the server says signed out, or on signing out.
 */
const LAST_ACCOUNT = "axiom.web.account";

function remember(found: WebAccount) {
  try {
    localStorage.setItem(LAST_ACCOUNT, JSON.stringify({ ...found, avatar: null, session: browserSessionId(document.cookie) }));
  } catch {
    // Storage unavailable: it just won't open offline.
  }
}

function remembered(): WebAccount | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_ACCOUNT) ?? "null");
    const session = browserSessionId(document.cookie);
    return session && saved?.session === session && typeof saved.id === "string" && typeof saved.email === "string" ? (saved as WebAccount) : null;
  } catch {
    return null;
  }
}

function forgetAccount() {
  try {
    localStorage.removeItem(LAST_ACCOUNT);
  } catch {
    // Nothing kept.
  }
}

async function fetchAccount(): Promise<WebAccount | null> {
  // An early account, so demo mode shows what early accounts get (First Light);
  // `?demo&newaccount`, one made just now, to see what someone new gets (the tour).
  if (DEMO) {
    const createdAt = new URLSearchParams(location.search).has("newaccount") ? new Date().toISOString() : "2026-11-01T00:00:00Z";
    return { id: "demo", email: "demo@axiom.local", displayName: "Demo", avatar: null, admin: false, createdAt };
  }
  const offline = () => {
    if (!browserSessionId(document.cookie)) { forgetAccount(); return null; }
    const last = remembered();
    if (last) return last;
    throw new Error("Axiom couldn't reach your account. Connect to the internet once to sign in on this device; after that it opens offline too.");
  };
  let answer: Response;
  try {
    answer = await fetch("/api/terminal/session", { cache: "no-store", credentials: "same-origin" });
  } catch {
    return offline();
  }
  if (answer.status === 401) {
    forgetAccount();
    return null;
  }
  if (!answer.ok) return offline();
  const found = (await answer.json()) as WebAccount;
  remember(found);
  return found;
}

/** Signed out: back to the website to sign in, then straight back here. */
export function goSignIn() {
  location.href = `/sign-in?next=${encodeURIComponent("/terminal")}`;
}

/** Cookie deletion or a new sign-in locks cached data in every open tab. */
function checkSession() {
  if (DEMO) return true;
  if (expired) return false;
  if (account && (!browserSession || browserSessionId(document.cookie) !== browserSession)) {
    expireSession();
    return false;
  }
  return true;
}

function expireSession() {
  expired = true;
  account = null;
  cached = null;
  forgetAccount();
  emitNow("account-changed", { state: "signed_out" });
  goSignIn();
}

/** Resolves once there's an account and its data is open; every command waits for it. */
export const ready: Promise<WebAccount> = (async () => {
  const found = await fetchAccount();
  if (!found) {
    goSignIn();
    // Never resolves: the page is on its way to the sign-in.
    return new Promise<WebAccount>(() => {});
  }
  browserSession = browserSessionId(document.cookie);
  account = found;
  await readWorkspace(found.id);
  if (!checkSession()) return new Promise<WebAccount>(() => {});
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(`axiom-terminal-${found.id}`);
    channel.onmessage = event => event.data === "signed_out" ? expireSession() : changed(true);
  }
  if (DEMO) setStatus({ state: "off" });
  else {
    void sync();
    const visible = () => {
      if (!document.hidden && checkSession()) void sync();
    };
    window.addEventListener("online", visible);
    window.addEventListener("offline", () => setStatus({ state: "offline", lastSynced }));
    document.addEventListener("visibilitychange", visible);
    window.setInterval(visible, 60_000);
    window.setInterval(() => { if (!document.hidden) checkSession(); }, 1000);
  }
  return found;
})();

/** The account's data as it stands, read once until something changes. */
export function snapshot(): Promise<Snapshot> {
  if (!checkSession()) return Promise.reject(new SessionChanged("Your sign-in changed. Sign in again to continue."));
  if (!account) return ready.then(snapshot);
  if (!cached) {
    const id = account.id;
    cached = readWorkspace(id).then(({ records, allRecords }) => {
      if (!checkSession()) throw new SessionChanged("Your sign-in changed. Sign in again to continue.");
      return { records, allRecords };
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** Forgets the cached copy; with `others`, the views hear that the data changed. */
function changed(others: boolean) {
  cached = null;
  if (others) emitNow("data-changed");
}

const fingerprint = (rows: SyncRecord[]) => new Map(rows.map((row) => [`${row.table}/${row.id}`, JSON.stringify(row.data)]));

/** Sends this browser's edits and brings other devices'. Views hear about it when something came. */
export async function sync(): Promise<void> {
  if (!account || DEMO || !checkSession()) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  setStatus({ state: "syncing", lastSynced });
  try {
    const before = fingerprint((await snapshot()).allRecords);
    await syncWorkspace(account.id);
    cached = null;
    const after = (await snapshot()).allRecords;
    const came = after.length !== before.size || after.some((row) => before.get(`${row.table}/${row.id}`) !== JSON.stringify(row.data));
    lastSynced = new Date().toISOString();
    setStatus({ state: "synced", at: lastSynced });
    if (came) {
      emitNow("data-changed");
      channel?.postMessage("changed");
    }
  } catch (e) {
    if (e instanceof SessionChanged) {
      expireSession();
      setStatus({ state: "error", message: "Your sign-in changed. Reload this page to carry on; your edits are kept in this browser." });
    } else if (!navigator.onLine) setStatus({ state: "offline", lastSynced });
    else setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    if (again) {
      again = false;
      void sync();
    }
  }
}

/**
 * Saves edits to rows, as the desktop's database would: each field stamped
 * with when it changed, queued in this browser, then synced shortly after
 * (several edits in a row go together).
 */
export async function save(edits: Edit[]): Promise<void> {
  if (!edits.length) return;
  if (!account) await ready;
  if (!checkSession()) throw new Error("Your sign-in changed. Reload this page to carry on.");
  clock = Math.max(Date.now(), clock + 1);
  const at = new Date(clock).toISOString();
  const stamped = coalesceEdits(edits).map((edit) => ({ ...edit, fields: { ...edit.fields, updated_at: at }, changed_at: clock }));
  const changes = [];
  for (let i = 0; i < stamped.length; i += 100) changes.push(...validateChanges(stamped.slice(i, i + 100)));
  await queueChanges(account!.id, changes);
  changed(false);
  channel?.postMessage("changed");
  window.clearTimeout(soon);
  soon = window.setTimeout(() => void sync(), 1200);
}

/** Every row of a table that isn't deleted. */
export const rowsOf = (records: SyncRecord[], table: string) => records.filter((row) => row.table === table && !row.data.deleted_at);

/** A new row id: a UUIDv7, so ids sort by when they were made (like the desktop's). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const now = Date.now();
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Signs this browser out of the website, then goes to the homepage. */
export async function signOut() {
  if (!DEMO) {
    const answer = await fetch("/api/terminal/session", { method: "DELETE", credentials: "same-origin" })
      .catch(() => { throw new Error("Couldn't sign out. Connect to the internet and try again."); });
    if (!answer.ok) throw new Error("Couldn't sign out. Try again.");
  }
  expired = true;
  account = null;
  cached = null;
  forgetAccount();
  channel?.postMessage("signed_out");
  location.href = "/";
}
