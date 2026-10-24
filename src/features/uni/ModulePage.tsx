import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, CalendarPlus, ExternalLink, Pencil, Plus } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { addDays, mondayOf, today } from "../daily_plan/time";
import { Progress } from "../reading/Cover";
import { api, COLORS, errorMessage, type Lecture, type ModuleDetail } from "./api";
import { LectureDialog, ScheduleDialog } from "./Dialogs";
import { LectureRow } from "./LectureRow";
import { setUniUi, useUniUi } from "./uniUi";

type Editing = { kind: "schedule" } | { kind: "lecture"; lecture: Lecture | null } | null;

/** "5–11 Oct". */
function weekRange(monday: string): string {
  const day = (d: string, month: boolean) => new Date(`${d}T12:00`).toLocaleDateString("en-GB", month ? { day: "numeric", month: "short" } : { day: "numeric" });
  const sunday = addDays(monday, 6);
  return `${day(monday, monday.slice(5, 7) !== sunday.slice(5, 7))}–${day(sunday, true)}`;
}

/** A module's page: its progress and every lecture, week by week. */
export function ModulePage({ id }: { id: string }) {
  const { revision } = useUniUi();
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(() => {
    api.module(id, today()).then(
      (d) => {
        setDetail(d);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [id]);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  const back = () => setUniUi({ module: null });
  if (!detail) {
    return <div className="rd-pad">{error ? <p className="rd-error">{error}</p> : <p className="dim">Loading…</p>}</div>;
  }
  const { card, term, lectures } = detail;

  // Week 1's Monday, for the dates beside each week.
  const start = mondayOf(term.startsOn);
  const weeks = new Map<number | null, Lecture[]>();
  for (const l of lectures) weeks.set(l.week, [...(weeks.get(l.week) ?? []), l]);

  return (
    <div className="un-module" style={{ ["--module" as string]: COLORS[card.color] }}>
      <div className="un-back">
        <button className="btn btn-sm btn-ghost" onClick={back}>
          <ArrowLeft size={14} strokeWidth={1.75} /> Modules
        </button>
        <span className="rd-fill" />
        {card.link && (
          <button className="btn btn-sm btn-ghost" onClick={() => void openUrl(card.link!)}>
            <ExternalLink size={14} strokeWidth={1.75} /> Module page
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setUniUi({ dialog: { kind: "module", id: card.id } })}>
          <Pencil size={14} strokeWidth={1.75} /> Edit
        </button>
      </div>

      <header className="un-module-head">
        <div>
          {card.code && <div className="un-code-label">{card.code}</div>}
          <h1>{card.name}</h1>
          <div className="dim un-small">
            {term.name}
            {card.credits !== null && ` · ${card.credits} credits`}
          </div>
        </div>
        <div className="un-module-stats">
          <Progress percent={card.percent} label={`${card.name} progress`} />
          <span>
            <b>{card.caughtUp}</b> of {card.lectures} caught up
          </span>
          <span className="dim un-small">
            {card.attended} attended · {card.reviewed} reviewed
            {card.behind > 0 && <span className="un-behind-text"> · {card.behind} behind</span>}
            {card.shaky > 0 && ` · ${card.shaky} shaky`}
          </span>
        </div>
      </header>

      <div className="un-module-actions">
        <button className="btn btn-sm" onClick={() => setEditing({ kind: "schedule" })}>
          <CalendarPlus size={14} strokeWidth={1.75} /> Add from timetable
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ kind: "lecture", lecture: null })}>
          <Plus size={14} strokeWidth={1.75} /> Add one
        </button>
        <span className="rd-fill" />
        <span className="dim un-small un-legend">Tick when you've gone through it · attended · reviewed · how well you get it</span>
      </div>

      {lectures.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">No lectures yet. Add them from your timetable, say every Tuesday from week 1 to {term.weeks}, and tick them off as you go.</p>
        </div>
      ) : (
        <div className="un-weeks">
          {[...weeks.entries()].map(([week, list]) => (
            <section key={week ?? "none"} className={`un-week${week !== null && week === term.week ? " is-now" : ""}`}>
              <h2 className="rd-heading">
                {week === null ? "No week" : `Week ${week}`}
                {week !== null && <span className="dim un-week-dates">{weekRange(addDays(start, (week - 1) * 7))}</span>}
                {week !== null && week === term.week && <span className="un-now">This week</span>}
              </h2>
              <ul className="un-list">
                {list.map((l) => (
                  <LectureRow key={l.id} lecture={l} onEdit={() => setEditing({ kind: "lecture", lecture: l })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing?.kind === "schedule" && <ScheduleDialog moduleId={card.id} term={term} onClose={() => setEditing(null)} />}
      {editing?.kind === "lecture" && <LectureDialog lecture={editing.lecture} moduleId={card.id} term={term} onClose={() => setEditing(null)} />}
    </div>
  );
}
