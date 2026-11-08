// Swipe in from the left edge to bring the sidebar out, and swipe it back
// to put it away, as on a phone's own apps. Only where the sidebar slides
// over what's open (phones and tablets, on the web).
import { useEffect, useRef } from "react";

/** How close to the left edge a swipe has to start to open the sidebar. */
const EDGE_PX = 24;
/** How far sideways counts as a swipe, and how far up or down it may wander. */
const SWIPE_PX = 50;
const DRIFT_PX = 40;

export function useEdgeSwipe(enabled: boolean, isOpen: boolean, actions: { open: () => void; close: () => void }) {
  const latest = useRef({ isOpen, actions });
  latest.current = { isOpen, actions };

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; to: "open" | "close" } | null = null;

    const down = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = e.target as Element | null;
      // Dialogs and menus have their own gestures, and a phone's bottom bar scrolls
      // sideways. (On a tablet the bar runs down the left edge: a swipe may start on it.)
      if (target?.closest(".modal-backdrop, .dropdown-menu, .context-menu")) return;
      const bar = target?.closest(".activitybar");
      if (bar && bar.getBoundingClientRect().top > window.innerHeight / 2) return;
      if (!latest.current.isOpen && touch.clientX <= EDGE_PX) start = { x: touch.clientX, y: touch.clientY, to: "open" };
      else if (latest.current.isOpen && target?.closest(".sidebar-frame, .sidebar-scrim")) start = { x: touch.clientX, y: touch.clientY, to: "close" };
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.touches[0];
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dy) > DRIFT_PX) {
        start = null; // Scrolling up or down, not a swipe.
        return;
      }
      if (start.to === "open" && dx > SWIPE_PX) {
        start = null;
        latest.current.actions.open();
      } else if (start.to === "close" && dx < -SWIPE_PX) {
        start = null;
        latest.current.actions.close();
      }
    };
    const up = () => {
      start = null;
    };

    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    window.addEventListener("touchcancel", up, { passive: true });
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [enabled]);
}
