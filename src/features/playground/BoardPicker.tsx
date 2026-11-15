// Choosing a board: one chip per area (only those you share), then, when an
// area has more than one board, a small toggle between them. The boards'
// playful names ("Page Turners") are their titles, not crowding the picker.
import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import { AREA_NAMES, METRICS, type MetricInfo } from "./metrics";

export function BoardPicker({ metric, shared, onPick }: { metric: MetricInfo; shared: string[]; onPick: (m: MetricInfo) => void }) {
  // What you share, and the board you're on; everything if you share nothing yet.
  const shown = METRICS.filter((m) => shared.includes(m.id) || m.id === metric.id);
  const visible = shown.length > 1 ? shown : METRICS;
  const areas = Object.keys(AREA_NAMES).filter((area) => visible.some((m) => m.area === area));
  const siblings = visible.filter((m) => m.area === metric.area);

  return (
    <nav className="pg-picker" aria-label="Boards">
      <div className="pg-picker-areas" role="tablist" aria-label="Area">
        {areas.map((area) => {
          const first = visible.find((m) => m.area === area)!;
          const Icon = first.icon;
          const on = area === metric.area;
          return (
            <button key={area} role="tab" aria-selected={on} className="pg-area" style={{ "--lab": first.color } as CSSProperties} onClick={() => !on && onPick(first)}>
              <Icon size={14} />
              <span>{AREA_NAMES[area]}</span>
            </button>
          );
        })}
      </div>
      {siblings.length > 1 && (
        <div className="pg-picker-metrics" role="tablist" aria-label={`${AREA_NAMES[metric.area]} boards`} style={{ "--lab": metric.color } as CSSProperties}>
          {siblings.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === metric.id} onClick={() => onPick(m)} title={m.global ? m.label : `${m.label} · friends only`}>
              {m.short}
              {!m.global && <Users size={10} aria-label="friends only" />}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
