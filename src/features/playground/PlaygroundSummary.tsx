// The Playground's overview tile: a live look into the Hub (who's online,
// where, and the AIs in the Plaza right now), with your place among friends
// beside it when you're on the boards.
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { Face } from "../lemma/Face";
import { useAssistantName } from "../lemma/persona";
import { Flame, atRisk } from "./Flame";
import { PeerLemma, glowOf, lemmaName } from "./PeerLemma";
import * as api from "./api";
import { type Board } from "./api";
import { peekHub, type HubPeek } from "./hub/api";
import { ROOMS } from "./hub/rooms";
import { today, usePlayground } from "./store";

export function PlaygroundSummary({ onOpen }: { onOpen: () => void }) {
  const { me, signedIn } = usePlayground();
  const { width, height } = useTileLayout();
  const lemma = useAssistantName();
  const [peek, setPeek] = useState<HubPeek | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const hasHandle = !!me;
  const competing = !!me?.inPlayground;

  useEffect(() => {
    if (!hasHandle) return;
    let live = true;
    const load = () => peekHub().then((p) => live && setPeek(p), () => {});
    void load();
    const every = window.setInterval(load, 30_000);
    return () => { live = false; window.clearInterval(every); };
  }, [hasHandle]);

  useEffect(() => {
    if (!competing) return;
    let live = true;
    const load = () => api.getBoard("active", "week", "friends", today()).then((b) => live && setBoard(b), () => {});
    void load();
    const every = window.setInterval(load, 5 * 60_000);
    return () => { live = false; window.clearInterval(every); };
  }, [competing]);

  if (!signedIn || me === null) {
    return (
      <button className="pg-tile is-invite" onClick={onOpen}>
        {height >= 150 && <Face mood="happy" size={Math.min(84, height - 80)} alive={false} />}
        <span><strong>Bring {lemma} to the Hub</strong><small>{signedIn ? "Meet everyone's AIs, live." : "Sign in to meet everyone's AIs."}</small></span>
        <ArrowUpRight size={14} />
      </button>
    );
  }
  if (!peek) return <div className="pg-tile is-status"><Sparkles size={16} className="pg-spin" /> Looking into the Hub…</div>;

  const mine = board?.entries.find((e) => e.player.you);
  const busiest = [...peek.rooms].sort((a, b) => b.count - a.count)[0];
  const fit = Math.max(1, Math.floor((width - 16) / 50));
  return (
    <button className="pg-tile pg-tile-hub" onClick={onOpen} aria-label="Open the Hub">
      <span className="pg-tile-head">
        <span className="pg-tile-live"><i aria-hidden="true" /> {peek.online}<small>online</small></span>
        <span className="pg-tile-text">
          <strong>The Hub</strong>
          <small>{peek.online && busiest ? `Busiest: ${ROOMS[busiest.id].name.replace("The ", "")} (${busiest.count})` : "Quiet right now. Be the first in."}</small>
        </span>
        {mine && <span className="pg-tile-rank-mini" title="Your rank among friends this week">#{mine.rank}<Flame streak={mine.streak} risk={atRisk(mine.streakThrough, mine.asOf)} size={14} count={false} /></span>}
      </span>
      {height >= 150 && (
        <span className="pg-tile-plaza">
          {peek.plaza.length ? peek.plaza.slice(0, fit).map((p, i) => (
            <span key={p.player.userId} className="pg-tile-lemma" style={{ "--glow": glowOf(p.player), animationDelay: `${-i * 0.5}s` } as CSSProperties} title={`${lemmaName(p.player)} · @${p.player.handle}`}>
              <PeerLemma player={p.player} size={42} />
            </span>
          )) : <span className="pg-tile-empty">The Plaza's empty. Step in and say hi when others arrive.</span>}
        </span>
      )}
    </button>
  );
}
