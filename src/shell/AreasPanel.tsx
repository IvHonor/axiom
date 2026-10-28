import { EyeOff, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { AreaContextMenu } from "./ui/AreaContextMenu";
import type { MenuPosition } from "./ui/ContextMenu";
import type { ExtensionManifest } from "../extensions/types";
import { Section } from "./ui/Section";
import { ExtensionIcon } from "./ui/ExtensionIcon";
import type { View } from "./view";
import { useAreaName } from "../features/lemma/persona";

interface AreasPanelProps {
  areas: ExtensionManifest[];
  view: View;
  onOpen: (view: View) => void;
  onBrowse: () => void;
  hiddenIds?: string[];
  onVisibilityChange?: (id: string, hidden: boolean) => void;
}

/** Sidebar listing the overview and every installed area. */
export function AreasPanel({ areas, view, onOpen, onBrowse, hiddenIds = [], onVisibilityChange }: AreasPanelProps) {
  const isActive = (id: string) => view.kind === "extension" && view.id === id;
  const nameOf = useAreaName();
  const [menu, setMenu] = useState<{ ext: ExtensionManifest; at: MenuPosition } | null>(null);

  return (
    <aside className="sidebar">
      <header className="sidebar-head">Areas</header>
      <div className="sidebar-body">
        <button
          className={view.kind === "overview" ? "nav-item is-active" : "nav-item"}
          onClick={() => onOpen({ kind: "overview" })}
        >
          <LayoutDashboard size={16} strokeWidth={1.5} />
          Overview
        </button>

        <Section title="Installed" count={areas.length}>
          {areas.length === 0 ? (
            <div className="sidebar-empty">
              <p>No areas yet.</p>
              <button className="btn btn-sm" onClick={onBrowse}>
                Browse extensions
              </button>
            </div>
          ) : (
            areas.map((ext) => (
              <button
                key={ext.id}
                className={isActive(ext.id) ? "nav-item is-active" : "nav-item"}
                onClick={() => onOpen({ kind: "extension", id: ext.id })}
                title={hiddenIds.includes(ext.id) ? `${nameOf(ext)} · hidden on overview` : nameOf(ext)}
                onContextMenu={onVisibilityChange ? (event) => {
                  event.preventDefault();
                  setMenu({ ext, at: { x: event.clientX, y: event.clientY } });
                } : undefined}
              >
                <ExtensionIcon ext={ext} />
                <span className="nav-label">{nameOf(ext)}</span>
                {hiddenIds.includes(ext.id) && <EyeOff size={13} className="nav-hidden" aria-label="Hidden on overview" />}
              </button>
            ))
          )}
        </Section>
      </div>
      {menu && onVisibilityChange && <AreaContextMenu ext={menu.ext} at={menu.at} hidden={hiddenIds.includes(menu.ext.id)}
        onOpen={() => onOpen({ kind: "extension", id: menu.ext.id })} onClose={() => setMenu(null)} onVisibilityChange={onVisibilityChange} />}
    </aside>
  );
}
