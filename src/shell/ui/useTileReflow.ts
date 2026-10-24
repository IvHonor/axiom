import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { TILE_GRID, type TilePosition } from "./tileLayout";

/** Animate grid displacement without scaling text or delaying the tile being dragged. */
export function useTileReflow(cell: RefObject<HTMLDivElement | null>, position: TilePosition | undefined, moving: boolean) {
  const previous = useRef(position);
  const animation = useRef<Animation | null>(null);
  const wasMoving = useRef(false);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = position;
    const node = cell.current;
    if (!node || !position || !before) return;
    const released = wasMoving.current && !moving;
    wasMoving.current = moving;
    if (!moving && !released && !node.style.transform && before.col === position.col && before.row === position.row) return;

    // A new collision can arrive mid-animation: start from the current painted position.
    const offset = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    animation.current?.cancel();
    animation.current = null;
    if (moving) return;
    node.style.removeProperty("transform");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const step = ((node.parentElement?.clientWidth ?? 0) + TILE_GRID.gap) / TILE_GRID.columns;
    const x = (before.col - position.col) * step + (offset?.m41 ?? 0);
    const y = (before.row - position.row) * (TILE_GRID.rowHeight + TILE_GRID.gap) + (offset?.m42 ?? 0);
    if (Math.abs(x) < .5 && Math.abs(y) < .5) return;

    const style = getComputedStyle(document.documentElement);
    const next = node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }], {
      duration: parseFloat(style.getPropertyValue("--motion-layout")) || 240,
      easing: style.getPropertyValue("--motion-ease").trim() || "cubic-bezier(.22, 1, .36, 1)",
    });
    animation.current = next;
    node.classList.add("is-settling");
    next.onfinish = () => { if (animation.current === next) { animation.current = null; node.classList.remove("is-settling"); } };
    next.oncancel = () => { if (!animation.current) node.classList.remove("is-settling"); };
  });

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { animation.current?.cancel(); animation.current = null; cell.current?.classList.remove("is-settling"); };
    const changed = () => { if (preference.matches) stop(); };
    preference.addEventListener("change", changed);
    return () => { preference.removeEventListener("change", changed); stop(); };
  }, []);
}
