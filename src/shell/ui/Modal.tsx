import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** A centred dialog over the whole app. Closes on Escape or a click outside. */
export function Modal({ title, icon, onClose, children }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-label={title}>
        <header className="modal-head">
          {icon}
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>, document.body,
  );
}
