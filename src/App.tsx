// First: it checks whether Axiom has run here before, before anything else saves a setting.
import { settleFirstRun, tourDue } from "./shell/firstRun";
import { useEffect, useRef, useState } from "react";
import { EXTENSIONS, findExtension } from "./extensions";
import type { ExtensionManifest } from "./extensions/types";
import { AccountPanel } from "./shell/AccountPanel";
import { AppLockScreen } from "./shell/AppLockScreen";
import { ActivityBar, type SidePanel } from "./shell/ActivityBar";
import { AreasPanel } from "./shell/AreasPanel";
import { ExtensionsPanel } from "./shell/ExtensionsPanel";
import { StatusBar } from "./shell/StatusBar";
import { ThemeProvider } from "./shell/theme/ThemeProvider";
import { ThemesPanel } from "./shell/ThemesPanel";
import { TopBar } from "./shell/TopBar";
import { useAccount } from "./shell/useAccount";
import { useAppStatus } from "./shell/useAppStatus";
import { useSync } from "./shell/useSync";
import { useUpdater } from "./shell/useUpdater";
import { UpdatePrompt } from "./shell/UpdatePrompt";
import { WhatsNew } from "./shell/WhatsNew";
import { useInstalled } from "./shell/useInstalled";
import { useOverviewVisibility } from "./shell/useOverviewVisibility";
import { useTabs } from "./shell/useTabs";
import { AreaNotifications } from "./shell/notifications/AreaNotifications";
import { setNotificationsOff } from "./lib/notifications";
import { AdminView } from "./shell/views/AdminView";
import { AnalyticsView } from "./shell/views/AnalyticsView";
import { ADMIN, ANALYTICS, OVERVIEW, viewKey } from "./shell/view";
import { usePanelRequests } from "./shell/panelRequests";
import { Tour } from "./shell/tour/Tour";
import { startTour, useTourRunning } from "./shell/tour/tourState";
import { ErrorBoundary } from "./shell/ui/ErrorBoundary";
import { ExtensionInfoView } from "./shell/views/ExtensionInfoView";
import { ExtensionView } from "./shell/views/ExtensionView";
import { OverviewView } from "./shell/views/OverviewView";
import { SidebarFrame } from "./shell/ui/SidebarFrame";
import { usePersistentState } from "./shell/usePersistentState";
import { QuickSwitcher } from "./shell/sidebar/QuickSwitcher";
import { areaWantsSidebar, noteOpened, rememberAreaSidebar, useSidebarPrefs, useSidebarWidth } from "./shell/sidebar/sidebarPrefs";
import { useBadges } from "./shell/sidebar/useBadges";
import { useCollapseReason } from "./shell/sidebar/useCollapseReason";
import { useTimers } from "./shell/desk/timers";
import { Companion } from "./features/lemma/Companion";
import { useAreaName } from "./features/lemma/persona";
import { useDesk } from "./shell/desk/useDesk";
import { isOverlaySidebar, useOverlaySidebar } from "./shell/usePhone";
import { useEdgeSwipe } from "./shell/useEdgeSwipe";
import { useLaunchArea } from "./shell/useLaunchArea";

export default function App() {
  const status = useAppStatus();
  const [account, setAccount] = useAccount();
  const sync = useSync();
  const updater = useUpdater();
  const { installedIds, install, uninstall, setEnabled, isOn } = useInstalled();
  const { hiddenIds, setHidden } = useOverviewVisibility();
  const { tabs, active, previewKey, open, pin, close, closeExtension, reorder } = useTabs();
  useDesk(open);
  // On a phone or tablet the sidebar slides over what's open, so it starts closed.
  const overlay = useOverlaySidebar();
  const [panel, setPanel] = useState<SidePanel | null>(() => (isOverlaySidebar() ? null : "areas"));
  const [extQuery, setExtQuery] = useState("");

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
  const nameOf = useAreaName();
  const isInstalled = (ext: ExtensionManifest) => !!ext.builtIn || installedIds.includes(ext.id);
  const current = active.kind === "extension" || active.kind === "extension-info" ? findExtension(active.id) : undefined;

  // ---------- The sidebar ----------

  const sidebarPrefs = useSidebarPrefs();
  const sidebarWidth = useSidebarWidth();
  const [pinned, setPinned] = usePersistentState<boolean>("axiom.sidebar.pinned", (saved) => saved === true);
  const openArea = active.kind === "extension" ? active.id : null;
  const sidebarIds = withSidebar.map((ext) => ext.id).join();
  const { running } = useTimers();
  const reason = useCollapseReason(active, !!running);
  // A phone or tablet is always "narrow": there the sidebar closes when you pick something, not on a timer.
  const collapseReason = overlay && reason === "narrow" ? null : reason;
  /** Tucked away by itself: why, and what to bring back once that's over. */
  const tucked = useRef<{ reason: string; restore: SidePanel } | null>(null);
  /** A reason you overruled (opening the sidebar anyway): it's left alone until that's over. */
  const overruled = useRef<string | null>(null);
  /** When the pointer was last on the sidebar: it never tucks away from under you. */
  const lastUsed = useRef(0);

  // Opened lately, for Recent and Ctrl+P, and to fold the areas hardly used into More.
  useEffect(() => {
    if (openArea) noteOpened(openArea);
    else if (active.kind === "overview" || active.kind === "analytics") noteOpened(active.kind);
  }, [openArea, active.kind]);

  /** You opened or closed the sidebar: that's what you want (each area remembers), whatever had tucked it away. */
  const choose = (next: SidePanel | null) => {
    if (tucked.current || collapseReason) {
      overruled.current = next ? collapseReason : null;
      tucked.current = null;
    }
    if (openArea && sidebarPrefs.perArea && (next === null || next === `area:${openArea}`)) rememberAreaSidebar(openArea, next !== null);
    setPanel(next);
  };
  // An area's icon opens the area too, so its sidebar and what's open agree;
  // clicking the icon of the sidebar that's showing closes it.
  const togglePanel = (next: SidePanel) => {
    if (panel === next) return choose(null);
    keepOnPhone.current = true;
    choose(next);
    if (next.startsWith("area:")) {
      const id = next.slice("area:".length);
      if (sidebarPrefs.perArea) rememberAreaSidebar(id, true);
      open({ kind: "extension", id });
    }
  };

  // The sidebar keeps up with what's open: an area brings its own sidebar
  // (or none, if you closed it there last time), the overview or Analytics
  // the list of areas. Closed, it stays closed: switching tabs never brings
  // it out (an area's icon does). A panel you went to yourself (account,
  // themes, extensions) stays put; and pinned, nothing moves it.
  useEffect(() => {
    if (pinned || !sidebarPrefs.follow) return;
    const target = (shown: SidePanel | null): SidePanel | null => {
      if (shown === null) return null;
      if (shown !== "areas" && !shown.startsWith("area:")) return shown;
      if (openArea && sidebarIds.split(",").includes(openArea)) {
        const wants = sidebarPrefs.perArea ? areaWantsSidebar(openArea) : undefined;
        if (wants === false) return null;
        return `area:${openArea}`;
      }
      return active.kind === "overview" || active.kind === "analytics" ? "areas" : shown;
    };
    // Tucked away meanwhile: what comes back is what's open now.
    if (tucked.current) {
      const next = target(tucked.current.restore);
      if (next) tucked.current.restore = next;
      return;
    }
    setPanel(target);
  }, [openArea, active.kind, pinned, sidebarIds, sidebarPrefs.follow, sidebarPrefs.perArea]);

  // On a phone or tablet, picking something in the sidebar shows it: the sidebar gets
  // out of the way (but not when an icon in the bottom bar opened both).
  const keepOnPhone = useRef(false);
  const shownKey = viewKey(active);
  useEffect(() => {
    if (keepOnPhone.current) keepOnPhone.current = false;
    else if (overlay) setPanel(null);
  }, [shownKey, overlay]);

  // Swiping in from the left edge brings the sidebar out; swiping it back puts it away.
  useEdgeSwipe(overlay, !!panel, {
    open: () => setPanel(active.kind === "extension" && sidebarIds.split(",").includes(active.id) ? (`area:${active.id}` as SidePanel) : "areas"),
    close: () => setPanel(null),
  });
  // Opened from a home-screen shortcut ("Today", "Project Board"…): straight to that area.
  useLaunchArea(areas, open);

  // Tucking itself away (narrow window, a roomy area, writing, a focus
  // timer), and coming back when that's over. Never while you're on it,
  // never when pinned, and not again for a reason you overruled.
  useEffect(() => {
    if (!collapseReason) {
      overruled.current = null;
      const was = tucked.current;
      tucked.current = null;
      if (was) setPanel((shown) => shown ?? was.restore);
      return;
    }
    if (pinned || overruled.current === collapseReason) return;
    const tuck = () =>
      setPanel((shown) => {
        if (!shown || overruled.current === collapseReason || Date.now() - lastUsed.current < 4000) return shown;
        tucked.current = { reason: collapseReason, restore: shown };
        return null;
      });
    tuck();
    // You were on it: once you've moved off, it goes.
    const again = setInterval(tuck, 2000);
    return () => clearInterval(again);
  }, [collapseReason, pinned]);

  // Pointing at an icon with the sidebar closed: its panel slides out over
  // what's open, and goes when the pointer leaves.
  const [peek, setPeek] = useState<SidePanel | null>(null);
  const peekTimer = useRef(0);
  const peekAt = (id: SidePanel | null) => {
    window.clearTimeout(peekTimer.current);
    if (panel && id) return;
    peekTimer.current = window.setTimeout(() => setPeek(id), id ? 280 : 250);
  };
  useEffect(() => {
    if (panel) setPeek(null);
  }, [panel]);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const badges = useBadges(areas.map((ext) => ext.id), !!running);
  const [switching, setSwitching] = useState(false);

  // A first run: settled with the account once it's known (an existing one
  // keeps its own areas and skips the tour), then Lemma shows them round.
  const touring = useTourRunning();
  useEffect(() => {
    if (!account) return;
    settleFirstRun(account);
    if (tourDue()) startTour();
  }, [account]);

  // Clicking into an open area: its sidebar (or the list of areas) slides
  // away, like a drawer. Nothing's remembered for the area, so it comes
  // back next time it's picked. Not when pinned, on a phone (it already
  // closes there) or during the tour.
  const slideAway = (e: React.PointerEvent<HTMLElement>) => {
    if (!sidebarPrefs.closeOnUse || pinned || overlay || touring || !openArea) return;
    if (panel !== "areas" && !panel?.startsWith("area:")) return;
    // A dialog over the area is portalled elsewhere: clicks in it don't count.
    if (!e.currentTarget.contains(e.target as Node)) return;
    tucked.current = null;
    setPanel(null);
  };

  // Asked for from elsewhere, e.g. Lemma's chat wanting an account made.
  const [signUp, setSignUp] = useState(0);
  usePanelRequests((request) => {
    if (request.signUp) setSignUp((n) => n + 1);
    keepOnPhone.current = true;
    choose(request.panel);
  });

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
  const latest = useRef({ active, close, panel, choose });
  latest.current = { active, close, panel, choose };

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
        const { panel, choose, active } = latest.current;
        choose(panel ? null : active.kind === "extension" ? (`area:${active.id}` as SidePanel) : "areas");
      } else if (key === "p" && !e.shiftKey) {
        // Ctrl+P: jump anywhere.
        e.preventDefault();
        setSwitching(true);
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

  /** A sidebar panel: in the sidebar, or peeking over what's open. */
  const panelFor = (p: SidePanel) => {
    if (p === "areas") return <AreasPanel areas={areas} view={active} onOpen={open} onBrowse={() => setPanel("extensions")} hiddenIds={hiddenIds} onVisibilityChange={setHidden} />;
    if (p === "extensions")
      return (
        <ExtensionsPanel
          hiddenIds={hiddenIds}
          onVisibilityChange={setHidden}
          query={extQuery}
          onQueryChange={setExtQuery}
          installedIds={installedIds}
          isOn={isOn}
          onEnabledChange={setEnabled}
          selectedId={active.kind === "extension-info" ? active.id : null}
          onOpen={(id, inNewTab) => open({ kind: "extension-info", id }, { preview: !inNewTab })}
          onInstall={install}
          onUninstall={uninstall}
        />
      );
    if (p === "account") return <AccountPanel status={account} sync={sync} onChange={setAccount} extensions={areas.map((ext) => ext.id)} signUp={signUp} />;
    if (p === "themes") return <ThemesPanel />;
    const ext = withSidebar.find((e) => p === `area:${e.id}`);
    const Sidebar = ext?.area?.Sidebar;
    if (!ext || !Sidebar) return null;
    return (
      <aside className="sidebar" aria-label={nameOf(ext)}>
        <button type="button" className="sidebar-head sidebar-head-link" title={`Open ${nameOf(ext)}`} aria-label={`Open ${nameOf(ext)}`} onClick={() => open({ kind: "extension", id: ext.id })}>
          {nameOf(ext)}
        </button>
        <div className="sidebar-body">
          <Sidebar active={active.kind === "extension" && active.id === ext.id} onOpen={() => open({ kind: "extension", id: ext.id })} />
          <AreaNotifications extension={ext.id} signedIn={account?.state === "signed_in"} />
        </div>
      </aside>
    );
  };

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
  } else if (active.kind === "analytics") {
    main = <AnalyticsView areas={areas} onOpen={(id) => open({ kind: "extension", id })} />;
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
        <TopBar tabs={tabs} active={active} previewKey={previewKey} onSelect={open} onPin={pin} onClose={close} onReorder={reorder} />
        <div className="workbench" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
          <ActivityBar
            hiddenIds={hiddenIds}
            onVisibilityChange={setHidden}
            active={panel}
            current={openArea}
            areas={withSidebar.map((ext) => ({ id: `area:${ext.id}` as const, label: nameOf(ext), icon: ext.icon, extension: ext }))}
            onToggle={togglePanel}
            onPeek={peekAt}
            badges={badges}
            analytics={{ open: active.kind === "analytics", onOpen: () => open(ANALYTICS) }}
            accountEmail={account?.state === "signed_in" ? account.email : undefined}
            admin={account?.state === "signed_in" && account.admin ? { open: active.kind === "admin", onOpen: () => open(ADMIN) } : undefined}
          />
          <SidebarFrame
            open={!!panel && (!panel.startsWith("area:") || !!shownArea)}
            pinned={pinned}
            onPin={setPinned}
            onUse={() => {
              lastUsed.current = Date.now();
            }}
          >
            {panel && panelFor(panel)}
          </SidebarFrame>
          {overlay && panel && <div className="sidebar-scrim" aria-hidden="true" onClick={() => setPanel(null)} />}
          {/* Peeking, with the sidebar closed: the panel over what's open, until the pointer leaves. */}
          {peek && !panel && (
            <div className="sidebar-peek" onPointerEnter={() => window.clearTimeout(peekTimer.current)} onPointerLeave={() => peekAt(null)}>
              {panelFor(peek)}
            </div>
          )}
          <main className="main" data-tour="main" onPointerDown={slideAway}>
            <ErrorBoundary key={viewKey(active)}>{main}</ErrorBoundary>
          </main>
        </div>
        {areas.some((area) => area.id === "lemma") && !(active.kind === "extension" && active.id === "lemma") && (active.kind !== "overview" || hiddenIds.includes("lemma")) && (
          <Companion onOpen={() => open({ kind: "extension", id: "lemma" })} />
        )}
        {switching && <QuickSwitcher areas={areas} onOpen={open} onClose={() => setSwitching(false)} />}
        {updater.offered && <UpdatePrompt status={updater.status} onInstall={updater.install} onLater={updater.later} />}
        <WhatsNew version={status.version} onOpenLemma={() => open({ kind: "extension", id: "lemma" })} />
        {touring && <Tour areas={areas} panel={panel} onShowOverview={() => open(OVERVIEW)} />}
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
