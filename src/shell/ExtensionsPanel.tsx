import { useState } from "react";
import { Check, Search } from "lucide-react";
import { EXTENSIONS, isComingSoon } from "../extensions";
import type { ExtensionManifest } from "../extensions/types";
import { useLabels } from "./theme/ThemeProvider";
import { ContextMenu, type MenuPosition } from "./ui/ContextMenu";
import { Section } from "./ui/Section";
import { ExtensionIcon } from "./ui/ExtensionIcon";
import { OverviewVisibilityItem } from "./ui/AreaContextMenu";
import { Publisher } from "./ui/Publisher";
import { Switch } from "./ui/Switch";

interface ExtensionsPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  installedIds: string[];
  /** Installed (or built in) and switched on. */
  isOn: (ext: ExtensionManifest) => boolean;
  onEnabledChange: (id: string, enabled: boolean) => void;
  selectedId: string | null;
  /** Opens an extension's page: in the preview tab, or in a tab of its own. */
  onOpen: (id: string, inNewTab: boolean) => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  hiddenIds?: string[];
  onVisibilityChange?: (id: string, hidden: boolean) => void;
}

/** The extensions sidebar: search, then the built-in areas (each can be
 * switched off), and any from the library: installed, available, coming soon.
 * Areas only: themes have the Themes panel, so someone new looking for what
 * Axiom can do isn't wading through colour schemes. */
export function ExtensionsPanel({
  query,
  onQueryChange,
  installedIds,
  isOn,
  onEnabledChange,
  selectedId,
  onOpen,
  onInstall,
  onUninstall,
  hiddenIds = [],
  onVisibilityChange,
}: ExtensionsPanelProps) {
  const { label, sep } = useLabels();
  const [menu, setMenu] = useState<{ ext: ExtensionManifest; at: MenuPosition } | null>(null);

  const q = query.trim().toLowerCase();
  const matches = EXTENSIONS.filter(
    (ext) =>
      !!ext.area &&
      (!q || ext.name.toLowerCase().includes(q) || ext.description.toLowerCase().includes(q)),
  );
  const builtIn = matches.filter((ext) => ext.builtIn);
  const installed = matches.filter((ext) => !ext.builtIn && installedIds.includes(ext.id));
  const available = matches.filter((ext) => !ext.builtIn && !isComingSoon(ext) && !installedIds.includes(ext.id));
  const comingSoon = matches.filter(isComingSoon);

  const card = (ext: ExtensionManifest, canInstall: boolean) => {
    const soon = isComingSoon(ext);
    const on = isOn(ext);
    const installed = ext.builtIn || installedIds.includes(ext.id);
    const state = soon ? "Coming soon" : ext.builtIn
      ? `Built in ${sep} ${ext.required ? "Always on" : on ? "On" : "Off"}`
      : installed ? `Installed${on ? "" : ` ${sep} Off`}` : "Available";
    return (
    <li key={ext.id} className={ext.id === selectedId ? "ext-item is-selected" : "ext-item"}>
      <button
        className="ext-main"
        onClick={() => onOpen(ext.id, false)}
        onDoubleClick={() => onOpen(ext.id, true)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ ext, at: { x: e.clientX, y: e.clientY } });
        }}
        title={`${ext.name} · Click to preview, double-click to keep open, right-click for more`}
      >
        <ExtensionIcon ext={ext} size={18} frame="small" />
        <span className="ext-text">
          <span className="ext-name">{ext.name}</span>
          <span className="ext-desc">{ext.description}</span>
          <span className="ext-meta">
            <Publisher name={ext.publisher} short />
            {!soon && <><span className="ext-meta-sep" aria-hidden="true">{sep}</span><span>v{ext.version}</span></>}
            <span className="ext-meta-sep" aria-hidden="true">{sep}</span>
            <span>{label("Area")}</span>
          </span>
        </span>
      </button>
      <div className="ext-footer">
        <span className={`ext-state${installed && on && !soon ? " is-on" : ""}`}>
          {installed && on && !soon && <Check size={12} strokeWidth={1.75} aria-hidden="true" />}
          {state}
        </span>
      {canInstall && (
        <button className="btn btn-sm" onClick={() => onInstall(ext.id)}>
          Install
        </button>
      )}
      {ext.builtIn && !ext.required && (
          <Switch
            on={on}
            label={`${ext.name}: ${on ? "on" : "off"}`}
            title={on ? `Switch ${ext.name} off` : `Switch ${ext.name} on`}
            onChange={(on) => onEnabledChange(ext.id, on)}
          />
      )}
      </div>
    </li>
    );
  };

  const empty = (text: string) => <p className="sidebar-empty">{q ? "No matches." : text}</p>;

  const list = (exts: ExtensionManifest[], canInstall: boolean) => <ul className="ext-list">{exts.map((ext) => card(ext, canInstall))}</ul>;

  return (
    <aside className="sidebar" data-tour="extensions-panel">
      <header className="sidebar-head">Extensions</header>
      <label className="search">
        <Search size={14} strokeWidth={1.5} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.currentTarget.value)}
          placeholder="Search extensions"
          spellCheck={false}
        />
      </label>
      <div className="sidebar-body">
        <Section title="Built-in" count={builtIn.length}>
          {builtIn.length ? list(builtIn, false) : empty("")}
        </Section>
        {installed.length > 0 && (
          <Section title="Installed" count={installed.length}>
            {list(installed, false)}
          </Section>
        )}
        {available.length > 0 && (
          <Section title="Available" count={available.length}>
            {list(available, true)}
          </Section>
        )}
        {comingSoon.length > 0 && (
          <Section title="Coming soon" count={comingSoon.length}>
            {list(comingSoon, false)}
          </Section>
        )}
        {!q && installed.length + available.length === 0 && (
          <p className="sidebar-empty ext-library-note">More extensions, from Axiom and others, are on the way in an extension library.</p>
        )}
      </div>

      {menu && (
        <ContextMenu at={menu.at} onClose={() => setMenu(null)}>
          <button className="menu-item" role="menuitem" onClick={() => (onOpen(menu.ext.id, false), setMenu(null))}>
            Open
          </button>
          <button className="menu-item" role="menuitem" onClick={() => (onOpen(menu.ext.id, true), setMenu(null))}>
            Open in New Tab
          </button>
          {menu.ext.area && isOn(menu.ext) && onVisibilityChange && (
            <OverviewVisibilityItem hidden={hiddenIds.includes(menu.ext.id)} onToggle={() => {
              onVisibilityChange(menu.ext.id, !hiddenIds.includes(menu.ext.id));
              setMenu(null);
            }} />
          )}
          {menu.ext.builtIn && !menu.ext.required && (
            <>
              <div className="menu-sep" />
              <button className="menu-item" role="menuitem" onClick={() => (onEnabledChange(menu.ext.id, !isOn(menu.ext)), setMenu(null))}>
                {isOn(menu.ext) ? "Switch Off" : "Switch On"}
              </button>
            </>
          )}
          {!menu.ext.builtIn && !isComingSoon(menu.ext) && (
            <>
              <div className="menu-sep" />
              {installedIds.includes(menu.ext.id) ? (
                <button className="menu-item is-danger" role="menuitem" onClick={() => (onUninstall(menu.ext.id), setMenu(null))}>
                  Uninstall
                </button>
              ) : (
                <button className="menu-item" role="menuitem" onClick={() => (onInstall(menu.ext.id), setMenu(null))}>
                  Install
                </button>
              )}
            </>
          )}
        </ContextMenu>
      )}
    </aside>
  );
}
