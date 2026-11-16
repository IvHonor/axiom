import { useEffect, useRef, useState } from "react";
import { displayName, type Board, type Friends } from "./api";
import type { PlaygroundOptions } from "./preferences";
import { mondayOf, firstOfMonth } from "./stats";
import { today } from "./store";

type Kind = keyof PlaygroundOptions["alerts"];
interface Notice { id: number; user: string; kind: Kind; text: string }

/** Compare refreshes while this page is open; initial data never generates old alerts. */
export function useBoardAlerts(board: Board | null, friends: Friends | null, user: string | undefined, enabled: PlaygroundOptions["alerts"]) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const previous = useRef(new Map<string, { rank: number | null; period: string }>());
  const cheers = useRef<{ user: string; day: string; ids: Set<string> } | null>(null);
  const nextId = useRef(0);
  useEffect(() => {
    if (!user) return;
    const add = (kind: Kind, text: string) => {
      if (enabled[kind]) setNotices(all => [{ id: ++nextId.current, user, kind, text }, ...all].slice(0, 4));
    };
    const day = today();
    if (friends) {
      const before = cheers.current;
      if (before?.user === user && before.day === day) {
        for (const f of friends.friends) if (f.cheeredYou && !before.ids.has(f.player.userId)) add("cheers", `${displayName(f.player)} cheered you on.`);
      }
      cheers.current = { user, day, ids: new Set(friends.friends.filter(f => f.cheeredYou).map(f => f.player.userId)) };
    }
    if (!board) return;
    const key = `${user}:${board.scope}:${board.metric}:${board.period}`;
    const period = board.period === "week" ? mondayOf(day) : board.period === "month" ? firstOfMonth(day) : "continuous";
    const mine = board.entries.find(e => e.player.you) ?? board.you;
    const rank = board.joined ? mine?.rank ?? null : null;
    const before = previous.current.get(key);
    if (before) {
      if (before.period === period && before.rank !== null && rank !== null && rank > before.rank) add("overtaken", `Your rank moved from #${before.rank} to #${rank}. Keep going!`);
      if (before.period !== period && board.champion) add("results", `${displayName(board.champion.player)} won last ${board.period === "week" ? "week" : "month"}’s board.`);
    }
    previous.current.set(key, { rank, period });
  }, [board, friends, user, enabled]);
  return { notices: notices.filter(n => n.user === user && enabled[n.kind]), dismiss: (id: number) => setNotices(all => all.filter(n => n.id !== id)) };
}
