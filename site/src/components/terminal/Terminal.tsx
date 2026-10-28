"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Layers, LayoutDashboard, LockKeyhole, Menu, Palette, PanelLeftClose, RefreshCw, Search, Settings, X } from "lucide-react";
import { Mark } from "@/components/Logo";
import { DailyPlan, DailyPlanSidebar, planTasks } from "./DailyPlan";
import { TERMINAL_AREAS, type TerminalTab } from "./registry";
import { useTerminalPrefs } from "./useTerminalPrefs";
import { BoardOverview } from "./BoardOverview";
import { ProjectBoard } from "./ProjectBoard";
import { PlannerOverview } from "./PlannerOverview";
import { useCalendarFeeds } from "./useCalendarFeeds";
import { useDesktopPlanner } from "./useDesktopPlanner";
import { useWorkspace } from "./useWorkspace";
import s from "./terminal.module.css";

export interface TerminalAccount { id: string; email: string; displayName: string | null }
const themes = [
  { id: "dark", label: "Modern Dark", colors: ["#1f1f1f", "#181818", "#0078d4"] },
  { id: "light", label: "Modern Light", colors: ["#f5f5f5", "#ebebeb", "#005fb8"] },
  { id: "ember", label: "Ember", colors: ["#31312e", "#373633", "#ec6a3f"] },
] as const;

export function Terminal({ account }: { account: TerminalAccount }) {
  const workspace = useWorkspace(account.id);
  useCalendarFeeds(workspace);
  useDesktopPlanner(workspace);
  const [prefs, setPrefs] = useTerminalPrefs(account.id);
  const [boardProject, setBoardProject] = useState<string | undefined>(undefined);
  const [planDay, setPlanDay] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [prefs.active]);
  const active = TERMINAL_AREAS.find(area => area.id === prefs.active);
  const open = useCallback((tab: TerminalTab) => setPrefs(current => ({ ...current, active: tab, tabs: current.tabs.includes(tab) ? current.tabs : [...current.tabs, tab] })), [setPrefs]);
  const close = useCallback((tab: TerminalTab) => setPrefs(current => {
    if (tab === "overview") return current;
    const index = current.tabs.indexOf(tab);
    const tabs = current.tabs.filter(value => value !== tab);
    return { ...current, tabs, active: current.active === tab ? tabs[Math.max(0, index - 1)] ?? "overview" : current.active };
  }), [setPrefs]);
  useEffect(() => {
    let chord = false;
    let timer = 0;
    const keydown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (chord) { chord = false; window.clearTimeout(timer); if (mod && key === "t") { event.preventDefault(); open("themes"); return; } }
      if (!mod) return;
      if (key === "b" && !event.shiftKey) { event.preventDefault(); setPrefs(current => ({ ...current, sidebar: !current.sidebar })); }
      if (key === "k" && !event.shiftKey) { event.preventDefault(); chord = true; timer = window.setTimeout(() => { chord = false; }, 1500); }
      if (key === "f" && event.shiftKey) { event.preventDefault(); setPrefs(current => ({ ...current, sidebar: true })); window.setTimeout(() => searchRef.current?.focus(), 0); }
      if (key === "w" && prefs.active !== "overview") { event.preventDefault(); close(prefs.active); }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); window.clearTimeout(timer); };
  }, [close, open, prefs.active, setPrefs]);

  const colour = (area: typeof TERMINAL_AREAS[number]) => prefs.theme === "light" ? area.light : area.dark;
  const tasks = planTasks(workspace.records);
  const pendingLabel = workspace.pending ? `${workspace.pending} change${workspace.pending === 1 ? "" : "s"} waiting to sync` : "Saved in this browser";

  if (workspace.expired) return <div className={s.shell} data-theme={prefs.theme}><main id="main" className={s.empty} style={{ gridRow: "1 / -1" }}><LockKeyhole size={32} /><h1>Your sign-in changed</h1><p>Reload to continue with your current account. Any unsynced edits remain saved separately for the account that made them.</p><button className={s.button} onClick={() => window.location.reload()}>Reload terminal</button></main></div>;

  return <div className={s.shell} data-theme={prefs.theme} data-testid="web-terminal">
    <header className={s.topbar}><div className={s.brand}><Link href="/" aria-label="Axiom homepage"><Mark size={22} /></Link><span>AXIOM</span></div><span className={s.badge}>WEB · EARLY ACCESS</span><nav ref={tabsRef} className={s.tabs} aria-label="Workspace tabs" onWheel={event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }}>{prefs.tabs.map(tab => {
      const area = TERMINAL_AREAS.find(item => item.id === tab);
      const Icon = area?.icon ?? (tab === "themes" ? Palette : LayoutDashboard);
      const name = area?.name ?? (tab === "themes" ? "Themes" : "Overview");
      return <div className={s.tab} data-active={prefs.active === tab} key={tab}><button aria-current={prefs.active === tab ? "page" : undefined} onClick={() => open(tab)}><Icon size={15} style={area ? { color: colour(area) } : undefined} />{name}</button>{tab !== "overview" && <button aria-label={`Close ${name}`} onClick={() => close(tab)}><X size={13} /></button>}</div>;
    })}</nav><button className={s.iconButton} title="Toggle sidebar" aria-label="Toggle sidebar" aria-expanded={prefs.sidebar} onClick={() => setPrefs(current => ({ ...current, sidebar: !current.sidebar }))}><Menu size={19} /></button><Link className={s.iconButton} href="/account" aria-label="Your account"><Settings size={18} /></Link></header>
    <div className={s.workbench}><nav className={s.rail} aria-label="Areas"><button className={s.iconButton} title="Overview" aria-label="Overview" aria-pressed={prefs.active === "overview"} onClick={() => open("overview")}><Layers size={22} /></button>{TERMINAL_AREAS.map(area => <button key={area.id} className={s.iconButton} aria-label={area.name} title={area.name} aria-pressed={prefs.active === area.id} onClick={() => open(area.id)} style={{ color: colour(area) }}><area.icon size={21} /></button>)}<span className={s.spacer} /><Link href="/account" className={s.iconButton} aria-label="Account and security" title={account.email}><Settings size={20} /></Link><button className={s.iconButton} aria-label="Themes" title="Themes (Ctrl+K Ctrl+T)" aria-pressed={prefs.active === "themes"} onClick={() => open("themes")}><Palette size={21} /></button></nav>
      {prefs.sidebar && <aside className={`${s.sidebar} ${prefs.active === "daily-plan" ? s.plannerSidebar : ""}`} aria-label="Workspace navigation">{prefs.active === "daily-plan" ? <DailyPlanSidebar theme={prefs.theme} /> : <><div className={s.sideHead}>YOUR WORKSPACE<button className={s.iconButton} aria-label="Close sidebar" onClick={() => setPrefs(current => ({ ...current, sidebar: false }))}><PanelLeftClose size={15} /></button></div><div className={s.search}><Search size={15} style={{ flex: "none", marginTop: 10 }} /><input ref={searchRef} aria-label="Find an area" placeholder="Find an area…" value={search} onChange={event => setSearch(event.target.value)} /></div><button className={s.sideLink} aria-current={prefs.active === "overview" ? "page" : undefined} onClick={() => open("overview")}><LayoutDashboard size={17} /> Overview</button><div className={s.sideHead}><span><ChevronDown size={13} /> AREAS</span><span>{TERMINAL_AREAS.length}</span></div>{TERMINAL_AREAS.filter(area => area.name.toLowerCase().includes(search.toLowerCase())).map(area => <button className={s.sideLink} key={area.id} aria-current={prefs.active === area.id ? "page" : undefined} onClick={() => { open(area.id); if (window.innerWidth < 700) setPrefs(current => ({ ...current, sidebar: false })); }}><area.icon size={18} style={{ color: colour(area) }} /><span>{area.name}</span>{area.encrypted && <LockKeyhole size={11} style={{ marginLeft: "auto", opacity: .6 }} />}</button>)}<div className={s.sideFoot}><p>Signed in as<br /><strong>{account.displayName || account.email}</strong></p><p>Changes in ported areas sync with the Axiom desktop app.</p><Link href="/account">Account and devices <ArrowUpRight size={12} /></Link></div></>}</aside>}
      <main id="main" className={s.main} data-web-daily-plan={prefs.active === "daily-plan" ? "true" : undefined} tabIndex={-1}>
        {workspace.error && <div className={s.notice} role="alert" style={{ margin: "16px 20px 0" }}><span className={s.error}>{workspace.error}</span><p>{workspace.pending ? "Your edits are saved in this browser and will retry when you reconnect." : "You can keep working with any data already saved in this browser."}</p><button className={s.button} onClick={() => void workspace.sync()} disabled={workspace.state === "syncing"}><RefreshCw size={13} /> Retry sync</button></div>}
        {prefs.active === "daily-plan" ? <DailyPlan workspace={workspace} initialDay={planDay} theme={prefs.theme} /> : prefs.active === "project-board" ? <ProjectBoard workspace={workspace} initialProjectId={boardProject} /> : prefs.active === "themes" ? <div className={s.content}><div className={s.heading}><div><span className={s.eyebrow}>MAKE IT FEEL LIKE YOURS</span><h1>Themes</h1><p>Your choice is remembered in this browser.</p></div></div><div className={s.grid}>{themes.map(theme => <button key={theme.id} className={`${s.panel} ${s.theme}`} aria-pressed={prefs.theme === theme.id} onClick={() => setPrefs(current => ({ ...current, theme: theme.id }))}><span className={s.swatches}>{theme.colors.map(color => <i key={color} style={{ background: color }} />)}</span><strong>{theme.label} {prefs.theme === theme.id && <Check size={14} />}</strong></button>)}</div><p style={{ marginTop: 20, color: "var(--dim)" }}>The remaining desktop theme packs will follow as the web terminal develops.</p></div> : active ? <div className={s.content}><div className={s.heading}><div><span className={s.eyebrow}>YOUR CONNECTED WORKSPACE</span><h1><active.icon size={24} style={{ color: colour(active), marginRight: 12 }} />{active.name}</h1></div><span className={s.badge}>{active.stage}</span></div><section className={`${s.panel} ${s.empty}`}>{active.encrypted ? <LockKeyhole size={36} style={{ color: colour(active) }} /> : <active.icon size={36} style={{ color: colour(active) }} />}<h2>{active.encrypted ? "Your private data stays locked." : `${active.name} is next in line.`}</h2><p>{active.description}</p><p>{active.encrypted ? "This area will open after browser encryption and unlock are implemented. The web terminal cannot currently read or change these records." : "This is the workspace skeleton. This area's desktop tools are being ported in stages."}</p><Link className={s.button} href="/download">Use this area in the desktop app <ArrowUpRight size={14} /></Link></section></div> : <div className={s.content}><header className={s.heading}><div><span className={s.eyebrow}>YOUR LIFE. ONE CONNECTED WORKSPACE.</span><h1>Welcome back{account.displayName ? `, ${account.displayName}` : ""}.</h1><p>A little structure for whatever comes next.</p></div><button className={s.button} disabled={workspace.state === "syncing"} onClick={() => void workspace.sync()}><RefreshCw size={14} /> {workspace.state === "syncing" ? "Syncing…" : "Sync now"}</button></header><div className={s.notice}><strong>The web terminal is taking shape.</strong> Daily Plan and personal Project Boards are ready to use. Other areas are listed below so you can follow what is coming next.</div><div className={s.grid}><PlannerOverview workspace={workspace} tasks={tasks} prefs={prefs.planOverview} onPrefs={value => setPrefs(current => ({ ...current, planOverview: value }))} onOpen={day => { setPlanDay(day); open("daily-plan"); }} /><BoardOverview workspace={workspace} onOpen={id => { setBoardProject(id); open("project-board"); }} /><section className={s.panel}><h2><RefreshCw size={17} /> One workspace, across devices</h2><p>Daily Plan edits are saved in your browser first, then synced to your account. Open Axiom on your computer to pick up where you left off.</p><p>{pendingLabel}.</p><p>Only data you have synced from the desktop app is available here. Calendar accounts remain on the desktop for now.</p></section><section className={s.panel}><h2><LockKeyhole size={17} /> Private stays private</h2><p>Finance, Notes, Journal, Goals and Birthdays use end-to-end encryption. They remain locked here until the browser can unlock them with your key.</p><p>The web terminal never writes unencrypted data into these areas.</p></section></div><div className={s.heading} style={{ marginTop: 32 }}><h2>Every part of your life, one area at a time.</h2><span className={s.badge}>FEATURE ROADMAP</span></div><div className={s.grid}>{TERMINAL_AREAS.map(area => <section className={s.panel} key={area.id}><h3><area.icon size={18} style={{ color: colour(area) }} />{area.name}<span className={s.badge} style={{ marginLeft: "auto" }}>{area.stage}</span></h3><p>{area.description}</p><button className={s.button} onClick={() => open(area.id)}>{area.id === "daily-plan" ? "Open planner" : "View area"} <ArrowUpRight size={13} /></button></section>)}</div></div>}
      </main>
    </div><footer className={s.statusbar}><span className={s.dot} data-state={workspace.state} /><span role="status">{workspace.state === "loading" ? "Opening browser storage…" : workspace.state === "syncing" ? "Syncing…" : workspace.state === "error" ? "Sync needs attention" : "Synced"}</span><span>·</span><span>{pendingLabel}</span><span>Axiom Web · Early access</span></footer>
  </div>;
}
