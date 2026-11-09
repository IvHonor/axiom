import { useCallback } from "react";
import { currentId, EXTENSIONS, findExtension, isComingSoon } from "../extensions";
import type { ExtensionManifest } from "../extensions/types";
import { STARTER_AREAS, starterPending } from "./firstRun";
import { usePersistentState } from "./usePersistentState";

// Which extensions are on is part of the profile, so it syncs (see lib/settings).
//
// - Built-in extensions ship with Axiom and are always installed; they're on
//   unless switched off (`disabledIds`), apart from required ones. A first
//   run starts with only a few areas on (see firstRun), so the rest don't
//   crowd someone new: they're a switch away under Extensions. Theme packs
//   are never switched off (one switched off before stays on): their themes
//   are simply there to pick in the Themes panel.
// - Extensions from the library (later) are installed (`installedIds`), and
//   can be switched off the same way.
export function useInstalled() {
  const [installedIds, setInstalledIds] = usePersistentState("axiom.installed", (saved) =>
    Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").map(currentId).filter(installable)
      : [],
  );
  const [disabledIds, setDisabledIds] = usePersistentState("axiom.disabled", (saved) =>
    Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").map(currentId) : starterPending() ? starterOff() : [],
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
      const ext = findExtension(id);
      // Theme packs aren't switched: every theme is there to pick in the Themes panel.
      if (!enabled && (ext?.required || ext?.themes)) return;
      setDisabledIds((ids) => (enabled ? ids.filter((other) => other !== id) : ids.includes(id) ? ids : [...ids, id]));
    },
    [setDisabledIds],
  );

  /** Installed (or built in) and switched on: what Axiom actually shows. */
  const isOn = useCallback(
    (ext: ExtensionManifest) =>
      (!!ext.builtIn || installedIds.includes(ext.id)) && (!!ext.required || !!ext.themes || !disabledIds.includes(ext.id)),
    [installedIds, disabledIds],
  );

  return { installedIds, install, uninstall, disabledIds, setEnabled, isOn };
}

/** On a first run, every built-in area but the starter ones starts switched off. Themes stay on. */
function starterOff(): string[] {
  return EXTENSIONS.filter((ext) => ext.area && ext.builtIn && !ext.required && !STARTER_AREAS.includes(ext.id)).map((ext) => ext.id);
}

function installable(id: string): boolean {
  const ext = findExtension(id);
  return !!ext && !ext.builtIn && !isComingSoon(ext);
}
