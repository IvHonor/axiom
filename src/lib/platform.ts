// Which Axiom this is: the desktop app (Tauri) or Axiom on the web, the same
// app built with `vite --mode web` (see vite.config.ts and src/web).
import { isTauri } from "@tauri-apps/api/core";

/** Running in a browser, as Axiom on the web. */
export const isWeb = import.meta.env.MODE === "web";

/** The person's settings sync to their other devices here (the desktop app, or the web). */
export const hasProfileSync = () => isWeb || isTauri();
