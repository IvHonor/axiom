// Installing Axiom on the web as an app (no app store): what this browser
// allows. Chrome, Edge and Android hand over an install prompt; an iPhone or
// iPad installs from Safari's Share menu (Add to Home Screen); an app that's
// already installed has nothing to offer.
import { useSyncExternalStore } from "react";
import { isWeb } from "./platform";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** Opened as the installed app. */
  | "installed"
  /** The browser offers installing it (Chrome, Edge, Android). */
  | "prompt"
  /** iPhone or iPad: Share, then Add to Home Screen. */
  | "ios"
  /** Not offered here, or not now. */
  | "unavailable";

let offered: InstallPrompt | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const apple = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

if (isWeb && typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offered = event as InstallPrompt;
    tell();
  });
  window.addEventListener("appinstalled", () => {
    offered = null;
    installedNow = true;
    tell();
  });
}

function state(): InstallState {
  if (!isWeb) return "unavailable";
  if (installedNow || standalone()) return "installed";
  if (offered) return "prompt";
  if (apple()) return "ios";
  return "unavailable";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state,
    () => "unavailable",
  );
}

/** Shows the browser's install prompt; true if it was installed. */
export async function installApp(): Promise<boolean> {
  if (!offered) return false;
  const prompt = offered;
  offered = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === "accepted") installedNow = true;
  tell();
  return outcome === "accepted";
}
