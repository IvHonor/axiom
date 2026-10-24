import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../../../lib/sync";
import { today } from "../../daily_plan/time";
import { api, errorMessage, type BookCard, type ReadingStats, type ReadingSummary } from "../api";
import { useReadingUi } from "../readingUi";

interface Data {
  summary: ReadingSummary | null;
  books: BookCard[] | null;
  stats: ReadingStats | null;
  error: string | null;
  extraError: string | null;
  loading: boolean;
}
/** Only expanded views read the full library or year statistics. Stale responses never replace newer data. */
export function useReadingOverviewData(enabled: boolean, needBooks: boolean, needStats: boolean) {
  const [data, setData] = useState<Data>({ summary: null, books: null, stats: null, error: null, extraError: null, loading: false });
  const request = useRef(0);
  const { revision } = useReadingUi();
  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    setData(previous => ({ ...previous, loading: true }));
    const day = today();
    const [summary, books, stats] = await Promise.allSettled([
      api.summary(day), needBooks ? api.list(day) : Promise.resolve(null),
      needStats ? api.stats(Number(day.slice(0, 4)), day) : Promise.resolve(null),
    ]);
    if (id !== request.current) return;
    setData(previous => ({
      summary: summary.status === "fulfilled" ? summary.value : previous.summary,
      books: books.status === "fulfilled" && books.value ? books.value : previous.books,
      stats: stats.status === "fulfilled" && stats.value ? stats.value : previous.stats,
      error: summary.status === "rejected" ? errorMessage(summary.reason) : null,
      extraError: books.status === "rejected" ? errorMessage(books.reason) : stats.status === "rejected" ? errorMessage(stats.reason) : null,
      loading: false,
    }));
  }, [enabled, needBooks, needStats]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => { request.current++; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [load, revision]);
  useDataChanged(load);
  return { ...data, reload: load };
}
