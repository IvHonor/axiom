import { useRef, useState } from "react";
import { ArrowUpRight, GraduationCap, Plus, RefreshCw } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { today } from "../daily_plan/time";
import { api, errorMessage, type LectureHit, type ModuleCard } from "./api";
import { setUniUi, uniChanged, type UniPage } from "./uniUi";
import { useSummary } from "./useSummary";
import { ratio, resolveView, selectHits, selectModules, termStatus, totals, VIEWS } from "./overview/model";
import { useUniPreferences } from "./overview/preferences";
import { ComingWeek, LectureCollection, Meter, ModuleCollection, moduleStyle, StudyProgress, TermCardView } from "./overview/UniOverviewParts";
import "./overview/overview.css";

/** Fitted views use the measured body and reserve every heading, footer and pager. */
export function UniSummary({onOpen}: {onOpen: () => void}) {
  const {size, width, height} = useTileLayout();
  const {prefs} = useUniPreferences(size);
  const {summary, error, reload, loading} = useSummary(width > 0 && height > 0);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const view = resolveView(prefs, width, height);
  const notice = mutationError ?? error;
  const open = (page: UniPage = "modules", module: string | null = null) => {
    setUniUi({term: null, page, module, dialog: null});
    onOpen();
  };
  const add = (term: boolean) => {
    setUniUi({term: null, page: "modules", module: null, dialog: {kind: term ? "term" : "module", id: null}});
    onOpen();
  };
  const catchUp = async (id: string) => {
    if (busy.current) return;
    busy.current = true;
    setPending(id); setMutationError(null);
    try { await api.setStage(id, "caught_up", true, today()); uniChanged(); }
    catch (err) { setMutationError(errorMessage(err)); }
    finally { busy.current = false; setPending(null); }
  };
  const retry = () => { setMutationError(null); reload(); };

  if (!summary) return <div className="un-ov-status" role={error ? "alert" : "status"}>
    <span title={error ?? undefined}>{error ? "Couldn't load University" : "Loading University…"}</span>
    {error && <button className="un-ov-link" onClick={retry}>Retry</button>}
  </div>;
  if (notice && height < 220) return <button className="un-ov-status" title={notice} onClick={retry}>
    <strong>University needs a refresh</strong><span className="un-ov-link">Retry</span>
  </button>;

  const term = summary.terms.find(term => term.id === summary.current);
  const heading = height >= 280 && width >= 190 && !notice;
  const footer = height >= 210 && width >= 170;
  const contentHeight = Math.max(0, height - (heading ? 32 : 0) - (footer ? 32 : 0) - (notice ? 32 : 0));
  const modules = selectModules(summary.modules, prefs);
  const aggregate = totals(modules), overall = ratio(aggregate.caughtUp, aggregate.lectures);
  const behind = selectHits(summary, modules, "behind"), upcoming = selectHits(summary, modules, "upcoming");
  const attention = modules.filter(module => module.behind > 0 || module.shaky > 0).sort((a, b) => b.behind - a.behind || b.shaky - a.shaky || a.position - b.position);
  const openModule = (id: string) => open("modules", id);
  const collection = (items: ModuleCard[], available = contentHeight, availableWidth = width, cards = false, needsAttention = false, label = "modules") =>
    <ModuleCollection key={`${view}-${prefs.scope}-${prefs.sort}-${label}`} modules={items} width={availableWidth} height={available} prefs={prefs}
      open={openModule} cards={cards} attention={needsAttention} label={label} />;
  const lectures = (hits: LectureHit[], available = contentHeight, availableWidth = width, overdue = false, label = "lectures") =>
    <LectureCollection key={`${view}-${prefs.scope}-${label}`} hits={hits} width={availableWidth} height={available} prefs={prefs} open={openModule}
      behind={overdue} label={label} onCatchUp={catchUp} pending={pending} />;
  const empty = (available = contentHeight) => {
    const tiny = available < 105 || width < 145;
    return <div className={`un-ov-start${available < 170 || width < 190 ? " is-small" : ""}`}>
      {available >= 200 && width >= 160 && <GraduationCap size={30} strokeWidth={1.25} />}
      {!tiny && <strong>{!term ? "Your term, at a glance" : summary.modules.length ? "No matching modules" : "Make room for your modules"}</strong>}
      {available >= 150 && width >= 180 && <p>{!term ? "Set up your teaching term, then bring lectures and catch-up work together." : summary.modules.length ? "Change the module filter in the display menu to see more." : "Add your modules to start tracking lectures and study progress."}</p>}
      <button className="un-ov-link" onClick={summary.modules.length && term ? () => open() : () => add(!term)}>
        {!term ? "Set up term" : summary.modules.length ? "Open modules" : "Add a module"}{width >= 125 && <ArrowUpRight size={13} />}
      </button>
    </div>;
  };
  const counts = () => <div className="un-ov-counts">
    <button onClick={() => open()}><strong>{modules.length}</strong><small>Modules</small></button>
    <button className={behind.length ? "is-warning" : undefined} onClick={() => open("behind")}><strong>{behind.length}</strong><small>Behind</small></button>
    <button onClick={() => open("upcoming")}><strong>{upcoming.length}</strong><small>Coming up</small></button>
  </div>;
  const pulse = (available: number) => <div className="un-ov-pulse">
    <div className="un-ov-pulse-head"><button onClick={() => open()} title={term?.name}>
      <strong>{term ? termStatus(term) : "University"}</strong>{available >= 135 && <small className="un-ov-meta">{term?.name}{prefs.scope !== "all" ? " · Filtered" : ""}</small>}
    </button><span title={`${aggregate.caughtUp} of ${aggregate.lectures} lectures caught up`}>{overall === null ? "—" : `${Math.round(overall)}%`}</span></div>
    <Meter value={overall} label="Selected modules catch-up progress" />
    {counts()}
    {available >= 210 && <span className="un-ov-meta">{aggregate.caughtUp}/{aggregate.lectures} caught up · {aggregate.reviewed} reviewed</span>}
  </div>;

  const content = () => {
    if (!term || !summary.modules.length) return empty();
    if (view === "glance") return <div className="un-ov-glance">
      <button onClick={() => open(behind.length ? "behind" : upcoming.length ? "upcoming" : "modules")} title={term.name}>
        <strong>{behind.length ? `${behind.length} behind` : upcoming.length ? `${upcoming.length} coming up` : "All caught up"}</strong>
        {height >= 58 && <small>{termStatus(term)}</small>}
      </button>
      {width >= 220 && overall !== null && <span className="un-ov-number">{Math.round(overall)}%</span>}
    </div>;
    if (view === "strip") {
      const count = Math.max(1, Math.min(5, Math.floor((width - 55) / 160)));
      return modules.length ? <div className="un-ov-strip" style={{gridTemplateColumns: `repeat(${Math.min(modules.length, count)}, minmax(0, 1fr))${modules.length > count ? " 45px" : ""}`}}>
        {modules.slice(0, count).map(module => <button key={module.id} style={moduleStyle(module.color)} onClick={() => openModule(module.id)} title={module.name}>
          <strong><i className="un-ov-dot" />{module.code || module.name}</strong><span className="un-ov-meta">{module.caughtUp}/{module.lectures} caught up</span><Meter value={module.percent} label={`${module.name} progress`} />
        </button>)}
        {modules.length > count && <button className="un-ov-link" onClick={() => open()}>+{modules.length - count}</button>}
      </div> : empty();
    }
    if (view === "term") return <TermCardView term={term} modules={modules} height={contentHeight} open={() => open()} />;
    if (view === "progress") return <StudyProgress modules={modules} height={contentHeight} open={() => open()} />;
    if (view === "behind") return lectures(behind, contentHeight, width, true, "overdue lectures");
    if (view === "upcoming") return lectures(upcoming, contentHeight, width, false, "upcoming lectures");
    if (view === "week") return <ComingWeek hits={upcoming} width={width} height={contentHeight} prefs={prefs} open={openModule} />;
    if (view === "attention") return collection(attention, contentHeight, width, false, true, "attention modules");
    if (view === "pulse") return pulse(contentHeight);
    if (view === "modules" || view === "cards") return collection(modules, contentHeight, width, view === "cards");
    const mainWidth = Math.floor((width - 20) * .55), sideWidth = width - mainWidth - 40;
    const pulseHeight = 110;
    const sideHeight = Math.floor((contentHeight - 70) / 2);
    return <div className="un-ov-dashboard" style={{gridTemplateColumns: `minmax(0, ${mainWidth}fr) minmax(0, ${width - mainWidth - 20}fr)`}}>
      <section className="un-ov-dashboard-main">
        <div style={{height: pulseHeight, flex: "none"}}>{pulse(pulseHeight)}</div>
        <div className="un-ov-subheading"><strong>Module progress</strong><span>{modules.length}</span></div>
        <div className="un-ov-fill">{collection(modules, contentHeight - pulseHeight - 40, mainWidth, false, false, "dashboard modules")}</div>
      </section>
      <section className="un-ov-dashboard-side">
        <div className="un-ov-subheading"><strong>Catch up</strong><button className="un-ov-link" onClick={() => open("behind")}>{behind.length} behind <ArrowUpRight size={12} /></button></div>
        <div style={{height: sideHeight, flex: "none"}}>{lectures(behind, sideHeight, sideWidth, true, "dashboard overdue")}</div>
        <div className="un-ov-subheading"><strong>Coming up</strong><button className="un-ov-link" onClick={() => open("upcoming")}>Next 7 days <ArrowUpRight size={12} /></button></div>
        <div className="un-ov-fill">{lectures(upcoming, sideHeight, sideWidth, false, "dashboard upcoming")}</div>
      </section>
    </div>;
  };

  return <div className="un-ov-root" data-view={view} data-width={width} data-height={height} aria-busy={loading || !!pending}>
    {heading && <header className="un-ov-heading"><strong>{VIEWS.find(option => option.id === view)?.label}{prefs.scope !== "all" ? " · Filtered" : ""}</strong><button className="icon-btn" aria-label={term ? "Add a module" : "Set up term"} title={term ? "Add a module" : "Set up term"} onClick={() => add(!term)}><Plus size={15} /></button></header>}
    {notice && <div className="un-ov-notice" role="alert"><span title={notice}>{mutationError ? "Couldn't mark lecture caught up" : "Showing saved University data"}</span><button className="icon-btn" aria-label="Retry University data" title={notice} onClick={retry}><RefreshCw size={13} /></button></div>}
    <div className="un-ov-content">{content()}</div>
    {footer && <footer className="un-ov-footer"><span title={term?.name}>{term ? termStatus(term) : "No teaching term"}</span><button className="un-ov-link" onClick={() => open()}>Open university <ArrowUpRight size={12} /></button></footer>}
  </div>;
}
