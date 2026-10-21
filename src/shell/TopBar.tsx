import { useEffect, useState } from "react";
import { Blocks, LayoutDashboard, X, type LucideIcon } from "lucide-react";
import { findExtension } from "../extensions";
import { formatTime } from "./format";
import { useTheme } from "./theme/ThemeProvider";
import { Logo } from "./ui/Logo";
import { OVERVIEW, sameView, viewKey, type View } from "./view";

interface TopBarProps {
  tabs: View[];
  active: View;
  /** The tab that's only a preview (shown in italics), if any. */
  previewKey: string | null;
  onSelect: (view: View) => void;
  onPin: (view: View) => void;
  onClose: (view: View) => void;
}

function describe(view: View): { label: string; icon: LucideIcon } {
  if (view.kind === "overview") return { label: "Overview", icon: LayoutDashboard };
  const ext = findExtension(view.id);
  if (view.kind === "extension-info") return { label: `Extension: ${ext?.name ?? view.id}`, icon: Blocks };
  return { label: ext?.name ?? view.id, icon: ext?.icon ?? Blocks };
}

/** Logo, open tabs and, in themes that want one, a clock. */
export function TopBar({ tabs, active, previewKey, onSelect, onPin, onClose }: TopBarProps) {
  const showClock = !!useTheme().theme.style.clock;

  return (
    <header className="topbar">
      <button className="box box-icon" onClick={() => onSelect(OVERVIEW)} title="Overview">
        <Logo />
      </button>
      <div className="box topbar-brand">Axiom</div>
      <div className="box box-hatch" aria-hidden="true" />

      <div className="tabs" role="tablist" aria-label="Open tabs">
        {[OVERVIEW, ...tabs].map((view) => {
          const { label, icon: Icon } = describe(view);
          const selected = sameView(view, active);
          const closable = view.kind !== "overview";
          const isPreview = viewKey(view) === previewKey;
          return (
            <div
              key={viewKey(view)}
              className={`box tab${selected ? " is-active" : ""}${isPreview ? " is-preview" : ""}`}
              role="tab"
              aria-selected={selected}
              tabIndex={0}
              title={isPreview ? `${label} (preview: double-click to keep open)` : label}
              onClick={() => onSelect(view)}
              onDoubleClick={() => onPin(view)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(view)}
              // Middle-click closes, like a browser or VS Code.
              onAuxClick={(e) => e.button === 1 && closable && onClose(view)}
            >
              <Icon size={14} strokeWidth={1.5} />
              <span className="tab-label">{label}</span>
              {closable && (
                <button
                  className="tab-close"
                  aria-label={`Close ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(view);
                  }}
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="box box-hatch" aria-hidden="true" />
      {showClock && <Clock />}
    </header>
  );
}

/** Ticks every second, so it lives in its own component and only it re-renders. */
function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="box topbar-clock">{formatTime(now)}</div>;
}
