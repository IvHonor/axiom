// Ctrl+P: jump to any area (or the overview, or Analytics) by typing a few
// letters, without the sidebar. The ones opened lately come first.
import { useMemo, useState } from "react";
import { ChartColumn, LayoutDashboard, type LucideIcon } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { useAreaName } from "../../features/lemma/persona";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { Modal } from "../ui/Modal";
import type { View } from "../view";
import { useUsage } from "./sidebarPrefs";

interface Place {
  key: string;
  label: string;
  view: View;
  icon?: LucideIcon;
  ext?: ExtensionManifest;
}

/** Each letter typed, in order, somewhere in the name ("dp" finds Daily Plan). */
function matches(label: string, query: string): boolean {
  const name = label.toLowerCase();
  let at = 0;
  for (const letter of query.toLowerCase().replace(/\s+/g, "")) {
    at = name.indexOf(letter, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

export function QuickSwitcher({ areas, onOpen, onClose }: { areas: ExtensionManifest[]; onOpen: (view: View) => void; onClose: () => void }) {
  const nameOf = useAreaName();
  const usage = useUsage();
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);

  const places = useMemo(() => {
    const all: Place[] = [
      { key: "overview", label: "Overview", view: { kind: "overview" }, icon: LayoutDashboard },
      { key: "analytics", label: "Analytics", view: { kind: "analytics" }, icon: ChartColumn },
      ...areas.map((ext) => ({ key: ext.id, label: nameOf(ext), view: { kind: "extension", id: ext.id } as View, ext })),
    ];
    const recent = (p: Place) => usage.opened[p.key] ?? 0;
    return all.filter((p) => !query.trim() || matches(p.label, query)).sort((a, b) => (query.trim() ? 0 : recent(b) - recent(a)));
  }, [areas, nameOf, usage, query]);
  const chosen = Math.min(at, Math.max(0, places.length - 1));
  const go = (place: Place | undefined) => {
    if (!place) return;
    onOpen(place.view);
    onClose();
  };

  return (
    <Modal title="Go to" onClose={onClose} width={440} className="quick-switcher" bare>
      <input
        autoFocus
        className="quick-switcher-input"
        placeholder="An area, Overview or Analytics…"
        aria-label="Go to"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAt(Math.min(places.length - 1, chosen + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAt(Math.max(0, chosen - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(places[chosen]);
          }
        }}
      />
      <ul className="quick-switcher-list" role="listbox" aria-label="Places">
        {places.map((p, i) => {
          const Icon = p.icon;
          return (
            <li key={p.key}>
              <button role="option" aria-selected={i === chosen} className={i === chosen ? "is-chosen" : undefined} onMouseEnter={() => setAt(i)} onClick={() => go(p)}>
                {p.ext ? <ExtensionIcon ext={p.ext} /> : Icon && <Icon size={16} strokeWidth={1.5} />}
                <span>{p.label}</span>
              </button>
            </li>
          );
        })}
        {places.length === 0 && <li className="quick-switcher-none">Nothing called that.</li>}
      </ul>
    </Modal>
  );
}
