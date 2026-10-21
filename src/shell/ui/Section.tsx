import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

/** A collapsible sidebar group, like VS Code's "INSTALLED" / "RECOMMENDED". */
export function Section({ title, count, children }: SectionProps) {
  const [open, setOpen] = useState(true);
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
