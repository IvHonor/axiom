// Axiom installed from the browser offers shortcuts on its icon (a long
// press on a phone, a right-click on a desktop): "Today", "Project Board"…
// Each opens /terminal?open=<area>, and this goes straight to that area.
import { useEffect } from "react";
import type { ExtensionManifest } from "../extensions/types";
import { isWeb } from "../lib/platform";
import type { View } from "./view";

export function useLaunchArea(areas: ExtensionManifest[], open: (view: View) => void) {
  useEffect(() => {
    if (!isWeb) return;
    const url = new URL(location.href);
    const id = url.searchParams.get("open");
    if (!id) return;
    if (areas.some((area) => area.id === id)) open({ kind: "extension", id });
    // Once: a reload shouldn't open it again.
    url.searchParams.delete("open");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
