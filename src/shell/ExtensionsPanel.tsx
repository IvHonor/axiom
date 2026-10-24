import { useState } from "react";
import { Check, Search } from "lucide-react";
import { EXTENSIONS, isComingSoon } from "../extensions";
import type { ExtensionManifest } from "../extensions/types";
import { useLabels } from "./theme/ThemeProvider";
import { ContextMenu, type MenuPosition } from "./ui/ContextMenu";
import { Section } from "./ui/Section";
import { ExtensionIcon, ExtensionPalette } from "./ui/ExtensionIcon";
import { OverviewVisibilityItem } from "./ui/AreaContextMenu";
import { Publisher } from "./ui/Publisher";
import { Switch } from "./ui/Switch";

/** Which kind of extension the list shows. */
export type ExtensionKind = "all" | "area" | "theme";

const KINDS: { id: ExtensionKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "area", label: "Areas" },
  { id: "theme", label: "Themes" },
];

const kindOf = (ext: ExtensionManifest): ExtensionKind => (ext.themes ? "theme" : "area");

interface ExtensionsPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  kind: ExtensionKind;
  onKindChange: (kind: ExtensionKind) => void;
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

/** The extensions sidebar: search, then the built-in extensions (each can be
 * switched off), and any from the library: installed, available, coming soon. */
export function ExtensionsPanel({
  query,
  onQueryChange,
  kind,
  onKindChange,
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
      (kind === "all" || kindOf(ext) === kind) &&
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
            <span>{ext.themes ? label(`${ext.themes.length} ${ext.themes.length === 1 ? "theme" : "themes"}`) : label("Area")}</span>
          </span>
          <ExtensionPalette ext={ext} />
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

  const empty = (text: string) => <p className="sidebar-empty">{q || kind !== "all" ? "No matches." : text}</p>;

  /** A section's cards. With both kinds showing, areas and themes get their own sub-heading. */
  const list = (exts: ExtensionManifest[], canInstall: boolean) => {
    const groups =
      kind === "all"
        ? [
            { title: "Areas", items: exts.filter((e) => kindOf(e) === "area") },
            { title: "Themes", items: exts.filter((e) => kindOf(e) === "theme") },
          ].filter((g) => g.items.length > 0)
        : [{ title: "", items: exts }];
    const labelled = groups.length > 1;
    return groups.map((g) => (
      <div key={g.title || "all"}>
        {labelled && <h4 className="ext-group">{g.title}</h4>}
        <ul className="ext-list">{g.items.map((ext) => card(ext, canInstall))}</ul>
      </div>
    ));
  };

  return (
    <aside className="sidebar">
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
      <div className="ext-filter" role="tablist" aria-label="Show">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            className={kind === k.id ? "is-active" : undefined}
            onClick={() => onKindChange(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
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
