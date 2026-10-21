import { Blocks, CircleUserRound, Layers, Palette, type LucideIcon } from "lucide-react";

export type SidePanel = "areas" | "extensions" | "account" | "themes";

interface Item {
  id: SidePanel;
  label: string;
  icon: LucideIcon;
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
  onToggle: (panel: SidePanel) => void;
  /** Shown on the account icon's tooltip, e.g. "Account (ada@example.com)". */
  accountEmail?: string;
}

/** The far-left icon strip. Clicking an icon opens its sidebar; clicking it again closes it. */
export function ActivityBar({ active, onToggle, accountEmail }: ActivityBarProps) {
  const button = ({ id, label, icon: Icon }: Item) => {
    const title = id === "account" && accountEmail ? `${label} (${accountEmail})` : label;
    return (
      <button
        key={id}
        className={id === active ? "activity is-active" : "activity"}
        onClick={() => onToggle(id)}
        title={title}
        aria-label={title}
        aria-pressed={id === active}
      >
        <Icon size={20} strokeWidth={1.5} />
        {id === "account" && accountEmail && <span className="activity-badge" />}
      </button>
    );
  };

  return (
    <nav className="activitybar">
      {TOP.map(button)}
      <div className="activitybar-fill" />
      {BOTTOM.map(button)}
    </nav>
  );
}
