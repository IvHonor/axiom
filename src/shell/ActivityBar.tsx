import { Blocks, CircleUserRound, EyeOff, Layers, Palette, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePersistentState } from "./usePersistentState";
import { AreaContextMenu } from "./ui/AreaContextMenu";
import type { MenuPosition } from "./ui/ContextMenu";
import type { ExtensionManifest } from "../extensions/types";
import { Avatar } from "./ui/Avatar";
import { ExtensionIcon } from "./ui/ExtensionIcon";
import { useProfile } from "./useProfile";
import { shortcut } from "../lib/shortcut";

/** The shell's own panels, or an area's sidebar ("area:<id>"). */
export type SidePanel = "areas" | "extensions" | "assistant" | "account" | "themes" | `area:${string}`;

export interface Item {
  id: SidePanel;
  label: string;
  icon: LucideIcon;
  extension?: ExtensionManifest;
}

const TOP: Item[] = [
  { id: "areas", label: shortcut("Areas (Ctrl+B)"), icon: Layers },
  { id: "extensions", label: shortcut("Extensions (Ctrl+Shift+X)"), icon: Blocks },
  { id: "assistant", label: "Assistant", icon: Sparkles },
];

const BOTTOM: Item[] = [
  { id: "account", label: "Account", icon: CircleUserRound },
  { id: "themes", label: shortcut("Themes (Ctrl+K Ctrl+T)"), icon: Palette },
];

interface ActivityBarProps {
  active: SidePanel | null;
  /** Installed areas with a sidebar of their own, listed under Extensions. */
  areas: Item[];
  onToggle: (panel: SidePanel) => void;
  /** Shown on the account icon's tooltip, e.g. "Account (ada@example.com)". */
  accountEmail?: string;
  /** Admins get an icon that opens the admin panel in a tab. */
  admin?: { open: boolean; onOpen: () => void };
  hiddenIds?: string[];
  onVisibilityChange?: (id: string, hidden: boolean) => void;
}

/** The far-left icon strip. Clicking an icon opens its sidebar; clicking it again closes it. */
export function ActivityBar({ active, areas, onToggle, accountEmail, admin, hiddenIds = [], onVisibilityChange }: ActivityBarProps) {
  const profile = useProfile(accountEmail);
  const [menu, setMenu] = useState<{ item: Item; at: MenuPosition } | null>(null);
  const [order, setOrder] = usePersistentState<string[]>("axiom.activityOrder.v1", saved =>
    Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && id.startsWith("area:")))] : []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const movable = (item: Item) => !!item.extension && !item.extension.required;
  const fullOrder = [...order, ...areas.filter(item => movable(item) && !order.includes(item.id)).map(item => item.id)];
  const sorted = areas.filter(movable).sort((a, b) => fullOrder.indexOf(a.id) - fullOrder.indexOf(b.id));
  let slot = 0;
  const ordered = areas.map(item => movable(item) ? sorted[slot++] : item);
  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    if (!over || dragged.id === over.id) return;
    const ids = sorted.map(item => item.id);
    const from = ids.indexOf(dragged.id as SidePanel), to = ids.indexOf(over.id as SidePanel);
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    let index = 0;
    // Disabled extensions retain their slots, ready for when they're switched on again.
    setOrder(fullOrder.map(id => ids.includes(id as SidePanel) ? next[index++] : id));
  }
  const button = ({ id, label, icon: Icon, extension }: Item, sortable?: ReturnType<typeof useSortable>) => {
    const title = id === "account" && accountEmail ? `${label} (${accountEmail})` : label;
    const hidden = !!extension && hiddenIds.includes(extension.id);
    return (
      <button
        key={id}
        ref={sortable?.setNodeRef}
        {...sortable?.attributes}
        {...sortable?.listeners}
        style={sortable ? { transform: CSS.Transform.toString(sortable.transform ? { ...sortable.transform, x: 0 } : null), transition: sortable.transition } : undefined}
        className={`activity${id === active ? " is-active" : ""}${sortable ? " activity-sortable" : ""}${sortable?.isDragging ? " is-dragging" : ""}`}
        onClick={() => onToggle(id)}
        title={`${hidden ? `${title} · hidden on overview (right-click to unhide)` : title}${sortable ? " · Drag to reorder, or press Space then use arrow keys" : ""}`}
        aria-label={title}
        aria-pressed={id === active}
        onContextMenu={extension && onVisibilityChange ? (event) => {
          event.preventDefault();
          setMenu({ item: { id, label, icon: Icon, extension }, at: { x: event.clientX, y: event.clientY } });
        } : undefined}
      >
        {id === "account" && accountEmail ? (
          <Avatar email={accountEmail} profile={profile} size={22} />
        ) : extension ? (
          <ExtensionIcon ext={extension} size={20} />
        ) : (
          <Icon size={20} strokeWidth={1.5} />
        )}
        {id === "account" && accountEmail && <span className="activity-badge" />}
        {hidden && <span className="activity-hidden"><EyeOff size={9} /></span>}
      </button>
    );
  };

  return (
    <nav className="activitybar">
      {TOP.map(item => button(item))}
      {areas.length > 0 && <div className="activitybar-divider" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sorted.map(item => item.id)} strategy={verticalListSortingStrategy}>
          {ordered.map(item => movable(item)
            ? <SortableActivity key={item.id} item={item} render={button} />
            : button(item))}
        </SortableContext>
      </DndContext>
      {admin && (
        <>
          <div className="activitybar-divider" />
          <button
            className={admin.open ? "activity is-active" : "activity"}
            onClick={admin.onOpen}
            title="Admin"
            aria-label="Admin"
            aria-pressed={admin.open}
          >
            <ShieldCheck size={20} strokeWidth={1.5} />
          </button>
        </>
      )}
      <div className="activitybar-fill" />
      {BOTTOM.map(item => button(item))}
      {menu?.item.extension && onVisibilityChange && <AreaContextMenu ext={menu.item.extension} at={menu.at}
        hidden={hiddenIds.includes(menu.item.extension.id)} onOpen={() => { if (active !== menu.item.id) onToggle(menu.item.id); }}
        onClose={() => setMenu(null)} onVisibilityChange={onVisibilityChange} />}
    </nav>
  );
}

function SortableActivity({ item, render }: {
  item: Item;
  render: (item: Item, sortable: ReturnType<typeof useSortable>) => React.ReactNode;
}) {
  const sortable = useSortable({ id: item.id, transition: { duration: 180, easing: "cubic-bezier(.22, 1, .36, 1)" } });
  return render(item, sortable);
}
