import { useEffect, useRef, useState } from "react";
import { EXTENSIONS, findExtension } from "./extensions";
import type { ExtensionManifest } from "./extensions/types";
import { AccountPanel } from "./shell/AccountPanel";
import { AppLockScreen } from "./shell/AppLockScreen";
import { AssistantPanel } from "./shell/AssistantPanel";
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
import { useOverviewVisibility } from "./shell/useOverviewVisibility";
import { useTabs } from "./shell/useTabs";
import { AreaNotifications } from "./shell/notifications/AreaNotifications";
import { setNotificationsOff } from "./lib/notifications";
import { AdminView } from "./shell/views/AdminView";
import { ADMIN } from "./shell/view";
import { ExtensionInfoView } from "./shell/views/ExtensionInfoView";
import { ExtensionView } from "./shell/views/ExtensionView";
import { OverviewView } from "./shell/views/OverviewView";
import { SidebarFrame } from "./shell/ui/SidebarFrame";

export default function App() {
  const status = useAppStatus();
  const [account, setAccount] = useAccount();
  const sync = useSync();
  const updater = useUpdater();
  const { installedIds, install, uninstall, setEnabled, isOn } = useInstalled();
  const { hiddenIds, setHidden } = useOverviewVisibility();
  const { tabs, active, previewKey, open, pin, close, closeExtension } = useTabs();
  const [panel, setPanel] = useState<SidePanel | null>("areas");
  const [extQuery, setExtQuery] = useState("");
  const [extKind, setExtKind] = useState<ExtensionKind>("all");

  // Built in or installed, and switched on: everything else stays out of the way.
  const installed: ExtensionManifest[] = EXTENSIONS.filter(isOn);
  const areas = installed.filter((ext) => ext.area);

  // Extensions that are off send no notifications, on any channel.
  const offIds = EXTENSIONS.filter((ext) => !isOn(ext)).map((ext) => ext.id).join();
  useEffect(() => {
    setNotificationsOff(offIds ? offIds.split(",") : []).catch(() => {});
  }, [offIds]);
  const withSidebar = areas.filter((ext) => ext.area?.Sidebar);
  const shownArea = withSidebar.find((ext) => panel === `area:${ext.id}`);
  const AreaSidebar = shownArea?.area?.Sidebar;
  const isInstalled = (ext: ExtensionManifest) => !!ext.builtIn || installedIds.includes(ext.id);
  const current = active.kind === "extension" || active.kind === "extension-info" ? findExtension(active.id) : undefined;

  const togglePanel = (next: SidePanel) => setPanel((shown) => (shown === next ? null : next));

  const browseThemes = () => {
    setExtQuery("");
    setExtKind("theme");
    setPanel("extensions");
  };

  // An area's tab closes when it's switched off or uninstalled (its details page stays open).
  useEffect(() => {
    for (const tab of tabs) {
      const ext = tab.kind === "extension" ? findExtension(tab.id) : undefined;
      if (tab.kind === "extension" && (!ext || !isOn(ext))) closeExtension(tab.id);
    }
  }, [tabs, isOn, closeExtension]);

  // An area's own sidebar closes when the area is uninstalled.
  useEffect(() => {
    if (panel?.startsWith("area:") && !shownArea) setPanel("areas");
  }, [panel, shownArea]);

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
        enabled={isOn(current)}
        onEnabledChange={(on) => setEnabled(current.id, on)}
        onInstall={() => install(current.id)}
        onUninstall={() => uninstall(current.id)}
        onOpen={() => open({ kind: "extension", id: current.id })}
        signedIn={account?.state === "signed_in"}
      />
    );
  } else if (active.kind === "admin") {
    main = <AdminView email={account?.state === "signed_in" ? account.email : null} admin={account?.state === "signed_in" && account.admin} />;
  } else {
    main = (
      <OverviewView
        areas={areas}
        hiddenIds={hiddenIds}
        onVisibilityChange={setHidden}
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
            hiddenIds={hiddenIds}
            onVisibilityChange={setHidden}
            active={panel}
            areas={withSidebar.map((ext) => ({ id: `area:${ext.id}` as const, label: ext.name, icon: ext.icon, extension: ext }))}
            onToggle={togglePanel}
            accountEmail={account?.state === "signed_in" ? account.email : undefined}
            admin={account?.state === "signed_in" && account.admin ? { open: active.kind === "admin", onOpen: () => open(ADMIN) } : undefined}
          />
          <SidebarFrame open={!!panel && (!panel.startsWith("area:") || !!shownArea)}>
          {panel === "areas" && (
            <AreasPanel areas={areas} view={active} onOpen={open} onBrowse={() => setPanel("extensions")}
              hiddenIds={hiddenIds} onVisibilityChange={setHidden} />
          )}
          {panel === "extensions" && (
            <ExtensionsPanel
              hiddenIds={hiddenIds}
              onVisibilityChange={setHidden}
              query={extQuery}
              onQueryChange={setExtQuery}
              kind={extKind}
              onKindChange={setExtKind}
              installedIds={installedIds}
              isOn={isOn}
              onEnabledChange={setEnabled}
              selectedId={active.kind === "extension-info" ? active.id : null}
              onOpen={(id, inNewTab) => open({ kind: "extension-info", id }, { preview: !inNewTab })}
              onInstall={install}
              onUninstall={uninstall}
            />
          )}
          {panel === "account" && <AccountPanel status={account} sync={sync} onChange={setAccount} extensions={areas.map((ext) => ext.id)} />}
          {panel === "themes" && <ThemesPanel onBrowse={browseThemes} />}
          {panel === "assistant" && <AssistantPanel areas={areas} />}
          {shownArea && AreaSidebar && (
            <aside className="sidebar" aria-label={shownArea.name}>
              <button
                type="button"
                className="sidebar-head sidebar-head-link"
                title={`Open ${shownArea.name}`}
                aria-label={`Open ${shownArea.name}`}
                onClick={() => open({ kind: "extension", id: shownArea.id })}
              >
                {shownArea.name}
              </button>
              <div className="sidebar-body">
                <AreaSidebar
                  active={active.kind === "extension" && active.id === shownArea.id}
                  onOpen={() => open({ kind: "extension", id: shownArea.id })}
                />
                <AreaNotifications extension={shownArea.id} signedIn={account?.state === "signed_in"} />
              </div>
            </aside>
          )}
          </SidebarFrame>
          <main className="main">{main}</main>
        </div>
        {updater.offered && <UpdatePrompt status={updater.status} onInstall={updater.install} onLater={updater.later} />}
        <AppLockScreen accountState={account?.state} />
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
