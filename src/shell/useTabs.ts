import { useCallback } from "react";
import { OVERVIEW, parseView, sameView, viewKey, type View } from "./view";
import { usePersistentState } from "./usePersistentState";

/**
 * Open tabs, like VS Code's open editors. The overview is always the first,
 * permanent tab; everything else opens as a closable tab. Remembered across restarts.
 *
 * At most one tab is a "preview": browsing extensions reuses it instead of
 * opening a tab per click. Double-clicking it (or opening something explicitly)
 * makes it a normal tab that stays.
 */
export function useTabs() {
  const [tabs, setTabs] = usePersistentState<View[]>("axiom.tabs", (saved) =>
    Array.isArray(saved)
      ? saved.map(parseView).filter((v): v is View => v !== null && v.kind !== "overview")
      : [],
  );
  const [active, setActive] = usePersistentState<View>("axiom.activeTab", (saved) => parseView(saved) ?? OVERVIEW);
  const [previewKey, setPreviewKey] = usePersistentState<string | null>("axiom.previewTab", (saved) =>
    typeof saved === "string" ? saved : null,
  );

  // A saved active tab that's no longer open falls back to the overview.
  const current = active.kind === "overview" || tabs.some((t) => sameView(t, active)) ? active : OVERVIEW;
  const preview = tabs.find((t) => viewKey(t) === previewKey) ?? null;

  /**
   * Focuses a view, opening a tab for it if needed. With `preview`, the view
   * replaces the current preview tab rather than adding another.
   */
  const open = (view: View, { preview: asPreview = false } = {}) => {
    const key = viewKey(view);
    if (view.kind !== "overview" && !tabs.some((t) => sameView(t, view))) {
      if (asPreview && preview) {
        setTabs(tabs.map((t) => (sameView(t, preview) ? view : t)));
      } else {
        setTabs([...tabs, view]);
      }
      if (asPreview) setPreviewKey(key);
    } else if (!asPreview && key === previewKey) {
      // Opening the preview explicitly keeps it.
      setPreviewKey(null);
    }
    setActive(view);
  };

  /** Turns the preview tab into a normal one. */
  const pin = (view: View) => {
    if (viewKey(view) === previewKey) setPreviewKey(null);
  };

  /** Closes a tab; if it was active, focuses its neighbor (or the overview). */
  const close = (view: View) => {
    const index = tabs.findIndex((t) => sameView(t, view));
    if (index < 0) return;
    const rest = tabs.filter((_, i) => i !== index);
    setTabs(rest);
    if (viewKey(view) === previewKey) setPreviewKey(null);
    if (sameView(current, view)) setActive(rest[index] ?? rest[index - 1] ?? OVERVIEW);
  };

  /** Closes an area's own tab, e.g. after it's uninstalled. Its details page stays open. */
  const closeExtension = useCallback(
    (id: string) => {
      const isArea = (v: View) => v.kind === "extension" && v.id === id;
      setTabs((open) => open.filter((t) => !isArea(t)));
      setActive((focused) => (isArea(focused) ? OVERVIEW : focused));
    },
    [setTabs, setActive],
  );

  return { tabs, active: current, previewKey: preview ? previewKey : null, open, pin, close, closeExtension };
}
