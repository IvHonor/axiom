import { useCallback } from "react";
import { currentId, findExtension, isComingSoon } from "../extensions";
import { usePersistentState } from "./usePersistentState";

// Which extensions the user installed is a UI preference kept in local storage
// for now. It can move to Rust once settings need to sync. Built-in extensions
// are always installed and aren't tracked here. Coming-soon areas can't be
// installed (an older version allowed it, so they're dropped when read).
export function useInstalled() {
  const [installedIds, setInstalledIds] = usePersistentState("axiom.installed", (saved) =>
    Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").map(currentId).filter(installable)
      : [],
  );

  const install = useCallback(
    (id: string) => setInstalledIds((ids) => (ids.includes(id) || !installable(id) ? ids : [...ids, id])),
    [setInstalledIds],
  );

  const uninstall = useCallback(
    (id: string) => setInstalledIds((ids) => ids.filter((other) => other !== id)),
    [setInstalledIds],
  );

  return { installedIds, install, uninstall };
}

function installable(id: string): boolean {
  const ext = findExtension(id);
  return !!ext && !isComingSoon(ext);
}
