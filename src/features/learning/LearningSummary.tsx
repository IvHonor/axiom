import { Brain, Flame, Repeat } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { minutesText } from "./api";
import { openSource, setLearningUi, showPage } from "./learningUi";
import { Bar, skillStyle } from "./parts";
import { useSummary } from "./useSummary";

/** The overview tile: today's study and streak, then what you're working through. */
export function LearningSummary({ onOpen }: { onOpen: () => void }) {
  const { height, width } = useTileLayout();
  const { summary, error } = useSummary(height > 0);
  const go = (work: () => void) => {
    work();
    onOpen();
  };
  if (!summary) return <button className="ln-tile-status" onClick={onOpen}>{error ? "Learning unavailable. Open Learning" : "Loading learning…"}</button>;
  const skills = summary.skills.filter((s) => !s.archived);
  if (skills.length === 0) {
    return (
      <button className="ln-tile-empty" onClick={() => go(() => setLearningUi({ source: null, dialog: { kind: "skill", id: null } }))}>
        <Brain size={26} strokeWidth={1.25} />
        <b>What are you learning?</b>
        {height > 140 && <span className="dim">Track textbooks, courses and playlists, chapter by chapter.</span>}
      </button>
    );
  }
  // What's under way first: started but not finished, most recently studied.
  const sources = skills
    .flatMap((s) => s.sources.map((src) => ({ ...src, skill: s })))
    .filter((s) => !s.finishedOn && s.tally.total > 0)
    .sort((a, b) => (b.lastStudied ?? "").localeCompare(a.lastStudied ?? "") || (b.tally.percent ?? 0) - (a.tally.percent ?? 0));
  const fits = Math.max(0, Math.floor((height - 64) / 44));
  return (
    <div className="ln-tile">
      <div className="ln-tile-stats">
        <button onClick={() => go(() => showPage("activity"))} title="Studied today">
          <b>{minutesText(summary.todayMinutes)}</b>
          <small>Today</small>
        </button>
        <button onClick={() => go(() => showPage("activity"))} title="Days in a row">
          <b>
            {summary.streak > 1 && <Flame size={13} strokeWidth={1.75} />}
            {summary.streak}
          </b>
          <small>Streak</small>
        </button>
        {width >= 200 && (
          <button className={summary.reviews.length ? "is-due" : undefined} onClick={() => go(() => showPage("review"))} title="Due for review">
            <b>
              <Repeat size={13} strokeWidth={1.75} />
              {summary.reviews.length}
            </b>
            <small>Review</small>
          </button>
        )}
      </div>
      <ul className="ln-tile-list">
        {sources.slice(0, fits).map((s) => (
          <li key={s.id}>
            <button style={skillStyle(s.skill.color)} onClick={() => go(() => openSource(s.id))} title={s.title}>
              <span className="ln-tile-name">
                <span aria-hidden="true">{s.skill.icon}</span>
                <span>{s.title}</span>
                <b>{s.tally.percent === null ? "" : `${Math.round(s.tally.percent)}%`}</b>
              </span>
              <Bar percent={s.tally.percent} label={`${s.title} progress`} />
            </button>
          </li>
        ))}
        {sources.length === 0 && fits > 0 && <li className="dim ln-tile-none">Nothing under way. Add chapters to a source to start.</li>}
      </ul>
    </div>
  );
}
