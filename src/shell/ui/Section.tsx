import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SectionProps {
  title: string;
  count?: number;
  /** Starts folded (e.g. More, the areas hardly used). */
  folded?: boolean;
  children: ReactNode;
}

/** A collapsible sidebar group, like VS Code's "INSTALLED" / "RECOMMENDED". */
export function Section({ title, count, folded = false, children }: SectionProps) {
  const [open, setOpen] = useState(!folded);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="section">
      <button className="section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Chevron size={14} strokeWidth={1.5} />
        <span>{title}</span>
        {count !== undefined && <span className="section-count">{String(count).padStart(2, "0")}</span>}
      </button>
      {open && children}
    </div>
  );
}
