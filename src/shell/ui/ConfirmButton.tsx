import { useEffect, useState, type ReactNode } from "react";

interface ConfirmButtonProps {
  onConfirm: () => void;
  children: ReactNode;
  confirmText?: string;
  className?: string;
}

/** A button for destructive actions: the first click arms it, the second runs it. */
export function ConfirmButton({ onConfirm, children, confirmText = "Click again to confirm", className }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      // Never a form's submit button: in a dialog's form, the first click
      // would save and close it instead of arming the delete.
      type="button"
      className={`${className ?? ""}${armed ? " is-armed" : ""}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}
