import { useEffect, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isMacDesktop } from "../../lib/platform";
import { dockOutline, outlinePath } from "./glassOutline";

const PANELS = ".desk-bubble, .desk-menu, .desk-hearing, .desk-time, .desk-controls, .desk-soon, .desk-chip, .desk-radial > button";

/** The native material follows each visible panel, never a rectangle around Lemma. */
export function useDesktopGlass(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current;
    if (!node || !isMacDesktop()) return;
    let frame = 0, sent = "", appliedClip = "", gone = false;
    const watching = new Set<Element>();
    const schedule = () => { if (!frame && !gone) frame = requestAnimationFrame(update); };
    const sizes = new ResizeObserver(schedule);
    // AppKit's parent bounds can change even when the DOM panel stays the same.
    const resized = () => { sent = ""; schedule(); };
    const update = () => {
      frame = 0;
      const tucked = node.classList.contains("is-tucked");
      const candidates = tucked ? [node] : [...node.querySelectorAll<HTMLElement>(PANELS)];
      for (const old of watching) if (!candidates.includes(old as HTMLElement)) { sizes.unobserve(old); watching.delete(old); }
      const panels = candidates.flatMap(panel => {
        if (!watching.has(panel)) { watching.add(panel); sizes.observe(panel); }
        const css = getComputedStyle(panel), box = panel.getBoundingClientRect();
        if (css.visibility === "hidden" || css.display === "none" || !box.width || !box.height) return [];
        // Rects include CSS zoom; native views use logical points as the webview does.
        const zoom = parseFloat(css.zoom) || 1;
        const outline = tucked ? dockOutline(box.width, box.height, node.classList.contains("side-left") ? "left" : "right") : undefined;
        const clip = outline ? `path("${outlinePath(outline)}")` : "";
        if (tucked && appliedClip !== clip) { node.style.clipPath = clip; appliedClip = clip; }
        return [{ x: box.x, y: box.y, width: box.width, height: box.height,
          radius: Math.min(parseFloat(css.borderTopLeftRadius) * zoom || 0, box.width / 2, box.height / 2), outline }];
      }).slice(0, 16);
      if (!tucked && appliedClip) { node.style.clipPath = ""; appliedClip = ""; }
      const json = JSON.stringify(panels);
      if (json === sent) return;
      sent = json;
      void invoke("desk_glass", { panels }).catch(error => {
        if (!gone) console.warn("Lemma's desktop glass could not update:", error);
      });
    };
    const changes = new MutationObserver(schedule);
    changes.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
    node.addEventListener("transitionend", schedule);
    node.addEventListener("animationend", schedule);
    node.addEventListener("pointerenter", schedule);
    node.addEventListener("pointerleave", schedule);
    window.addEventListener("resize", resized);
    schedule();
    return () => {
      gone = true; cancelAnimationFrame(frame); sizes.disconnect(); changes.disconnect();
      node.style.clipPath = "";
      node.removeEventListener("transitionend", schedule);
      node.removeEventListener("animationend", schedule);
      node.removeEventListener("pointerenter", schedule);
      node.removeEventListener("pointerleave", schedule);
      window.removeEventListener("resize", resized);
      void invoke("desk_glass", { panels: [] }).catch(() => {});
    };
  }, [root]);
}
