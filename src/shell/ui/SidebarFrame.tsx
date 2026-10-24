import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Keep the outgoing panel mounted just long enough to ease closed. */
export function SidebarFrame({ open, children }: { open: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState<ReactNode>(open ? children : null);

  useLayoutEffect(() => {
    if (open) setRetained(children);
    else if (frame.current?.contains(document.activeElement)) {
      frame.current.closest(".workbench")?.querySelector<HTMLButtonElement>(".activitybar button")?.focus();
    }
  }, [open, children]);

  useEffect(() => {
    if (open) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clear = () => setRetained(null);
    if (preference.matches) { clear(); return; }
    // Also clear when a transition is interrupted or the window is backgrounded.
    const delay = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-layout")) || 240;
    const timer = window.setTimeout(clear, delay + 40);
    const changed = () => { if (preference.matches) clear(); };
    preference.addEventListener("change", changed);
    return () => { window.clearTimeout(timer); preference.removeEventListener("change", changed); };
  }, [open]);

  return <div ref={frame} className={`sidebar-frame${open ? " is-open" : ""}`} inert={!open} aria-hidden={!open}
    onTransitionEnd={(event) => {
      if (!open && event.target === event.currentTarget && event.propertyName === "width") setRetained(null);
    }}>
    <div className="sidebar-frame-content">{open ? children : retained}</div>
  </div>;
}
