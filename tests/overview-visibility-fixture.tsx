// Real shell menus and persistence, with inert summaries and no database access.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EXTENSIONS } from "../src/extensions";
import { ActivityBar, type SidePanel } from "../src/shell/ActivityBar";
import { AreasPanel } from "../src/shell/AreasPanel";
import { ExtensionsPanel, type ExtensionKind } from "../src/shell/ExtensionsPanel";
import { OverviewView } from "../src/shell/views/OverviewView";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { useInstalled } from "../src/shell/useInstalled";
import { useOverviewVisibility } from "../src/shell/useOverviewVisibility";
import { SidebarFrame } from "../src/shell/ui/SidebarFrame";
import { Modal } from "../src/shell/ui/Modal";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/shell/ui/tileDisplay.css";

function Summary() { return <p>Saved area content</p>; }
function Fixture() {
  const { installedIds, install, uninstall, setEnabled, isOn } = useInstalled();
  const { hiddenIds, setHidden } = useOverviewVisibility();
  const [panel, setPanel] = useState<SidePanel | null>("areas");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ExtensionKind>("all");
  const [opened, setOpened] = useState("");
  const [dialog, setDialog] = useState(false);
  const installed = EXTENSIONS.filter(isOn);
  const areas = installed.filter(ext => ext.area).map(ext => ({...ext, area: {...ext.area, SummaryTitle: undefined, Summary, fittedSummary: true}}));
  return <ThemeProvider installed={installed}>
    <div className="app">
      <div style={{height: 40, flex: "none", padding: "8px 16px"}}><output data-testid="opened">{opened}</output>
        <button className="btn btn-sm" onClick={() => setDialog(true)}>Preview dialog</button>
      </div>
      <div className="workbench">
        <ActivityBar active={panel} areas={areas.map(ext => ({id: `area:${ext.id}` as const, label: ext.name, icon: ext.icon, extension: ext}))}
          admin={{open: opened === "admin", onOpen: () => setOpened("admin")}}
          onToggle={next => setPanel(previous => previous === next ? null : next)} hiddenIds={hiddenIds} onVisibilityChange={setHidden} />
        <SidebarFrame open={panel !== null}>
        {panel === "extensions" ? <ExtensionsPanel query={query} onQueryChange={setQuery} kind={kind} onKindChange={setKind}
          installedIds={installedIds} selectedId={null} onOpen={setOpened} onInstall={install} onUninstall={uninstall}
          isOn={isOn} onEnabledChange={setEnabled}
          hiddenIds={hiddenIds} onVisibilityChange={setHidden} />
          : panel !== null && <AreasPanel areas={areas} view={{kind: "overview"}} onOpen={view => setOpened(view.kind === "extension" ? view.id : "overview")}
            onBrowse={() => setPanel("extensions")} hiddenIds={hiddenIds} onVisibilityChange={setHidden} />}
          {dialog && <Modal title="Motion preview" onClose={() => setDialog(false)}><p>Dialog inside a sliding sidebar.</p></Modal>}
        </SidebarFrame>
        <main className="main"><OverviewView areas={areas} onOpen={setOpened} onBrowse={() => setPanel("extensions")}
          hiddenIds={hiddenIds} onVisibilityChange={setHidden} /></main>
      </div>
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
