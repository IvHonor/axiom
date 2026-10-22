import { LayoutDashboard } from "lucide-react";
import type { ExtensionManifest } from "../extensions/types";
import { Section } from "./ui/Section";
import type { View } from "./view";

interface AreasPanelProps {
  areas: ExtensionManifest[];
  view: View;
  onOpen: (view: View) => void;
  onBrowse: () => void;
}

/** Sidebar listing the overview and every installed area. */
export function AreasPanel({ areas, view, onOpen, onBrowse }: AreasPanelProps) {
  const isActive = (id: string) => view.kind === "extension" && view.id === id;

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
              >
                <ext.icon size={16} strokeWidth={1.5} />
                {ext.name}
              </button>
            ))
          )}
        </Section>
      </div>
    </aside>
  );
}
