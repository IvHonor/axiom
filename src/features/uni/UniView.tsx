import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarRange, GraduationCap, LayoutGrid, Pencil, Plus } from "lucide-react";
import { mediumDay, today } from "../daily_plan/time";
import { Progress } from "../reading/Cover";
import { api, COLORS, daysText, type LectureHit, type ModuleCard, type TermCard } from "./api";
import { ModuleDialog, TermDialog } from "./Dialogs";
import { LectureRow } from "./LectureRow";
import { ModulePage } from "./ModulePage";
import { openModule, setUniUi, showPage, useUniUi, type UniPage } from "./uniUi";
import { useSummary } from "./useSummary";

/** University: a term's modules, what you're behind on, and what's coming up. */
export function UniView() {
  const ui = useUniUi();
  const { summary, error } = useSummary();
  const termId = ui.term && summary?.terms.some((t) => t.id === ui.term) ? ui.term : summary?.current ?? null;
  const term = summary?.terms.find((t) => t.id === termId) ?? null;
  const isCurrent = termId === summary?.current;

  // Another term's modules aren't in the summary.
  const [others, setOthers] = useState<ModuleCard[] | null>(null);
  useEffect(() => {
    setOthers(null);
    if (termId && !isCurrent) api.modules(termId, today()).then(setOthers, () => setOthers([]));
  }, [termId, isCurrent, ui.revision]);
  const modules = isCurrent ? summary?.modules : others;

  const tab = (id: UniPage, label: string, icon: React.ReactNode, n?: number, warn?: boolean) => (
    <button key={id} className={`pb-tab${ui.page === id && !ui.module ? " is-active" : ""}`} onClick={() => showPage(id)}>
      {icon}
      {label}
      {n !== undefined && n > 0 && <span className={warn ? "un-count-warn" : "rd-count"}>{n}</span>}
    </button>
  );
  const closeDialog = () => setUniUi({ dialog: null });
  const dialogModule = ui.dialog?.kind === "module" && ui.dialog.id ? [...(summary?.modules ?? []), ...(others ?? [])].find((m) => m.id === ui.dialog!.id) : null;

  return (
    <div className="rd-view un-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="University">
          {tab("modules", "Modules", <LayoutGrid size={14} strokeWidth={1.75} />)}
          {tab("behind", "Behind", <AlertTriangle size={14} strokeWidth={1.75} />, summary?.behind.length, true)}
          {tab("upcoming", "Coming up", <CalendarClock size={14} strokeWidth={1.75} />, summary?.upcoming.length)}
        </nav>
        {summary && summary.terms.length > 0 && (
          <span className="un-term-pick">
            <select aria-label="Term" value={termId ?? ""} onChange={(e) => setUniUi({ term: e.currentTarget.value, module: null, page: "modules" })}>
              {summary.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === summary.current ? " (now)" : ""}
                </option>
              ))}
            </select>
            {term && (
              <button className="icon-btn" aria-label="Edit term" title="Edit term" onClick={() => setUniUi({ dialog: { kind: "term", id: term.id } })}>
                <Pencil size={13} strokeWidth={1.75} />
              </button>
            )}
            <button className="icon-btn" aria-label="New term" title="New term" onClick={() => setUniUi({ dialog: { kind: "term", id: null } })}>
              <CalendarRange size={14} strokeWidth={1.75} />
            </button>
          </span>
        )}
        {term && (
          <button className="btn btn-sm" onClick={() => setUniUi({ dialog: { kind: "module", id: null } })}>
            <Plus size={14} strokeWidth={1.75} /> Module
          </button>
        )}
      </header>
      {error && <p className="rd-error rd-pad">{error}</p>}

      <div className="rd-content">
        {!summary ? (
          <p className="dim rd-pad">Loading…</p>
        ) : !term ? (
          <Welcome />
        ) : ui.module ? (
          <ModulePage id={ui.module} />
        ) : ui.page === "behind" ? (
          <HitList term={summary.terms.find((t) => t.id === summary.current)!} hits={summary.behind} behind />
        ) : ui.page === "upcoming" ? (
          <HitList term={summary.terms.find((t) => t.id === summary.current)!} hits={summary.upcoming} />
        ) : (
          <Modules term={term} modules={modules ?? null} />
        )}
      </div>

      {ui.dialog?.kind === "term" && <TermDialog term={summary?.terms.find((t) => t.id === (ui.dialog as { id: string | null }).id) ?? null} onClose={closeDialog} />}
      {ui.dialog?.kind === "module" && term && summary && (ui.dialog.id === null || dialogModule) && (
        <ModuleDialog module={dialogModule ?? null} terms={summary.terms} termId={term.id} onClose={closeDialog} />
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="rd-empty un-welcome">
      <GraduationCap size={32} strokeWidth={1.25} />
      <h2>Track your lectures, module by module</h2>
      <p className="dim">
        Start with the term you're in: when it starts and how many teaching weeks it has. Then add your modules, put in their lectures from your timetable, and tick each one off once
        you've gone through it. Anything you miss shows up under Behind.
      </p>
      <button className="btn" onClick={() => setUniUi({ dialog: { kind: "term", id: null } })}>
        <CalendarRange size={14} strokeWidth={1.75} /> Set up your term
      </button>
    </div>
  );
}

function termStatus(term: TermCard): string {
  const now = today();
  if (term.week !== null) return `Week ${term.week} of ${term.weeks}`;
  return now < term.startsOn ? `Starts ${mediumDay(term.startsOn)}` : `Ended ${mediumDay(term.endsOn)}`;
}

function Modules({ term, modules }: { term: TermCard; modules: ModuleCard[] | null }) {
  if (!modules) return <p className="dim rd-pad">Loading…</p>;
  return (
    <div className="un-modules">
      <div className="un-term-line">
        <h2>{term.name}</h2>
        <span className="dim">{termStatus(term)}</span>
        {term.week !== null && <Progress percent={(term.week / term.weeks) * 100} label="Through the term" />}
      </div>
      {modules.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">No modules in {term.name} yet.</p>
          <button className="btn" onClick={() => setUniUi({ dialog: { kind: "module", id: null } })}>
            <Plus size={14} strokeWidth={1.75} /> Add a module
          </button>
        </div>
      ) : (
        <ul className="un-grid">
          {modules.map((m) => (
            <li key={m.id}>
              <button className="un-card" style={{ ["--module" as string]: COLORS[m.color] }} onClick={() => openModule(m.id)}>
                <span className="un-card-code">{m.code || " "}</span>
                <span className="un-card-name">{m.name}</span>
                <Progress percent={m.percent} label={`${m.name} progress`} />
                <span className="un-card-meta">
                  {m.lectures === 0 ? (
                    <span className="dim">No lectures yet</span>
                  ) : (
                    <span>
                      {m.caughtUp} of {m.lectures} caught up
                    </span>
                  )}
                  {m.behind > 0 && <span className="un-behind-text">{m.behind} behind</span>}
                </span>
                {m.next?.day && (
                  <span className="un-card-next dim">
                    Next: {m.next.title} · {m.next.day === today() ? "today" : mediumDay(m.next.day)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HitList({ term, hits, behind }: { term: TermCard; hits: LectureHit[]; behind?: boolean }) {
  return (
    <div className="un-hits">
      <div className="un-term-line">
        <h2>{behind ? "Behind" : "Coming up"}</h2>
        <span className="dim">{behind ? `Been and gone in ${term.name} without catching up, longest first` : "The next seven days"}</span>
      </div>
      {hits.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">{behind ? "You're all caught up. Nice." : "Nothing on in the next week that you haven't caught up on."}</p>
        </div>
      ) : (
        <ul className="un-list">
          {hits.map((h) => (
            <LectureRow key={h.id} lecture={h} hit={h} meta={daysText(h.days, !!behind)} onOpenModule={() => openModule(h.moduleId)} />
          ))}
        </ul>
      )}
    </div>
  );
}
