import { useState } from "react";
import { Activity, Archive, Brain, Flame, Layers, Pencil, Plus, Repeat, Sparkles } from "lucide-react";
import { mediumDay, today } from "../daily_plan/time";
import { Cover } from "../reading/Cover";
import { api, kindOf, minutesText, plural, type LearningSummary, type SkillCard, type SourceCard } from "./api";
import { SessionDialog, SkillDialog, SourceDialog, UnitsDialog } from "./Dialogs";
import { learningChanged, openSource, setLearningUi, showPage, useLearningUi, type LearningPage } from "./learningUi";
import { Bar, skillStyle, TimerChip } from "./parts";
import { SourcePage, UnitRow } from "./SourcePage";
import { useSummary } from "./useSummary";

/** Learning: your skills and what you learn them from, what's due for review, and time spent. */
export function LearningView() {
  const ui = useLearningUi();
  const { summary, error } = useSummary();
  const tab = (id: LearningPage, label: string, icon: React.ReactNode, n?: number) => (
    <button key={id} className={`pb-tab${ui.page === id && !ui.source ? " is-active" : ""}`} onClick={() => showPage(id)}>
      {icon}
      {label}
      {n !== undefined && n > 0 && <span className="rd-count">{n}</span>}
    </button>
  );
  const close = () => setLearningUi({ dialog: null });
  const skills = summary?.skills ?? [];
  const sources = skills.flatMap((s) => s.sources);
  const dialog = ui.dialog;

  return (
    <div className="rd-view ln-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Learning">
          {tab("skills", "Skills", <Layers size={14} strokeWidth={1.75} />)}
          {tab("review", "Review", <Repeat size={14} strokeWidth={1.75} />, summary?.reviews.length)}
          {tab("activity", "Activity", <Activity size={14} strokeWidth={1.75} />)}
        </nav>
        <span className="rd-fill" />
        <TimerChip />
        {skills.length > 0 && (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "session", sourceId: null } })}>
              <Plus size={14} strokeWidth={1.75} /> Log time
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "source", id: null } })}>
              <Plus size={14} strokeWidth={1.75} /> Source
            </button>
          </>
        )}
        <button className="btn btn-sm" onClick={() => setLearningUi({ dialog: { kind: "skill", id: null } })}>
          <Plus size={14} strokeWidth={1.75} /> Skill
        </button>
      </header>
      {error && <p className="rd-error rd-pad">{error}</p>}

      <div className="rd-content">
        {!summary ? (
          <p className="dim rd-pad">Loading…</p>
        ) : ui.source ? (
          <SourcePage id={ui.source} />
        ) : skills.length === 0 ? (
          <Welcome />
        ) : ui.page === "review" ? (
          <Review summary={summary} />
        ) : ui.page === "activity" ? (
          <ActivityPage summary={summary} />
        ) : (
          <Skills skills={skills} />
        )}
      </div>

      {dialog?.kind === "skill" && <SkillDialog skill={skills.find((s) => s.id === dialog.id) ?? null} onClose={close} />}
      {dialog?.kind === "source" && summary && (dialog.id === null || sources.some((s) => s.id === dialog.id)) && (
        <SourceDialog source={sources.find((s) => s.id === dialog.id) ?? null} skills={skills} skillId={dialog.skillId} onClose={close} />
      )}
      {dialog?.kind === "units" && <UnitsHost sourceId={dialog.sourceId} sources={sources} onClose={close} />}
      {dialog?.kind === "session" && summary && <SessionDialog sourceId={dialog.sourceId} minutes={dialog.minutes} skills={skills} onClose={close} />}
    </div>
  );
}

/** The units dialog needs its source; a brand-new one isn't in the summary yet. */
function UnitsHost({ sourceId, sources, onClose }: { sourceId: string; sources: SourceCard[]; onClose: () => void }) {
  const card = sources.find((s) => s.id === sourceId);
  if (!card) return null;
  return <UnitsDialog source={card} existing={card.tally.total} onClose={onClose} />;
}

function Welcome() {
  return (
    <div className="rd-empty un-welcome ln-welcome">
      <Brain size={32} strokeWidth={1.25} />
      <h2>Track what you're learning</h2>
      <p className="dim">
        Start with a skill, like Rust, Spanish or statistics. Then add what you're learning it from: a textbook, a Udemy or Coursera course, a YouTube playlist. Its chapters or lessons come
        from the book file, a pasted contents list or the playlist, so you can tick them off, mark ones to review, and see when you'll be done.
      </p>
      <button className="btn" onClick={() => setLearningUi({ dialog: { kind: "skill", id: null } })}>
        <Sparkles size={14} strokeWidth={1.75} /> Add your first skill
      </button>
    </div>
  );
}

function Skills({ skills }: { skills: SkillCard[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const active = skills.filter((s) => !s.archived);
  const archived = skills.filter((s) => s.archived);
  return (
    <div className="ln-skills">
      {active.map((s) => (
        <SkillBlock key={s.id} skill={s} />
      ))}
      {archived.length > 0 && (
        <>
          <button className="rd-link ln-archived-toggle" onClick={() => setShowArchived((v) => !v)}>
            <Archive size={13} strokeWidth={1.75} /> {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && archived.map((s) => <SkillBlock key={s.id} skill={s} />)}
        </>
      )}
    </div>
  );
}

function SkillBlock({ skill }: { skill: SkillCard }) {
  return (
    <section className={`ln-skill${skill.archived ? " is-archived" : ""}`} style={skillStyle(skill.color)}>
      <header className="ln-skill-head">
        <span className="ln-skill-icon" aria-hidden="true">
          {skill.icon}
        </span>
        <h2>{skill.name}</h2>
        <span className="dim ln-skill-meta">
          {[
            skill.tally.total > 0 && `${skill.tally.done} of ${skill.tally.total} done`,
            skill.tally.weekMinutes > 0 && `${minutesText(skill.tally.weekMinutes)} this week`,
            skill.tally.reviews > 0 && `${skill.tally.reviews} to review`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="rd-fill" />
        <button className="icon-btn" aria-label={`Edit ${skill.name}`} onClick={() => setLearningUi({ dialog: { kind: "skill", id: skill.id } })}>
          <Pencil size={13} strokeWidth={1.75} />
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "source", id: null, skillId: skill.id } })}>
          <Plus size={13} strokeWidth={1.75} /> Source
        </button>
      </header>
      {skill.why && <p className="dim ln-why">{skill.why}</p>}
      {skill.sources.length === 0 ? (
        <p className="dim ln-none">Nothing to learn it from yet. Add a book, course or playlist.</p>
      ) : (
        <ul className="un-grid">
          {skill.sources.map((s) => (
            <li key={s.id}>
              <SourceTile source={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceTile({ source }: { source: SourceCard }) {
  const unit = source.unitName || kindOf(source.kind).unit;
  return (
    <button className={`un-card ln-card${source.finishedOn ? " is-finished" : ""}`} onClick={() => openSource(source.id)}>
      <span className="ln-card-top">
        {source.kind === "book" ? <Cover url={source.coverUrl} title={source.title} size="sm" /> : <span className="ln-kind-badge is-small">{kindOf(source.kind).emoji}</span>}
        <span className="ln-card-text">
          <span className="un-card-name">{source.title}</span>
          {source.author && <span className="dim ln-card-author">{source.author}</span>}
        </span>
      </span>
      <Bar percent={source.tally.percent} label={`${source.title} progress`} />
      <span className="un-card-meta">
        {source.tally.total === 0 ? (
          <span className="dim">No {plural(unit, 2)} yet</span>
        ) : source.finishedOn ? (
          <span>Finished 🎉</span>
        ) : (
          <span>
            {source.tally.done} of {source.tally.total} {plural(unit, source.tally.total)}
          </span>
        )}
        {source.tally.reviews > 0 && <span className="ln-due-text">{source.tally.reviews} to review</span>}
      </span>
      {!source.finishedOn && source.next && <span className="un-card-next dim">Next: {source.next}</span>}
      {!source.finishedOn && source.expected && <span className="un-card-next dim">Done by {mediumDay(source.expected)} at your pace</span>}
    </button>
  );
}

function Review({ summary }: { summary: LearningSummary }) {
  const now = today();
  return (
    <div className="un-hits">
      <div className="un-term-line">
        <h2>Due for review</h2>
        <span className="dim">Ask for a review on any chapter with ↺: it comes back in 3 days, then a week, then a month.</span>
      </div>
      {summary.reviews.length === 0 ? (
        <div className="rd-empty">
          <p className="dim">Nothing due today.</p>
        </div>
      ) : (
        <ol className="ln-units">
          {summary.reviews.map((r) => (
            <UnitRow key={r.id} unit={{ ...r, level: 0 }} unitName="chapter" now={now} context={`${r.skillIcon} ${r.sourceTitle}`} onEdit={() => openSource(r.sourceId)} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ActivityPage({ summary }: { summary: LearningSummary }) {
  const most = Math.max(30, ...summary.days.map((d) => d.minutes));
  return (
    <div className="un-hits">
      <div className="ln-stats">
        <Stat value={minutesText(summary.todayMinutes)} label="Today" />
        <Stat value={minutesText(summary.weekMinutes)} label="Last 7 days" />
        <Stat value={String(summary.weekUnits)} label="Done this week" />
        <Stat value={`${summary.streak}`} label={summary.streak === 1 ? "Day streak" : "Day streak"} icon={summary.streak > 1 ? <Flame size={14} strokeWidth={1.75} /> : undefined} />
      </div>
      <section className="ln-chart" aria-label="Minutes studied, last 14 days">
        {summary.days.map((d) => (
          <span key={d.day} className="ln-chart-day" title={`${mediumDay(d.day)}: ${minutesText(d.minutes)}${d.units ? `, ${d.units} done` : ""}`}>
            <span className="ln-chart-bar" style={{ height: `${(d.minutes / most) * 100}%` }} />
            <span className="ln-chart-label">{new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </span>
        ))}
      </section>
      <div className="un-term-line">
        <h2>Recent sessions</h2>
        <button className="btn btn-sm btn-ghost" onClick={() => setLearningUi({ dialog: { kind: "session", sourceId: null } })}>
          <Plus size={13} strokeWidth={1.75} /> Log time
        </button>
      </div>
      {summary.recent.length === 0 ? (
        <p className="dim">No time logged yet. Start the timer on a source, or log a session.</p>
      ) : (
        <ul className="ln-sessions-list">
          {summary.recent.map((s) => (
            <li key={s.id}>
              <span className="ln-session-day">{mediumDay(s.day)}</span>
              <b>{minutesText(s.minutes)}</b>
              <button className="rd-link ln-fill ln-session-what" onClick={() => openSource(s.sourceId)}>
                {s.skillIcon} {s.sourceTitle}
                {s.note && <span className="dim"> · {s.note}</span>}
              </button>
              <button className="icon-btn" aria-label="Delete this session" onClick={() => void api.deleteSession(s.id).then(learningChanged)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="ln-stat">
      <b>
        {icon}
        {value}
      </b>
      <span className="dim">{label}</span>
    </div>
  );
}
