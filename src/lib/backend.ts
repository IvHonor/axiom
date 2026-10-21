// Typed wrappers around Tauri commands. React only ever talks to Rust through
// this file; it never touches the database directly.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `DbStatus` in src-tauri/src/db/mod.rs. */
export type DbStatus =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "error"; message: string };

/** Mirrors `AppStatus` in src-tauri/src/system.rs. */
export interface AppStatus {
  version: string;
  db: DbStatus;
}

export const getAppStatus = () => invoke<AppStatus>("app_status");

/** Saves everything on this computer as JSON in Downloads; resolves to the file's path. */
export const exportData = () => invoke<string>("data_export");
