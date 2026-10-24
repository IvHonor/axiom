import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  at: MenuPosition;
  onClose: () => void;
  /** Menu contents; use `.menu-item` buttons and `.menu-sep` dividers. */
  children: ReactNode;
}

/** A right-click menu at the cursor. Closes on outside click, Escape, mouse wheel or resize. */
export function ContextMenu({ at, onClose, children }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menu.current) return;
    const { width, height } = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(4, Math.min(at.x, window.innerWidth - width - 4))}px`;
    menu.current.style.top = `${Math.max(4, Math.min(at.y, window.innerHeight - height - 4))}px`;
  }, [at, children]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onPointerDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        previousFocus?.focus();
      } else if (e.key === "Tab") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onClose);
    document.addEventListener("wheel", onClose, { passive: true });
    menu.current?.querySelector<HTMLElement>(".menu-item")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  // Portaling avoids clipping by the overview's grid and CSS container boundaries.
  return createPortal(
    <div ref={menu} className="dropdown-menu context-menu" role="menu" style={{ left: at.x, top: at.y }} onKeyDown={(event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)"));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>
      {children}
    </div>, document.body,
  );
}
