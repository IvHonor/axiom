import { useState } from "react";
import { Check, Pencil, Repeat, UserCheck, Video } from "lucide-react";
import { mediumDay, today } from "../daily_plan/time";
import { api, COLORS, CONFIDENCE, errorMessage, KINDS, lectureFields, type Confidence, type Lecture, type LectureHit, type Stage } from "./api";
import { uniChanged } from "./uniUi";

const NEXT_CONFIDENCE: Record<"none" | Confidence, Confidence | null> = { none: 1, 1: 2, 2: 3, 3: null };

/** One lecture: the big tick is "caught up"; attended and reviewed sit beside it. */
export function LectureRow({ lecture, hit, onEdit, onOpenModule, meta }: { lecture: Lecture; hit?: LectureHit; onEdit?: () => void; onOpenModule?: () => void; meta?: string }) {
  const [error, setError] = useState<string | null>(null);
  const run = (work: Promise<unknown>) =>
    work.then(
      () => {
        setError(null);
        uniChanged();
      },
      (e) => setError(errorMessage(e)),
    );
  const tick = (stage: Stage, done: boolean) => run(api.setStage(lecture.id, stage, done, today()));
  const cycleConfidence = () =>
    run(api.updateLecture(lecture.id, { ...lectureFields(lecture), confidence: NEXT_CONFIDENCE[lecture.confidence ?? "none"] }));

  const caughtUp = !!lecture.caughtUpOn;
  const kind = lecture.kind !== "lecture" ? KINDS.find((k) => k.id === lecture.kind)?.label : null;
  const when = [lecture.day ? mediumDay(lecture.day) : lecture.week ? `Week ${lecture.week}` : null, meta].filter(Boolean).join(" · ");

  return (
    <li className={`un-row${caughtUp ? " is-done" : ""}`}>
      <button
        className="un-tick"
        role="checkbox"
        aria-checked={caughtUp}
        aria-label={`Caught up on ${lecture.title}`}
        title={caughtUp ? `Caught up ${mediumDay(lecture.caughtUpOn!)}` : "Tick when you've gone through it"}
        onClick={() => tick("caught_up", !caughtUp)}
      >
        {caughtUp && <Check size={14} strokeWidth={2.5} />}
      </button>
      <div className="un-row-body">
        <span className="un-row-title">
          {hit && (
            <button className="un-module-tag" style={{ ["--module" as string]: COLORS[hit.moduleColor] }} onClick={onOpenModule} title={hit.moduleName}>
              {hit.moduleCode || hit.moduleName}
            </button>
          )}
          <button className="un-row-name" onClick={onEdit} disabled={!onEdit}>
            {lecture.title}
          </button>
          {kind && <span className="un-kind">{kind}</span>}
        </span>
        {(when || lecture.topics) && (
          <span className="un-row-meta dim">
            {when}
            {when && lecture.topics && " · "}
            {lecture.topics}
          </span>
        )}
        {error && <span className="rd-error">{error}</span>}
      </div>
      <span className="un-row-tools">
        {lecture.recorded && (
          <span className="un-recorded" title="There's a recording">
            <Video size={13} strokeWidth={1.75} />
          </span>
        )}
        <button
          className={`un-stage${lecture.attendedOn ? " is-on" : ""}`}
          aria-pressed={!!lecture.attendedOn}
          aria-label="Attended"
          title={lecture.attendedOn ? `Attended ${mediumDay(lecture.attendedOn)}` : "Attended"}
          onClick={() => tick("attended", !lecture.attendedOn)}
        >
          <UserCheck size={14} strokeWidth={1.75} />
        </button>
        <button
          className={`un-stage${lecture.reviewedOn ? " is-on" : ""}`}
          aria-pressed={!!lecture.reviewedOn}
          aria-label="Reviewed"
          title={lecture.reviewedOn ? `Reviewed ${mediumDay(lecture.reviewedOn)}` : "Reviewed: gone back over it since"}
          onClick={() => tick("reviewed", !lecture.reviewedOn)}
        >
          <Repeat size={14} strokeWidth={1.75} />
        </button>
        <button
          className={`un-confidence${lecture.confidence ? ` is-${lecture.confidence}` : ""}`}
          aria-label={`How well you get it: ${lecture.confidence ? CONFIDENCE[lecture.confidence] : "not set"}`}
          title={`${lecture.confidence ? CONFIDENCE[lecture.confidence] : "How well do you get it?"} (click to change)`}
          onClick={cycleConfidence}
        >
          <span />
        </button>
        {onEdit && (
          <button className="icon-btn" aria-label={`Edit ${lecture.title}`} onClick={onEdit}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        )}
      </span>
    </li>
  );
}
