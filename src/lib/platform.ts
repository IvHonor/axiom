// Which Axiom this is: the desktop app (Tauri) or Axiom on the web, the same
// app built with `vite --mode web` (see vite.config.ts and src/web).
import { isTauri } from "@tauri-apps/api/core";
import { isMac } from "./shortcut";

/** Running in a browser, as Axiom on the web. */
export const isWeb = import.meta.env.MODE === "web";

/** Native macOS only; a browser on a Mac keeps the website's normal UI. */
export const isMacDesktop = () => !isWeb && isTauri() && isMac;

/** The person's settings sync to their other devices here (the desktop app, or the web). */
export const hasProfileSync = () => isWeb || isTauri();
