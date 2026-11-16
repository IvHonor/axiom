// The board the Playground tile shows, shared by its title and its body (and
// any other tile of it) so each board is fetched once a few minutes, not once
// per thing showing it.
import { useEffect, useState } from "react";
import * as api from "../api";
import type { Board, Period, Scope } from "../api";
import { today, usePlayground } from "../store";

const FRESH_MS = 2 * 60_000;
const cache = new Map<string, { at: number; board: Board | null; error: string | null; pending: Promise<Board | null> | null }>();
const listeners = new Set<() => void>();

function load(key: string, metric: string, period: Period, scope: Scope, force = false): Promise<Board | null> {
  const known = cache.get(key);
  if (known?.pending) return known.pending;
  if (!force && known && Date.now() - known.at < FRESH_MS) return Promise.resolve(known.board);
  const pending = api.getBoard(metric, period, scope, today()).then(
    (board) => { cache.set(key, { at: Date.now(), board, error: null, pending: null }); listeners.forEach((l) => l()); return board; },
    (error) => { cache.set(key, { at: Date.now(), board: known?.board ?? null, error: String(error), pending: null }); listeners.forEach((l) => l()); return known?.board ?? null; },
  );
  cache.set(key, { at: known?.at ?? 0, board: known?.board ?? null, error: null, pending });
  return pending;
}

/** Boards are shared across tiles, isolated by account, audience and day. */
export function useTileBoard(metric: string, period: Period, enabled: boolean, scope: Scope = "friends") {
  const { me } = usePlayground();
  const key = `${me?.player.userId}:${me?.inPlayground}:${me?.global}:${me?.shared.join("|")}:${today()}:${metric}:${period}:${scope}`;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const changed = () => bump((n) => n + 1);
    listeners.add(changed);
    void load(key, metric, period, scope);
    const every = window.setInterval(() => void load(key, metric, period, scope), FRESH_MS);
    return () => { listeners.delete(changed); window.clearInterval(every); };
  }, [enabled, key, metric, period, scope]);
  const state = enabled ? cache.get(key) : undefined;
  return { board: state?.board ?? null, error: state?.error ?? null,
    reload: () => { if (enabled) void load(key, metric, period, scope, true); } };
}
