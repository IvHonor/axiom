import { useEffect, useRef, useState, type ReactNode } from "react";

interface DropdownProps {
  /** Accessible name for the trigger button. */
  label: string;
  /** An icon-only trigger... */
  icon?: ReactNode;
  /** ...or a trigger with its own content, such as a text label. */
  trigger?: ReactNode;
  align?: "left" | "right";
  /** Opens above the button, for controls near the bottom of the window. */
  up?: boolean;
  /** Menu contents. Call `close` after an action. */
  children: (close: () => void) => ReactNode;
}

/** A small menu that opens under an icon button and closes on outside click or Escape. */
export function Dropdown({ label, icon, trigger, align = "right", up, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={root}>
      <button
        className={trigger ? "dropdown-trigger" : "icon-btn"}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {trigger ?? icon}
      </button>
      {open && (
        <div className={`dropdown-menu is-${align}${up ? " is-up" : ""}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
