import { useState, type CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { addDays, mediumDay, today } from "../../daily_plan/time";
import { COLORS, daysText, KINDS, type LectureHit, type ModuleCard, type TermCard } from "../api";
import { pageLayout, percent, ratio, rowHeight, termStatus, totals, type Preferences } from "./model";

export const moduleStyle = (color: ModuleCard["color"]) => ({"--module": COLORS[color]} as CSSProperties);

export function Meter({value, label}: {value: number | null; label: string}) {
  const safe = percent(value);
  return <span className="un-ov-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={safe === null ? undefined : Math.round(safe)} aria-valuetext={safe === null ? "No lectures yet" : undefined}>
    <span style={{width: `${safe ?? 0}%`}} />
  </span>;
}

function Pager({page, pages, start, count, total, label, narrow, setPage}: {
  page: number; pages: number; start: number; count: number; total: number; label: string; narrow: boolean; setPage: (page: number) => void;
}) {
  return pages > 1 && <div className="un-ov-pager">
    <span aria-live="polite" aria-label={`${start + 1}–${Math.min(total, start + count)} of ${total}`}>
      {narrow ? `${page + 1}/${pages}` : `${start + 1}–${Math.min(total, start + count)} of ${total}`}
    </span>
    <button className="icon-btn" aria-label={`Previous ${label} page`} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
    <button className="icon-btn" aria-label={`Next ${label} page`} disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
  </div>;
}

export function ModuleCollection({modules, width, height, prefs, open, cards = false, attention = false, label = "modules"}: {
  modules: ModuleCard[]; width: number; height: number; prefs: Preferences; open: (id: string) => void;
  cards?: boolean; attention?: boolean; label?: string;
}) {
  const [requested, setPage] = useState(0);
  const columns = cards ? Math.max(1, Math.floor((width + 12) / 180)) : width >= 650 ? Math.floor(width / 310) : 1;
  const row = cards ? Math.min(height - 28, height < 300 ? 148 : 174)
    : Math.min(rowHeight(prefs, height), Math.max(24, height - (modules.length > columns ? 28 : 0)));
  const {count, pages} = pageLayout(modules.length, height, row + (cards ? 10 : 0), columns);
  const page = Math.min(requested, pages - 1), start = page * count;
  if (!modules.length) return <div className="un-ov-empty-note">{attention ? "No modules need attention." : prefs.scope !== "all" ? "No modules match this filter." : "No modules yet."}</div>;
  return <div className={`un-ov-collection${cards ? " is-cards" : ""}`} aria-label={label}>
    <div className="un-ov-items" style={{gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: row}}>
      {modules.slice(start, start + count).map(module => <button key={module.id} className={`un-ov-module${row < 44 ? " is-condensed" : ""}`}
        style={moduleStyle(module.color)} onClick={() => open(module.id)} aria-label={`Open module ${module.code || module.name}`}
        title={`${module.code ? `${module.code} · ` : ""}${module.name}\n${module.caughtUp} of ${module.lectures} caught up · ${module.behind} behind · ${module.shaky} shaky`}>
        <span className="un-ov-module-copy">
          <strong><i className="un-ov-dot" />{module.code || module.name}</strong>
          {prefs.details && module.code && (cards || row >= 72) && <span className="un-ov-name">{module.name}</span>}
          {row >= 44 && <span className="un-ov-meta">{attention
            ? `${module.behind} behind · ${module.shaky} shaky`
            : module.lectures ? `${module.caughtUp}/${module.lectures} caught up${module.behind && width >= 220 ? ` · ${module.behind} behind` : ""}` : "No lectures yet"}</span>}
          {row >= 44 && <Meter value={module.percent} label={`${module.name} catch-up progress`} />}
          {cards && prefs.details && row >= 174 && module.next?.day && <span className="un-ov-meta">Next: {mediumDay(module.next.day)}</span>}
        </span>
        {!cards && !attention && width >= 250 && row >= 44 && <span className={`un-ov-number${module.behind ? " is-warning" : ""}`}>{module.percent === null ? "—" : `${Math.round(percent(module.percent) ?? 0)}%`}</span>}
      </button>)}
    </div>
    <Pager page={page} pages={pages} start={start} count={count} total={modules.length} label={label} narrow={width < 120} setPage={setPage} />
  </div>;
}

export function LectureCollection({hits, width, height, prefs, open, behind = false, label, onCatchUp, pending}: {
  hits: LectureHit[]; width: number; height: number; prefs: Preferences; open: (id: string) => void; behind?: boolean;
  label: string; onCatchUp?: (id: string) => void; pending?: string | null;
}) {
  const [requested, setPage] = useState(0);
  const row = Math.min(rowHeight(prefs, height), Math.max(24, height - (hits.length > 1 ? 28 : 0)));
  const {count, pages} = pageLayout(hits.length, height, row);
  const page = Math.min(requested, pages - 1), start = page * count;
  if (!hits.length) return <div className="un-ov-empty-note">{behind ? "All caught up. Nothing overdue." : "No teaching coming up in this selection."}</div>;
  return <div className="un-ov-collection" aria-label={label}>
    <div className="un-ov-items" style={{gridTemplateColumns: "minmax(0, 1fr)", gridAutoRows: row}}>
      {hits.slice(start, start + count).map(hit => <div className={`un-ov-lecture${row < 44 ? " is-condensed" : ""}`} key={hit.id} style={moduleStyle(hit.moduleColor)}>
        <button className="un-ov-lecture-open" onClick={() => open(hit.moduleId)} aria-label={`Open lecture ${hit.title}`}
          title={`${hit.moduleCode || hit.moduleName} · ${hit.title}\n${daysText(hit.days, behind)}${hit.day ? ` · ${mediumDay(hit.day)}` : ""}${hit.topics ? `\n${hit.topics}` : ""}`}>
          <strong><i className="un-ov-dot" />{hit.title}</strong>
          {row >= 44 && <span className="un-ov-meta">{hit.moduleCode || hit.moduleName} · {daysText(hit.days, behind)}</span>}
          {prefs.details && row >= 72 && <span className="un-ov-meta">{KINDS.find(kind => kind.id === hit.kind)?.label}{hit.week !== null ? ` · Week ${hit.week}` : ""}{hit.recorded ? " · Recorded" : ""}</span>}
        </button>
        {behind && onCatchUp && width >= 230 && row >= 44 && <button className="icon-btn un-ov-complete" aria-label={`Mark ${hit.title} caught up`}
          title="Mark caught up" disabled={!!pending} onClick={() => onCatchUp(hit.id)}><Check size={15} /></button>}
      </div>)}
    </div>
    <Pager page={page} pages={pages} start={start} count={count} total={hits.length} label={label} narrow={width < 120} setPage={setPage} />
  </div>;
}

export function TermCardView({term, modules, height, open}: {term: TermCard; modules: ModuleCard[]; height: number; open: () => void}) {
  const aggregate = totals(modules);
  return <button className={`un-ov-term${height >= 240 ? " is-roomy" : ""}`} onClick={open} title={`${term.name}\n${termStatus(term)} · ${mediumDay(term.startsOn)} – ${mediumDay(term.endsOn)}`}>
    <span className="un-ov-kicker"><CalendarDays size={14} />Teaching term</span>
    <strong className="un-ov-term-name">{term.name}</strong>
    <span className="un-ov-term-week">{termStatus(term)}</span>
    {term.week !== null && <Meter value={ratio(term.week, term.weeks)} label="Teaching weeks elapsed" />}
    {height >= 185 && <span className="un-ov-meta">{mediumDay(term.startsOn)} – {mediumDay(term.endsOn)}</span>}
    {height >= 220 && <span className="un-ov-meta">{modules.length} modules{aggregate.credits ? ` · ${aggregate.credits} credits` : ""}</span>}
    {height >= 270 && <span className="un-ov-link">Open modules <ArrowUpRight size={13} /></span>}
  </button>;
}

export function StudyProgress({modules, height, open}: {modules: ModuleCard[]; height: number; open: () => void}) {
  const counts = totals(modules);
  const rows = [{label: "Attended", value: counts.attended}, {label: "Caught up", value: counts.caughtUp}, {label: "Reviewed", value: counts.reviewed}];
  return <button className="un-ov-progress" onClick={open} title="Open module progress">
    <span className="un-ov-kicker"><GraduationCap size={14} />Study progress</span>
    {rows.map(row => <span className="un-ov-progress-row" key={row.label}><span><strong>{row.label}</strong><small>{row.value}/{counts.lectures}</small></span><Meter value={ratio(row.value, counts.lectures)} label={`${row.label} lectures`} /></span>)}
    {height >= 200 && <span className="un-ov-meta">{counts.lectures ? "Across the selected modules" : "Add lectures to start tracking progress"}</span>}
  </button>;
}

export function ComingWeek({hits, width, height, prefs, open}: {hits: LectureHit[]; width: number; height: number; prefs: Preferences; open: (id: string) => void}) {
  const first = today();
  const [selected, setSelected] = useState<string | null>(null);
  const days = Array.from({length: 7}, (_, index) => addDays(first, index));
  const day = selected && days.includes(selected) ? selected : hits.find(hit => hit.day && days.includes(hit.day))?.day ?? first;
  return <div className="un-ov-week">
    <div className="un-ov-days" role="group" aria-label="Upcoming teaching days">{days.map(date => {
      const count = hits.filter(hit => hit.day === date).length;
      return <button key={date} aria-pressed={day === date} aria-label={`${mediumDay(date)}, ${count} upcoming`} onClick={() => setSelected(date)}>
        <span>{mediumDay(date).split(" ")[0]}</span><strong>{Number(date.slice(-2))}</strong><small>{count || "—"}</small>
      </button>;
    })}</div>
    <div className="un-ov-subheading"><strong>{mediumDay(day)}</strong><span>{hits.filter(hit => hit.day === day).length} upcoming</span></div>
    <div className="un-ov-fill"><LectureCollection key={day} hits={hits.filter(hit => hit.day === day)} width={width} height={height - 106} prefs={prefs} open={open} label="day lectures" /></div>
  </div>;
}
