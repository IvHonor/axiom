import { Blocks, CircleUserRound, EyeOff, Layers, Palette, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { AreaContextMenu } from "./ui/AreaContextMenu";
import type { MenuPosition } from "./ui/ContextMenu";
import type { ExtensionManifest } from "../extensions/types";
import { Avatar } from "./ui/Avatar";
import { ExtensionIcon } from "./ui/ExtensionIcon";
import { useProfile } from "./useProfile";

/** The shell's own panels, or an area's sidebar ("area:<id>"). */
export type SidePanel = "areas" | "extensions" | "account" | "themes" | `area:${string}`;

export interface Item {
  id: SidePanel;
  label: string;
  icon: LucideIcon;
  extension?: ExtensionManifest;
}

const TOP: Item[] = [
  { id: "areas", label: "Areas (Ctrl+B)", icon: Layers },
  { id: "extensions", label: "Extensions (Ctrl+Shift+X)", icon: Blocks },
];

const BOTTOM: Item[] = [
  { id: "account", label: "Account", icon: CircleUserRound },
  { id: "themes", label: "Themes (Ctrl+K Ctrl+T)", icon: Palette },
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
  const button = ({ id, label, icon: Icon, extension }: Item) => {
    const title = id === "account" && accountEmail ? `${label} (${accountEmail})` : label;
    const hidden = !!extension && hiddenIds.includes(extension.id);
    return (
      <button
        key={id}
        className={id === active ? "activity is-active" : "activity"}
        onClick={() => onToggle(id)}
        title={hidden ? `${title} · hidden on overview (right-click to unhide)` : title}
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
      {TOP.map(button)}
      {areas.length > 0 && <div className="activitybar-divider" />}
      {areas.map(button)}
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
      {BOTTOM.map(button)}
      {menu?.item.extension && onVisibilityChange && <AreaContextMenu ext={menu.item.extension} at={menu.at}
        hidden={hiddenIds.includes(menu.item.extension.id)} onOpen={() => { if (active !== menu.item.id) onToggle(menu.item.id); }}
        onClose={() => setMenu(null)} onVisibilityChange={onVisibilityChange} />}
    </nav>
  );
}
