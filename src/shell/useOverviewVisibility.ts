import { useCallback } from "react";
import { usePersistentState } from "./usePersistentState";

/** Visibility is separate from installation, so hiding keeps an area's data and layout. */
export function useOverviewVisibility() {
  const [hiddenIds, setHiddenIds] = usePersistentState<string[]>("axiom.overview.hidden.v1", (saved) =>
    Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string"))] : [],
  );
  const setHidden = useCallback((id: string, hidden: boolean) => {
    setHiddenIds((previous) => hidden
      ? previous.includes(id) ? previous : [...previous, id]
      : previous.filter((other) => other !== id));
  }, [setHiddenIds]);
  return { hiddenIds, setHidden };
}
