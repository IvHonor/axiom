import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Dropdown } from "../../shell/ui/Dropdown";
import type { Label, TaskCard } from "./api";
import { colorOf, daysFromNowISO, PRIORITIES, todayISO } from "./palette";

export type DueFilter = "any" | "overdue" | "week" | "none";

export interface Filter {
  text: string;
  labelIds: string[];
  priorities: number[];
  due: DueFilter;
}

export const NO_FILTER: Filter = { text: "", labelIds: [], priorities: [], due: "any" };

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due within a week" },
  { value: "none", label: "No due date" },
];

export const isFiltering = (f: Filter) =>
  f.text.trim() !== "" || f.labelIds.length > 0 || f.priorities.length > 0 || f.due !== "any";

/** Whether a task passes the filter. Labels and priorities match any of the chosen ones. */
export function matches(task: TaskCard, f: Filter): boolean {
  const text = f.text.trim().toLowerCase();
  if (text && !`${task.title} ${task.description}`.toLowerCase().includes(text)) return false;
  if (f.labelIds.length && !f.labelIds.some((id) => task.labelIds.includes(id))) return false;
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.due !== "any") {
    const today = todayISO();
    const weekISO = daysFromNowISO(7);
    const open = task.completedAt === null;
    if (f.due === "none" && task.dueDate) return false;
    if (f.due === "overdue" && !(open && task.dueDate && task.dueDate < today)) return false;
    if (f.due === "week" && !(open && task.dueDate && task.dueDate <= weekISO)) return false;
  }
  return true;
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

interface FilterBarProps {
  filter: Filter;
  onChange: (filter: Filter) => void;
  labels: Label[];
}

/** Search plus label, priority and due-date filters. Applies to every view of the board. */
export function FilterBar({ filter, onChange, labels }: FilterBarProps) {
  const set = (patch: Partial<Filter>) => onChange({ ...filter, ...patch });

  return (
    <div className="pb-filters">
      <label className="search pb-search">
        <Search size={14} strokeWidth={1.5} />
        <input
          value={filter.text}
          placeholder="Filter tasks"
          spellCheck={false}
          onChange={(e) => set({ text: e.currentTarget.value })}
        />
      </label>

      <FilterMenu name="Labels" count={filter.labelIds.length}>
        {labels.length === 0 && <p className="menu-item dim">No labels yet</p>}
        {labels.map((l) => (
          <button key={l.id} className="menu-item" onClick={() => set({ labelIds: toggle(filter.labelIds, l.id) })}>
            <span className="pb-check-sm">{filter.labelIds.includes(l.id) && <Check size={12} strokeWidth={2.5} />}</span>
            <span className="pb-label" style={{ "--label": colorOf(l.color) } as CSSProperties}>
              {l.name || " "}
            </span>
          </button>
        ))}
      </FilterMenu>

      <FilterMenu name="Priority" count={filter.priorities.length}>
        {PRIORITIES.map((name, i) => (
          <button key={name} className="menu-item" onClick={() => set({ priorities: toggle(filter.priorities, i) })}>
            <span className="pb-check-sm">{filter.priorities.includes(i) && <Check size={12} strokeWidth={2.5} />}</span>
            {name}
          </button>
        ))}
      </FilterMenu>

      <FilterMenu name={filter.due === "any" ? "Due" : DUE_OPTIONS.find((o) => o.value === filter.due)!.label} count={0}>
        {DUE_OPTIONS.map((o) => (
          <button key={o.value} className="menu-item" onClick={() => set({ due: o.value })}>
            <span className="pb-check-sm">{filter.due === o.value && <Check size={12} strokeWidth={2.5} />}</span>
            {o.label}
          </button>
        ))}
      </FilterMenu>

      {isFiltering(filter) && (
        <button className="pb-clear" onClick={() => onChange(NO_FILTER)}>
          <X size={12} strokeWidth={1.75} /> Clear
        </button>
      )}
    </div>
  );
}

function FilterMenu({ name, count, children }: { name: string; count: number; children: ReactNode }) {
  return (
    <Dropdown
      label={`Filter by ${name.toLowerCase()}`}
      align="left"
      trigger={
        <span className={count ? "pb-filter is-on" : "pb-filter"}>
          {name}
          {count > 0 && <span className="pb-filter-count">{count}</span>}
          <ChevronDown size={12} strokeWidth={1.75} />
        </span>
      }
    >
      {() => children}
    </Dropdown>
  );
}
