import type { DbStatus } from "../lib/backend";
import type { SyncStatus } from "../lib/sync";

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Short sync state for the status bar. */
export function syncLabel(sync: SyncStatus, now = Date.now()): string {
  switch (sync.state) {
    case "off":
      return "Off";
    case "needs_choice":
      return "Action needed";
    case "syncing":
      return "Syncing";
    case "synced":
      return `Synced ${ago(sync.at, now)}`;
    case "offline":
      return "Offline";
    case "error":
      return "Error";
  }
}

/** One sentence for tooltips and the account panel. */
export function syncDetail(sync: SyncStatus, now = Date.now()): string {
  switch (sync.state) {
    case "off":
      return "Sign in to sync your boards between computers.";
    case "needs_choice":
      return "Choose what to do with the data on this computer before syncing starts.";
    case "syncing":
      return "Sending and receiving changes.";
    case "synced":
      return `Everything is up to date. Last synced ${ago(sync.at, now)}.`;
    case "offline":
      return `Can't reach the server. Your changes are saved on this computer and will sync when you're back online.${
        sync.lastSynced ? ` Last synced ${ago(sync.lastSynced, now)}.` : ""
      }`;
    case "error":
      return sync.message;
  }
}

/** "Wednesday October 21". Run it through useLabels().label for the theme's style. */
export function formatDay(date: Date): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday} ${month} ${date.getDate()}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

export function dbLabel(db: DbStatus): string {
  switch (db.state) {
    case "connected":
      return "Saved";
    case "connecting":
      return "Opening";
    case "error":
      return "Can't open your data";
  }
}

export function dbDetail(db: DbStatus): string {
  switch (db.state) {
    case "connected":
      return "Everything is saved on this computer as you work.";
    case "connecting":
      return "Opening the local database.";
    case "error":
      return `Axiom couldn't open your data: ${db.message}`;
  }
}

/** The status dot's look, shared with the status bar. */
export function syncDot(sync: SyncStatus): string {
  switch (sync.state) {
    case "synced":
      return "is-connected";
    case "syncing":
      return "is-connecting";
    case "offline":
    case "error":
    case "needs_choice":
      return "is-error";
    case "off":
      return "";
  }
}
