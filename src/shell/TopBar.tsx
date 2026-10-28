import { useEffect, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Blocks, LayoutDashboard, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { findExtension } from "../extensions";
import { useAreaName } from "../features/lemma/persona";
import { NotificationBell } from "./notifications/NotificationBell";
import { SupportButton } from "./support/Support";
import { ExtensionIcon } from "./ui/ExtensionIcon";
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
  onReorder: (fromKey: string, toKey: string) => void;
}

function describe(view: View, nameOf: (ext: { id: string; name: string }) => string): { label: string; icon: LucideIcon } {
  if (view.kind === "overview") return { label: "Overview", icon: LayoutDashboard };
  if (view.kind === "admin") return { label: "Admin", icon: ShieldCheck };
  const ext = findExtension(view.id);
  if (view.kind === "extension-info") return { label: `Extension: ${ext ? nameOf(ext) : view.id}`, icon: Blocks };
  return { label: ext ? nameOf(ext) : view.id, icon: ext?.icon ?? Blocks };
}

/** Logo, open tabs and, in themes that want one, a clock. */
export function TopBar({ tabs, active, previewKey, onSelect, onPin, onClose, onReorder }: TopBarProps) {
  const showClock = !!useTheme().theme.style.clock;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );
  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (over && dragged.id !== over.id) onReorder(String(dragged.id), String(over.id));
  };

  return (
    <header className="topbar">
      <button className="topbar-logo" onClick={() => onSelect(OVERVIEW)} title="Overview" aria-label="Overview">
        <Logo />
      </button>
      <div className="topbar-brand"><Logo variant="wordmark" size={13} /></div>
      <div className="box box-hatch" aria-hidden="true" />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: "Press Space to pick up a tab, Left or Right to move it, Space to drop, or Escape to cancel. Press Enter to open a tab." } }}>
        <div className="tabs" role="tablist" aria-label="Open tabs">
          <SortableContext items={tabs.map(viewKey)} strategy={horizontalListSortingStrategy}>
            {tabs.map((view) => <SortableTab key={viewKey(view)} view={view} selected={sameView(view, active)}
              isPreview={viewKey(view) === previewKey} onSelect={onSelect} onPin={onPin} onClose={onClose} />)}
          </SortableContext>
        </div>
      </DndContext>

      <SupportButton />
      <NotificationBell onOpen={(id) => onSelect({ kind: "extension", id })} />
      <div className="box box-hatch" aria-hidden="true" />
      {showClock && <Clock />}
    </header>
  );
}

function SortableTab({ view, selected, isPreview, onSelect, onPin, onClose }: {
  view: View;
  selected: boolean;
  isPreview: boolean;
} & Pick<TopBarProps, "onSelect" | "onPin" | "onClose">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: viewKey(view) });
  const { label, icon: Icon } = describe(view, useAreaName());
  const ext = view.kind === "extension" || view.kind === "extension-info" ? findExtension(view.id) : undefined;
  const closable = view.kind !== "overview";
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Translate.toString(transform ? { ...transform, y: 0 } : null), transition }}
      className={`tab${selected ? " is-active" : ""}${isPreview ? " is-preview" : ""}${isDragging ? " is-dragging" : ""}${closable ? "" : " tab-permanent"}`}
      role="tab" aria-roledescription="sortable tab" aria-selected={selected} tabIndex={0}
      title={`${label}${isPreview ? " (preview: double-click to keep open)" : ""} · Drag to reorder, or press Space then use arrow keys`}
      onClick={() => onSelect(view)} onDoubleClick={() => onPin(view)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") onSelect(view);
        else listeners?.onKeyDown?.(event);
      }}
      // Middle-click closes, like a browser or VS Code.
      onAuxClick={(event) => event.button === 1 && closable && onClose(view)}
    >
      {ext ? <ExtensionIcon ext={ext} size={14} /> : <Icon size={14} strokeWidth={1.5} />}
      <span className="tab-label">{label}</span>
      {closable && <button className="tab-close" aria-label={`Close ${label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onClose(view); }}>
        <X size={12} strokeWidth={1.75} />
      </button>}
    </div>
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
