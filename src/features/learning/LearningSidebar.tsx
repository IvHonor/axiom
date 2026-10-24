import { Activity, Flame, Layers, Repeat } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { minutesText } from "./api";
import { openSource, setLearningUi, showPage, useLearningUi, type LearningPage } from "./learningUi";
import { Bar, skillStyle, TimerChip } from "./parts";
import { useSummary } from "./useSummary";

/** Learning's side panel: today's study, the pages, and each skill's sources. */
export function LearningSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useLearningUi();
  const { summary } = useSummary();
  const go = (page: LearningPage) => {
    showPage(page);
    onOpen();
  };
  const navItem = (id: LearningPage, label: string, icon: React.ReactNode, count?: number) => (
    <button key={id} className={`nav-item${active && ui.page === id && !ui.source ? " is-active" : ""}`} onClick={() => go(id)}>
      {icon}
      <span className="bs-name">{label}</span>
      {count !== undefined && count > 0 && <span className="rd-count">{count}</span>}
    </button>
  );
  const skills = summary?.skills.filter((s) => !s.archived) ?? [];

  return (
    <>
      <Section title="Learning">
        {summary && (
          <div className="ls-today">
            <span>
              <b>{minutesText(summary.todayMinutes)}</b> today
            </span>
            {summary.streak > 0 && (
              <span className="ls-streak" title={`${summary.streak} days in a row`}>
                <Flame size={13} strokeWidth={1.75} /> {summary.streak}
              </span>
            )}
          </div>
        )}
        <TimerChip onOpen={onOpen} />
        {navItem("skills", "Skills", <Layers size={14} strokeWidth={1.5} />)}
        {navItem("review", "Review", <Repeat size={14} strokeWidth={1.5} />, summary?.reviews.length)}
        {navItem("activity", "Activity", <Activity size={14} strokeWidth={1.5} />)}
      </Section>

      {skills.map((s) => (
        <Section key={s.id} title={`${s.icon} ${s.name}`} count={s.sources.length}>
          <div className="us-modules">
            {s.sources.map((src) => (
              <button
                key={src.id}
                className={`us-module${active && ui.source === src.id ? " is-active" : ""}`}
                style={skillStyle(s.color)}
                onClick={() => {
                  openSource(src.id);
                  onOpen();
                }}
              >
                <span className="us-module-name">
                  {src.title}
                  {src.tally.reviews > 0 && <span className="rd-count">{src.tally.reviews}</span>}
                </span>
                <Bar percent={src.tally.percent} label={`${src.title} progress`} />
              </button>
            ))}
            {s.sources.length === 0 && (
              <button
                className="rd-link"
                onClick={() => {
                  setLearningUi({ source: null, dialog: { kind: "source", id: null, skillId: s.id } });
                  onOpen();
                }}
              >
                Add a source
              </button>
            )}
          </div>
        </Section>
      ))}
    </>
  );
}
