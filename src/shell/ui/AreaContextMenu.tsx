import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { ContextMenu, type MenuPosition } from "./ContextMenu";

export function OverviewVisibilityItem({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const Icon = hidden ? Eye : EyeOff;
  return <button className="menu-item" role="menuitem" onClick={onToggle}>
    <Icon size={14} />{hidden ? "Unhide on overview" : "Hide from overview"}
  </button>;
}

export function AreaContextMenu({ ext, at, hidden, onOpen, onVisibilityChange, onClose }: {
  ext: ExtensionManifest;
  at: MenuPosition;
  hidden: boolean;
  onOpen: () => void;
  onVisibilityChange: (id: string, hidden: boolean) => void;
  onClose: () => void;
}) {
  return <ContextMenu at={at} onClose={onClose}>
    <div className="menu-heading">{ext.name}</div>
    <button className="menu-item" role="menuitem" onClick={() => { onClose(); onOpen(); }}>
      <ArrowUpRight size={14} />Open
    </button>
    <OverviewVisibilityItem hidden={hidden} onToggle={() => { onClose(); onVisibilityChange(ext.id, !hidden); }} />
  </ContextMenu>;
}
