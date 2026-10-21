import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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

  // Keep the menu on screen near the right and bottom edges.
  const style = {
    left: Math.min(at.x, window.innerWidth - 230),
    top: Math.min(at.y, window.innerHeight - 160),
  };

  return (
    <div ref={menu} className="dropdown-menu context-menu" role="menu" style={style}>
      {children}
    </div>
  );
}
