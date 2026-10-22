import { useCallback, useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, progressText, type ReadingSummary as Summary } from "./api";
import { Cover, Progress } from "./Cover";
import { setReadingUi, useReadingUi } from "./readingUi";

/** The overview tile: books on the go, the year's goal and the streak. */
export function ReadingSummary({ onOpen }: { onOpen: () => void }) {
  const { revision } = useReadingUi();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.summary(today()).then(setSummary, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load, revision]);
  useDataChanged(load);

  if (error) return <p className="dim">{error}</p>;
  if (!summary) return <p className="dim">Loading…</p>;
  const open = (book: string | null) => {
    setReadingUi({ book, ...(book ? {} : { page: "reading" as const }) });
    onOpen();
  };
  const goal = summary.goal;

  return (
    <div className="rt-summary">
      {summary.reading.length === 0 ? (
        <p className="dim">
          Nothing on the go.{" "}
          <button
            className="rd-link"
            onClick={() => {
              setReadingUi({ adding: true });
              onOpen();
            }}
          >
            Add a book
          </button>
        </p>
      ) : (
        <ul className="rt-books">
          {summary.reading.slice(0, 3).map((b) => (
            <li key={b.id}>
              <button onClick={() => open(b.id)} title={b.title}>
                <Cover url={b.coverUrl} title={b.title} size="sm" />
                <span className="rt-book-body">
                  <span className="rt-book-title">{b.title}</span>
                  <Progress percent={b.percent} label={`${b.title} progress`} />
                  <span className="dim rt-book-meta">
                    {progressText(b)}
                    {b.finishEstimate && ` · done ~${mediumDay(b.finishEstimate)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {summary.reading.length > 3 && (
            <li className="dim rt-more">
              <button className="rd-link" onClick={() => open(null)}>
                and {summary.reading.length - 3} more
              </button>
            </li>
          )}
        </ul>
      )}
      <footer className="rt-foot">
        {goal.books ? (
          <span>
            {goal.finished} of {goal.books} books in {goal.year}
          </span>
        ) : (
          <span className="dim">{goal.finished} books finished in {goal.year}</span>
        )}
        {summary.streak > 0 && (
          <span className="rt-streak">
            <Flame size={12} strokeWidth={1.75} /> {summary.streak}
          </span>
        )}
      </footer>
    </div>
  );
}
