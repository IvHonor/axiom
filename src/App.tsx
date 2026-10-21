import { useEffect, useRef, useState } from "react";
import { EXTENSIONS, findExtension } from "./extensions";
import type { ExtensionManifest } from "./extensions/types";
import { AccountPanel } from "./shell/AccountPanel";
import { ActivityBar, type SidePanel } from "./shell/ActivityBar";
import { AreasPanel } from "./shell/AreasPanel";
import { ExtensionsPanel, type ExtensionKind } from "./shell/ExtensionsPanel";
import { StatusBar } from "./shell/StatusBar";
import { ThemeProvider } from "./shell/theme/ThemeProvider";
import { ThemesPanel } from "./shell/ThemesPanel";
import { TopBar } from "./shell/TopBar";
import { useAccount } from "./shell/useAccount";
import { useAppStatus } from "./shell/useAppStatus";
import { useSync } from "./shell/useSync";
import { useUpdater } from "./shell/useUpdater";
import { UpdatePrompt } from "./shell/UpdatePrompt";
import { useInstalled } from "./shell/useInstalled";
import { useTabs } from "./shell/useTabs";
import { ExtensionInfoView } from "./shell/views/ExtensionInfoView";
import { ExtensionView } from "./shell/views/ExtensionView";
import { OverviewView } from "./shell/views/OverviewView";

export default function App() {
  const status = useAppStatus();
  const [account, setAccount] = useAccount();
  const sync = useSync();
  const updater = useUpdater();
  const { installedIds, install, uninstall } = useInstalled();
  const { tabs, active, previewKey, open, pin, close, closeExtension } = useTabs();
  const [panel, setPanel] = useState<SidePanel | null>("areas");
  const [extQuery, setExtQuery] = useState("");
  const [extKind, setExtKind] = useState<ExtensionKind>("all");

  const installed: ExtensionManifest[] = [
    ...EXTENSIONS.filter((ext) => ext.builtIn),
    ...installedIds.map(findExtension).filter((ext): ext is ExtensionManifest => !!ext),
  ];
  const areas = installed.filter((ext) => ext.area);
  const isInstalled = (ext: ExtensionManifest) => !!ext.builtIn || installedIds.includes(ext.id);
  const current = active.kind === "overview" ? undefined : findExtension(active.id);

  const togglePanel = (next: SidePanel) => setPanel((shown) => (shown === next ? null : next));

  const browseThemes = () => {
    setExtQuery("");
    setExtKind("theme");
    setPanel("extensions");
  };

  // An area's tab closes when it's uninstalled (its details page stays open).
  useEffect(() => {
    for (const tab of tabs) {
      if (tab.kind === "extension" && !installedIds.includes(tab.id) && !findExtension(tab.id)?.builtIn) {
        closeExtension(tab.id);
      }
    }
  }, [tabs, installedIds, closeExtension]);

  // The shortcut handler is registered once, so it reads the latest state through a ref.
  const latest = useRef({ active, close });
  latest.current = { active, close };

  // VS Code shortcuts: Ctrl+B toggles the sidebar, Ctrl+Shift+X opens Extensions,
  // Ctrl+W closes the active tab, and the chord Ctrl+K then Ctrl+T opens Themes.
  useEffect(() => {
    let chord = false;
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (chord) {
        chord = false;
        if (mod && key === "t") {
          e.preventDefault();
          setPanel("themes");
          return;
        }
      }
      if (!mod) return;
      if (key === "k" && !e.shiftKey) {
        e.preventDefault();
        chord = true;
      } else if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        setPanel((shown) => (shown ? null : "areas"));
      } else if (key === "x" && e.shiftKey) {
        e.preventDefault();
        setPanel("extensions");
      } else if (key === "w" && !e.shiftKey) {
        e.preventDefault();
        latest.current.close(latest.current.active);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  let main;
  if (active.kind === "extension" && current?.area) {
    main = <ExtensionView key={current.id} ext={current} />;
  } else if (active.kind === "extension-info" && current) {
    main = (
      <ExtensionInfoView
        ext={current}
        installed={isInstalled(current)}
        onInstall={() => install(current.id)}
        onUninstall={() => uninstall(current.id)}
        onOpen={() => open({ kind: "extension", id: current.id })}
      />
    );
  } else {
    main = (
      <OverviewView
        areas={areas}
        onOpen={(id) => open({ kind: "extension", id })}
        onBrowse={() => setPanel("extensions")}
      />
    );
  }

  return (
    <ThemeProvider installed={installed}>
      <div className="app">
        <TopBar tabs={tabs} active={active} previewKey={previewKey} onSelect={open} onPin={pin} onClose={close} />
        <div className="workbench">
          <ActivityBar
            active={panel}
            onToggle={togglePanel}
            accountEmail={account?.state === "signed_in" ? account.email : undefined}
          />
          {panel === "areas" && (
            <AreasPanel areas={areas} view={active} onOpen={open} onBrowse={() => setPanel("extensions")} />
          )}
          {panel === "extensions" && (
            <ExtensionsPanel
              query={extQuery}
              onQueryChange={setExtQuery}
              kind={extKind}
              onKindChange={setExtKind}
              installedIds={installedIds}
              selectedId={active.kind === "extension-info" ? active.id : null}
              onOpen={(id, inNewTab) => open({ kind: "extension-info", id }, { preview: !inNewTab })}
              onInstall={install}
              onUninstall={uninstall}
            />
          )}
          {panel === "account" && <AccountPanel status={account} sync={sync} onChange={setAccount} />}
          {panel === "themes" && <ThemesPanel onBrowse={browseThemes} />}
          <main className="main">{main}</main>
        </div>
        {updater.offered && <UpdatePrompt status={updater.status} onInstall={updater.install} onLater={updater.later} />}
        <StatusBar
          status={status}
          sync={sync}
          onOpenSync={() => setPanel("account")}
          updater={updater.status}
          onCheckUpdates={() => void updater.checkNow(true)}
        />
      </div>
    </ThemeProvider>
  );
}
