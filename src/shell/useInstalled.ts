import { useCallback } from "react";
import { currentId, findExtension, isComingSoon } from "../extensions";
import type { ExtensionManifest } from "../extensions/types";
import { usePersistentState } from "./usePersistentState";

// Which extensions are on is a UI preference kept in local storage for now.
// It can move to Rust once settings need to sync.
//
// - Built-in extensions ship with Axiom and are always installed; they're on
//   unless switched off (`disabledIds`), apart from required ones.
// - Extensions from the library (later) are installed (`installedIds`), and
//   can be switched off the same way.
export function useInstalled() {
  const [installedIds, setInstalledIds] = usePersistentState("axiom.installed", (saved) =>
    Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").map(currentId).filter(installable)
      : [],
  );
  const [disabledIds, setDisabledIds] = usePersistentState("axiom.disabled", (saved) =>
    Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").map(currentId) : [],
  );

  const install = useCallback(
    (id: string) => setInstalledIds((ids) => (ids.includes(id) || !installable(id) ? ids : [...ids, id])),
    [setInstalledIds],
  );

  const uninstall = useCallback(
    (id: string) => setInstalledIds((ids) => ids.filter((other) => other !== id)),
    [setInstalledIds],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      if (!enabled && findExtension(id)?.required) return;
      setDisabledIds((ids) => (enabled ? ids.filter((other) => other !== id) : ids.includes(id) ? ids : [...ids, id]));
    },
    [setDisabledIds],
  );

  /** Installed (or built in) and switched on: what Axiom actually shows. */
  const isOn = useCallback(
    (ext: ExtensionManifest) => (!!ext.builtIn || installedIds.includes(ext.id)) && (!!ext.required || !disabledIds.includes(ext.id)),
    [installedIds, disabledIds],
  );

  return { installedIds, install, uninstall, disabledIds, setEnabled, isOn };
}

function installable(id: string): boolean {
  const ext = findExtension(id);
  return !!ext && !ext.builtIn && !isComingSoon(ext);
}
