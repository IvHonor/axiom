import { useEffect, useState } from "react";
import { Pause, Timer } from "lucide-react";
import { COLORS, type Color } from "./api";
import { openSource, stopTimer, useLearningUi } from "./learningUi";

/** "12:05" or "1:02:05" since `from`. */
function elapsed(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The running study timer, if there is one: what it's for, how long, and stop. */
export function TimerChip({ onOpen }: { onOpen?: () => void }) {
  const { timer } = useLearningUi();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timer) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [timer]);
  if (!timer) return null;
  return (
    <span className="ln-timer" role="timer" aria-live="off">
      <button
        className="ln-timer-what"
        title={`Studying ${timer.title}`}
        onClick={() => {
          openSource(timer.sourceId);
          onOpen?.();
        }}
      >
        <Timer size={13} strokeWidth={1.75} />
        <b>{elapsed(timer.startedAt, now)}</b>
        <span>{timer.title}</span>
      </button>
      <button
        className="icon-btn"
        aria-label="Stop and log the time"
        title="Stop and log the time"
        onClick={() => {
          stopTimer();
          onOpen?.();
        }}
      >
        <Pause size={13} strokeWidth={2} />
      </button>
    </span>
  );
}

/** A skill's colour, as a CSS custom property for its cards and bars. */
export const skillStyle = (color: Color) => ({ ["--skill" as string]: COLORS[color] });

/** A thin bar in the skill's colour. */
export function Bar({ percent, label }: { percent: number | null; label?: string }) {
  return (
    <span className="ln-bar" role="progressbar" aria-valuenow={Math.round(percent ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${percent ?? 0}%` }} />
    </span>
  );
}
