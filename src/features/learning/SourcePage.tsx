import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Check, ExternalLink, ListPlus, Pencil, Play, Plus, Repeat, RotateCcw, StickyNote, Timer, Trash2, X } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { mediumDay, today } from "../daily_plan/time";
import { Cover } from "../reading/Cover";
import { api, errorMessage, headings, kindOf, minutesText, plural, reviewText, type SourceDetail, type Unit } from "./api";
import { UnitDialog } from "./Dialogs";
import { learningChanged, setLearningUi, startTimer, stopTimer, useLearningUi } from "./learningUi";
import { Bar, skillStyle } from "./parts";

/** One source: its chapters (or lectures, or videos) to tick off, and time spent. */
export function SourcePage({ id }: { id: string }) {
  const ui = useLearningUi();
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Unit | null>(null);

  const load = useCallback(() => {
    api.source(id, today()).then(
      (d) => {
        setDetail(d);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [id]);
  useEffect(load, [load, ui.revision]);
  useDataChanged(load);

  if (error) {
    return (
      <div className="rd-empty">
        <p className="rd-error">{error}</p>
        <button className="btn btn-sm" onClick={() => setLearningUi({ source: null })}>
          Back to skills
        </button>
      </div>
    );
  }
  if (!detail) return <p className="dim rd-pad">Loading…</p>;

  const { card, skill, units, sessions } = detail;
  const unit = card.unitName || kindOf(card.kind).unit;
  const timing = ui.timer?.sourceId === card.id;
  const heading = headings(units);
  const now = today();
  const pace =
    card.tally.total > card.tally.done
      ? [card.expected && `At your pace, done by ${mediumDay(card.expected)}`, card.finishBy && card.neededPerWeek !== null && `${card.neededPerWeek.toFixed(1)} a week to finish by ${mediumDay(card.finishBy)}`]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="ln-source" style={skillStyle(skill.color)}>
      <button className="rd-link ln-back" onClick={() => setLearningUi({ source: null })}>
        <ArrowLeft size={13} strokeWidth={1.75} /> {skill.icon} {skill.name}
      </button>
      <header className="ln-source-head">
        {card.kind === "book" ? <Cover url={card.coverUrl} title={card.title} size="md" /> : <span className="ln-kind-badge">{kindOf(card.kind).emoji}</span>}
        <div className="ln-source-text">
          <h2>{card.title}</h2>
          {card.author && <span className="dim">{card.author}</span>}
          <div className="ln-progress-line">
            <Bar percent={card.tally.percent} label={`${card.title} progress`} />
            <span>
              {card.tally.total === 0 ? (
                <span className="dim">No {plural(unit, 2)} yet</span>
              ) : (
                <>
                  <b>{card.tally.done}</b> of {card.tally.total} {plural(unit, card.tally.total)}
                  {card.tally.percent !== null && <span className="dim"> · {Math.round(card.tally.percent)}%</span>}
                </>
              )}
            </span>
          </div>
          <span className="dim ln-meta">
            {[
              card.finishedOn && `Finished ${mediumDay(card.finishedOn)} 🎉`,
              card.tally.totalMinutes > 0 && `${minutesText(card.tally.totalMinutes)} studied`,
              card.tally.weekMinutes > 0 && `${minutesText(card.tally.weekMinutes)} this week`,
              pace,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="ln-source-tools">
          {timing ? (
            <button className="btn btn-sm" onClick={stopTimer}>
              <Timer size={14} strokeWidth={1.75} /> Stop and log
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => startTimer(card.id, card.title)} disabled={!!ui.timer} title={ui.timer ? "Another timer's running" : undefined}>
              <Play size={14} strokeWidth={1.75} /> Start studying
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "session", sourceId: card.id } })}>
            <Plus size={14} strokeWidth={1.75} /> Log time
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "units", sourceId: card.id } })}>
            <ListPlus size={14} strokeWidth={1.75} /> Add {plural(unit, 2)}
          </button>
          {card.link && (
            <button className="icon-btn" aria-label="Open the link" title={card.link} onClick={() => void openUrl(card.link!)}>
              <ExternalLink size={14} strokeWidth={1.75} />
            </button>
          )}
          <button className="icon-btn" aria-label="Edit source" title="Edit" onClick={() => setLearningUi({ dialog: { kind: "source", id: card.id } })}>
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {units.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">
            Add its {plural(unit, 2)} to tick them off as you go: type them, paste the contents, read them from the book file{card.kind === "video" ? ", or import the playlist" : ""}.
          </p>
          <button className="btn" onClick={() => setLearningUi({ dialog: { kind: "units", sourceId: card.id } })}>
            <ListPlus size={14} strokeWidth={1.75} /> Add {plural(unit, 2)}
          </button>
        </div>
      ) : (
        <ol className="ln-units">
          {units.map((u, i) => (heading[i] ? <HeadingRow key={u.id} unit={u} /> : <UnitRow key={u.id} unit={u} unitName={unit} now={now} onEdit={() => setEditing(u)} />))}
        </ol>
      )}

      {sessions.length > 0 && (
        <section className="ln-sessions">
          <h3>Time spent</h3>
          <ul>
            {sessions.slice(0, 30).map((s) => (
              <li key={s.id}>
                <span className="ln-session-day">{mediumDay(s.day)}</span>
                <b>{minutesText(s.minutes)}</b>
                <span className="dim ln-fill">{s.note}</span>
                <button className="icon-btn" aria-label="Delete this session" onClick={() => void api.deleteSession(s.id).then(learningChanged)}>
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && <UnitDialog unit={editing} unitName={unit} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HeadingRow({ unit }: { unit: Unit }) {
  return (
    <li className="ln-heading" style={{ paddingLeft: 12 + unit.level * 20 }}>
      {unit.title}
    </li>
  );
}

/** One chapter: tick it off, ask to review it later, note what you learned. */
export function UnitRow({ unit, unitName, now, onEdit, context }: { unit: Unit; unitName: string; now: string; onEdit?: () => void; context?: string }) {
  const [error, setError] = useState<string | null>(null);
  const run = (work: Promise<unknown>) =>
    work.then(
      () => {
        setError(null);
        learningChanged();
      },
      (e) => setError(errorMessage(e)),
    );
  const done = !!unit.doneOn;
  const due = !!unit.reviewOn && unit.reviewOn <= now;
  const review = reviewText(unit, now);
  const meta = [context, unit.minutes && minutesText(unit.minutes), unit.page && `p. ${unit.page}`, done && `done ${mediumDay(unit.doneOn!)}`, review].filter(Boolean).join(" · ");

  return (
    <li className={`ln-unit${done ? " is-done" : ""}${due ? " is-due" : ""}`} style={{ paddingLeft: 8 + unit.level * 20 }}>
      <button
        className="un-tick"
        role="checkbox"
        aria-checked={done}
        aria-label={`Done: ${unit.title}`}
        title={done ? `Done ${mediumDay(unit.doneOn!)}` : `Tick when you've finished this ${unitName}`}
        onClick={() => run(api.setDone(unit.id, !done, today()))}
      >
        {done && <Check size={14} strokeWidth={2.5} />}
      </button>
      <div className="ln-unit-body">
        <button className="ln-unit-name" onClick={onEdit} disabled={!onEdit}>
          {unit.title}
          {unit.notes && <StickyNote size={12} strokeWidth={1.75} className="ln-has-notes" aria-label="Has notes" />}
        </button>
        {meta && <span className="dim ln-unit-meta">{meta}</span>}
        {error && <span className="rd-error">{error}</span>}
      </div>
      <span className="ln-unit-tools">
        {due ? (
          <>
            <button className="btn btn-sm" onClick={() => run(api.review(unit.id, "reviewed", today()))} title="You've gone back over it: the next review moves further out">
              <Repeat size={13} strokeWidth={1.75} /> Reviewed
            </button>
            <button className="icon-btn" aria-label="Stop reviewing" title="Stop reviewing this" onClick={() => run(api.review(unit.id, "clear", today()))}>
              <X size={13} strokeWidth={1.75} />
            </button>
          </>
        ) : unit.reviewOn ? (
          <button className="icon-btn is-on" aria-label="Stop reviewing" title={`${review}. Click to stop reviewing`} onClick={() => run(api.review(unit.id, "clear", today()))}>
            <RotateCcw size={13} strokeWidth={1.75} />
          </button>
        ) : (
          <button className="icon-btn" aria-label="Review later" title="Review later: it comes back in 3 days, then a week, then a month" onClick={() => run(api.review(unit.id, "later", today()))}>
            <RotateCcw size={13} strokeWidth={1.75} />
          </button>
        )}
        {onEdit && (
          <button className="icon-btn" aria-label={`Edit ${unit.title}`} onClick={onEdit}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        )}
      </span>
    </li>
  );
}
