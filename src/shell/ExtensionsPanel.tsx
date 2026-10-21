import { useState } from "react";
import { Search } from "lucide-react";
import { EXTENSIONS, isComingSoon } from "../extensions";
import type { ExtensionManifest } from "../extensions/types";
import { useLabels } from "./theme/ThemeProvider";
import { ContextMenu, type MenuPosition } from "./ui/ContextMenu";
import { Section } from "./ui/Section";

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
  selectedId: string | null;
  /** Opens an extension's page: in the preview tab, or in a tab of its own. */
  onOpen: (id: string, inNewTab: boolean) => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

/** The marketplace sidebar: search, then installed, available, coming-soon and built-in extensions. */
export function ExtensionsPanel({
  query,
  onQueryChange,
  kind,
  onKindChange,
  installedIds,
  selectedId,
  onOpen,
  onInstall,
  onUninstall,
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

  const meta = (ext: ExtensionManifest) => {
    const parts = isComingSoon(ext) ? [ext.publisher] : [ext.publisher, `v${ext.version}`];
    if (ext.themes) parts.push(label(`${ext.themes.length} themes`));
    return parts.join(` ${sep} `);
  };

  const card = (ext: ExtensionManifest, canInstall: boolean) => (
    <li key={ext.id} className={ext.id === selectedId ? "ext-item is-selected" : "ext-item"}>
      <button
        className="ext-main"
        onClick={() => onOpen(ext.id, false)}
        onDoubleClick={() => onOpen(ext.id, true)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ ext, at: { x: e.clientX, y: e.clientY } });
        }}
        title="Click to preview, double-click to keep open, right-click for more"
      >
        <span className="ext-icon">
          <ext.icon size={18} strokeWidth={1.5} />
        </span>
        <span className="ext-text">
          <span className="ext-name">
            {ext.name}
            <span className={`ext-kind is-${kindOf(ext)}`}>{kindOf(ext) === "theme" ? "Theme" : "Area"}</span>
            {isComingSoon(ext) && <span className="ext-kind is-soon">Coming soon</span>}
          </span>
          <span className="ext-desc">{ext.description}</span>
          <span className="ext-meta">{meta(ext)}</span>
        </span>
      </button>
      {canInstall && (
        <button className="btn btn-sm" onClick={() => onInstall(ext.id)}>
          Install
        </button>
      )}
    </li>
  );

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
        <Section title="Installed" count={installed.length}>
          {installed.length ? list(installed, false) : empty("None installed.")}
        </Section>
        <Section title="Available" count={available.length}>
          {available.length ? (
            list(available, true)
          ) : (
            empty("Everything is installed.")
          )}
        </Section>
        {comingSoon.length > 0 && (
          <Section title="Coming soon" count={comingSoon.length}>
            {list(comingSoon, false)}
          </Section>
        )}
        <Section title="Built-in" count={builtIn.length}>
          {builtIn.length ? list(builtIn, false) : empty("")}
        </Section>
      </div>

      {menu && (
        <ContextMenu at={menu.at} onClose={() => setMenu(null)}>
          <button className="menu-item" onClick={() => (onOpen(menu.ext.id, false), setMenu(null))}>
            Open
          </button>
          <button className="menu-item" onClick={() => (onOpen(menu.ext.id, true), setMenu(null))}>
            Open in New Tab
          </button>
          {!menu.ext.builtIn && !isComingSoon(menu.ext) && (
            <>
              <div className="menu-sep" />
              {installedIds.includes(menu.ext.id) ? (
                <button className="menu-item is-danger" onClick={() => (onUninstall(menu.ext.id), setMenu(null))}>
                  Uninstall
                </button>
              ) : (
                <button className="menu-item" onClick={() => (onInstall(menu.ext.id), setMenu(null))}>
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
