import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pin, PinOff, Settings2 } from "lucide-react";
import { setSidebarPrefs, setSidebarWidth, SIDEBAR_SWITCHES, useSidebarPrefs, useSidebarWidth, WIDTH } from "../sidebar/sidebarPrefs";
import { Switch } from "./Switch";

interface SidebarFrameProps {
  open: boolean;
  children: ReactNode;
  /** Pinned, the sidebar keeps what it shows, rather than following what's open (or tucking itself away). */
  pinned?: boolean;
  onPin?: (pinned: boolean) => void;
  /** The pointer's on it, or just was: it mustn't tuck itself away under you. */
  onUse?: () => void;
}

/**
 * The sidebar's frame: it eases open and closed (keeping the outgoing panel
 * just long enough), can be dragged wider or narrower by its edge (and back
 * with a double-click), and has its pin and its settings in the corner.
 */
export function SidebarFrame({ open, children, pinned = false, onPin, onUse }: SidebarFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState<ReactNode>(open ? children : null);
  const [settings, setSettings] = useState(false);
  const [resizing, setResizing] = useState(false);
  const width = useSidebarWidth();

  useLayoutEffect(() => {
    if (open) setRetained(children);
    else if (frame.current?.contains(document.activeElement)) {
      frame.current.closest(".workbench")?.querySelector<HTMLButtonElement>(".activitybar button")?.focus();
    }
  }, [open, children]);

  useEffect(() => {
    if (open) return;
    setSettings(false);
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

  // Dragging the edge: live while dragging, kept when let go.
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);
    const move = (m: PointerEvent) => setSidebarWidth(startWidth + m.clientX - startX, false);
    const up = (m: PointerEvent) => {
      setSidebarWidth(startWidth + m.clientX - startX);
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return <div ref={frame} className={`sidebar-frame${open ? " is-open" : ""}${resizing ? " is-resizing" : ""}`} inert={!open} aria-hidden={!open}
    onPointerEnter={onUse} onPointerMove={onUse}
    onTransitionEnd={(event) => {
      if (!open && event.target === event.currentTarget && event.propertyName === "width") setRetained(null);
    }}>
    <div className="sidebar-frame-content">
      {open ? children : retained}
      <div className="sidebar-corner">
        <button
          type="button"
          className={`sidebar-corner-btn${settings ? " is-on" : ""}`}
          title="Sidebar settings"
          aria-label="Sidebar settings"
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}
        >
          <Settings2 size={13} strokeWidth={1.75} />
        </button>
        {onPin && (
          <button
            type="button"
            className={`sidebar-corner-btn sidebar-pin${pinned ? " is-pinned" : ""}`}
            title={pinned ? "Unpin: follow what's open" : "Pin: keep this sidebar"}
            aria-label={pinned ? "Unpin the sidebar" : "Pin the sidebar"}
            aria-pressed={pinned}
            onClick={() => onPin(!pinned)}
          >
            {pinned ? <Pin size={13} strokeWidth={1.75} /> : <PinOff size={13} strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {settings && <SidebarSettings onClose={() => setSettings(false)} />}
    </div>
    {open && (
      <div
        className="sidebar-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width (drag; double-click for the usual)"
        aria-valuemin={WIDTH.least}
        aria-valuemax={WIDTH.most}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={drag}
        onDoubleClick={() => setSidebarWidth(WIDTH.usual)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setSidebarWidth(width + (e.key === "ArrowRight" ? 20 : -20));
          }
        }}
      />
    )}
  </div>;
}

/** The sidebar's own settings: following, remembering, and when it tucks itself away. */
function SidebarSettings({ onClose }: { onClose: () => void }) {
  const prefs = useSidebarPrefs();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sidebar-settings" role="dialog" aria-label="Sidebar settings">
      <p className="sidebar-settings-title">Sidebar</p>
      <ul>
        {SIDEBAR_SWITCHES.map((s) => (
          <li key={s.key}>
            <span>
              {s.label}
              <small>{s.hint}</small>
            </span>
            <Switch on={prefs[s.key]} onChange={(on) => setSidebarPrefs({ [s.key]: on })} label={s.label} />
          </li>
        ))}
      </ul>
      <p className="sidebar-settings-foot">Drag the sidebar's edge to resize it; double-click the edge for the usual width. Ctrl+P jumps anywhere.</p>
    </div>
  );
}
