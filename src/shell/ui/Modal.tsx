import { createContext, useContext, useEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export const ModalHostContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * A centred dialog over the whole app. Closes on Escape or a click outside,
 * and never grows past the window: its body scrolls instead.
 *
 * `width` is the most it takes, in pixels (640 by default). `className` goes
 * on the dialog, e.g. for an area's field styles. `bare` leaves the body to
 * the children: they lay out (and scroll) their own, e.g. a search field
 * that stays put above its results.
 */
export function Modal({ title, icon, onClose, children, width, className, bare }: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  bare?: boolean;
}) {
  const host = useContext(ModalHostContext);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={className ? `modal ${className}` : "modal"} role="dialog" aria-label={title}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <header className="modal-head">
          {icon}
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        {bare ? children : <div className="modal-body">{children}</div>}
      </section>
    </div>, host?.current ?? document.body,
  );
}
