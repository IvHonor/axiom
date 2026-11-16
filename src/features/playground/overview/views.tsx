// The Playground tile's layouts. Each draws itself to the width and height
// it's given (measured, not the grid size), so every one fills its tile.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, Crown, Swords, Trophy, X, Zap } from "lucide-react";
import { useAssistantName, usePersona } from "../../lemma/persona";
import * as api from "../api";
import { displayName, type Board, type BoardEntry, type Friends, type Period, type PlaygroundMe } from "../api";
import { Duo, PlayerAvatar } from "../Duo";
import { Flame, atRisk, nextTier, tierOf } from "../Flame";
import { PeerLemma, glowOf, lemmaName } from "../PeerLemma";
import { lineFor } from "../banter";
import { Garden } from "../garden/Garden";
import { formatValue, type MetricInfo } from "../metrics";
import { FriendCode } from "../parts";
import { refresh, setFriends } from "../store";

export interface ViewProps {
  width: number;
  height: number;
  me: PlaygroundMe;
  board: Board | null;
  friends: Friends | null;
  metric: MetricInfo;
  period: Period;
  onOpen: () => void;
  openBoards: () => void;
}

const yours = (board: Board | null) => board?.entries.find((e) => e.player.you) ?? board?.you ?? null;
const FLAME_TIERS = { spark: "Spark", flame: "Flame", blaze: "Blaze", plasma: "Plasma", nova: "Nova" } as const;

/** While the board loads. */
const Waiting = ({ text = "Fetching the board…" }: { text?: string }) => <div className="pg-ov-wait">{text}</div>;

// ---------- Pulse: one line ----------

export function Pulse({ me, board, friends, metric, period, width, onOpen }: ViewProps) {
  const mine = yours(board);
  if (width < 55) return <button className="pg-ov-pulse is-tiny" onClick={onOpen}
    aria-label={mine ? `Open leaderboard, your rank is ${mine.rank}` : "Open leaderboard"}><Trophy size={12} /></button>;
  return (
    <button className="pg-ov-pulse" onClick={onOpen} aria-label="Open the Playground">
      {width >= 85 && mine && mine.streak > 0 && <Flame streak={mine.streak} risk={atRisk(mine.streakThrough, mine.asOf)} size={16} />}
      {me.inPlayground && mine ? (
        <span><strong>#{mine.rank}</strong>{width >= 150 && <small> of {board?.players ?? 1}</small>}{width >= 230 && <> · {formatValue(metric, mine.value, period, true)}</>}</span>
      ) : (
        <span><strong>{board?.players ?? friends?.friends.length ?? 0}</strong><small> {board?.scope === "global" ? "players" : "friends"}</small></span>
      )}
    </button>
  );
}

// ---------- Your flame ----------

export function FlameView({ board, height, width, onOpen }: ViewProps) {
  if (!board) return <Waiting />;
  const mine = yours(board);
  const streak = mine?.streak ?? 0;
  const tier = tierOf(streak);
  const next = nextTier(streak);
  const risk = !!mine && atRisk(mine.streakThrough, mine.asOf);
  const size = Math.max(36, Math.min(110, Math.min(height * 0.5, width * 0.45)));
  return (
    <button className="pg-ov-flame" data-tier={tier ?? "none"} data-risk={risk || undefined} onClick={onOpen}>
      <span className="pg-ov-flame-big">
        {tier ? <Flame streak={streak} risk={risk} size={size} count={false} /> : <span className="pg-ov-flame-cold" style={{ width: size * 0.75, height: size }} />}
      </span>
      <span className="pg-ov-flame-text">
        <strong>{streak}<small>{streak === 1 ? " day" : " days"}</small></strong>
        <span>{tier ? FLAME_TIERS[tier] : "No streak yet"}</span>
        {height >= 140 && (
          <small>{risk ? "Not fed today. Log something to keep it lit." : tier ? next ? `${next.at - streak} more to ${next.name}` : "Maximum flame" : "Log something today to light a spark."}</small>
        )}
        {height >= 170 && mine && mine.bestStreak > streak && <small>Best: {mine.bestStreak} days</small>}
      </span>
    </button>
  );
}

// ---------- Rival ----------

export function Rival({ board, metric, period, height, onOpen }: ViewProps) {
  const persona = usePersona();
  const lemma = useAssistantName();
  if (!board) return <Waiting />;
  const list = board.entries;
  const i = list.findIndex((e) => e.player.you);
  if (i < 0 || list.length < 2) return <Lonely text="Your rival appears once someone else is on this board." />;
  const me = list[i];
  const them = i === 0 ? list[1] : list[i - 1];
  const leading = i === 0;
  const gap = Math.abs(them.value - me.value) + (leading ? 0 : 1);
  const share = me.value + them.value > 0 ? me.value / (me.value + them.value) : 0.5;
  const size = Math.max(30, Math.min(64, height * 0.38));
  const side = (e: BoardEntry) => (
    <span className="pg-ov-rival-side" style={{ "--glow": glowOf(e.player) } as CSSProperties}>
      <Duo player={e.player} size={size} />
      <strong>{e.player.you ? "You" : displayName(e.player)}</strong>
      <small>{formatValue(metric, e.value, period, true)}</small>
    </span>
  );
  return (
    <button className="pg-ov-rival" onClick={onOpen}>
      <span className="pg-ov-rival-row">
        {side(me)}
        <span className="pg-ov-vs"><Swords size={16} /><b>{leading ? `+${formatValue(metric, gap, period, true)}` : `−${formatValue(metric, gap, period, true)}`}</b></span>
        {side(them)}
      </span>
      <span className="pg-ov-tug" style={{ "--you": share, "--you-glow": glowOf(me.player), "--them-glow": glowOf(them.player) } as CSSProperties}><i /></span>
      {height >= 150 && (
        <em className="pg-ov-line">{lemma}: “{leading ? lineFor(persona.personality, "leading", "tile") : lineFor(persona.personality, "chasing", them.player.userId, { rival: `@${them.player.handle}`, gap: formatValue(metric, gap, period) })}”</em>
      )}
    </button>
  );
}

// ---------- Week race ----------

export function Race({ board, metric, period, width, height, onOpen }: ViewProps) {
  if (!board) return <Waiting />;
  if (!board.entries.length) return <Lonely text="Nobody's on the track yet. Log something to start your lane." />;
  const lane = Math.max(24, Math.min(42, (height - 8) / Math.min(board.entries.length, 6)));
  const lanes = Math.max(1, Math.floor((height - 8) / lane));
  let shown = board.entries.slice(0, lanes);
  const mine = yours(board);
  if (mine && !shown.some((e) => e.player.you)) shown = [...shown.slice(0, lanes - 1), mine];
  const best = Math.max(1, ...board.entries.map((e) => e.value));
  const label = width >= 480 ? 110 : 76;
  return (
    <button className="pg-ov-race" onClick={onOpen} style={{ "--lane": `${lane}px`, "--label": `${label}px` } as CSSProperties}>
      {shown.map((e) => {
        const at = e.value / best;
        const ai = lane - 6;
        return (
          <span key={e.player.userId} className="pg-ov-lane" data-you={e.player.you || undefined} style={{ "--glow": glowOf(e.player) } as CSSProperties}>
            <span className="pg-ov-lane-name"><b>{e.rank}</b>{e.player.you ? "You" : displayName(e.player)}</span>
            <span className="pg-ov-track">
              <i className="pg-ov-trail" style={{ width: `calc(${at} * (100% - ${ai}px))` }} />
              <span className="pg-ov-runner" style={{ left: `calc(${at} * (100% - ${ai}px))`, width: ai, height: ai }}>
                <PeerLemma player={e.player} size={ai} />
                {e.rank === 1 && e.value > 0 && <Crown className="pg-ov-runner-crown" size={Math.max(10, ai * 0.4)} />}
              </span>
              <span className="pg-ov-lane-value">{formatValue(metric, e.value, period, true)}{e.streak >= 3 && <Flame streak={e.streak} risk={atRisk(e.streakThrough, e.asOf)} size={11} count={false} />}</span>
            </span>
          </span>
        );
      })}
      <span className="pg-ov-finish" aria-hidden="true" />
    </button>
  );
}

// ---------- Selected leaderboard ----------

export function BoardView({ board, metric, period, width, height, onOpen }: ViewProps) {
  if (!board) return <Waiting />;
  const mine = yours(board);
  if (!board.entries.length && !mine) return <Lonely text="Nobody's on this board yet." />;
  const row = height >= 260 && width >= 220 ? 44 : 34;
  const heading = width >= 280 && height >= 110;
  const rows = Math.max(1, Math.floor((height - (heading ? 22 : 0)) / row));
  let shown = board.entries.slice(0, rows);
  if (mine && !shown.some((e) => e.player.you)) shown = [...shown.slice(0, rows - 1), mine];
  const best = Math.max(1, ...board.entries.map(e => e.value), mine?.value ?? 0);
  return <div className="pg-ov-standings">
    {heading && <div className="pg-ov-columns" aria-hidden="true"><span>Rank · Player</span><span>{period === "streak" ? "Streak" : metric.short}</span></div>}
    <ol className="pg-ov-board" style={{ "--row": `${row}px` } as CSSProperties}>
      {shown.map((e) => (
        <li key={e.player.userId} data-you={e.player.you || undefined} style={{ "--glow": glowOf(e.player), "--score": `${Math.min(100, Math.max(0, e.value / best * 100))}%` } as CSSProperties}>
          <button onClick={onOpen} title={e.player.you && board.scope === "global" && !board.joined ? "Your projected rank. Your scores are not published globally." : undefined}>
            <b>{e.rank}</b>
            {width >= 210 && <Duo player={e.player} size={row - 12} />}
            <span className="pg-ov-board-who"><strong>{e.player.you ? "You" : displayName(e.player)}</strong>{row >= 40 && <small>{lemmaName(e.player)}</small>}</span>
            {width >= 400 && (period === "week" || period === "month") && e.previous !== null && (
              <span className="pg-ov-change" title={`${formatValue(metric, e.previous, period)} last ${period}`}>
                {e.previous > 0 ? `${e.value >= e.previous ? "+" : ""}${Math.round((e.value - e.previous) / e.previous * 100)}%` : e.value > 0 ? "New" : "—"}
              </span>
            )}
            {width >= 280 && e.streak > 0 && <Flame streak={e.streak} risk={atRisk(e.streakThrough, e.asOf)} size={12} />}
            <span className="pg-ov-board-value">{formatValue(metric, e.value, period, true)}</span>
          </button>
        </li>
      ))}
    </ol>
  </div>;
}

// ---------- Mini podium ----------

export function Podium({ board, metric, period, width, height, onOpen }: ViewProps) {
  if (!board) return <Waiting />;
  const top = board.entries.slice(0, 3);
  if (!top.length) return <Lonely text="The podium's empty. First one on it wins." />;
  const mine = yours(board);
  const footer = height >= 200;
  const stage = height - (footer ? 30 : 4);
  const size = Math.max(26, Math.min(58, stage * 0.3, width / 7));
  // Block heights by place: first tallest, then second, then third.
  const steps = [0.5, 0.36, 0.26];
  return (
    <button className="pg-ov-podium" onClick={onOpen}>
      <span className="pg-ov-stage" style={{ height: stage }}>
        {[1, 0, 2].map((i) => {
          const e = top[i];
          if (!e) return <span key={`gap${i}`} className="pg-ov-step is-empty" />;
          return (
            <span key={e.player.userId} className="pg-ov-step" data-place={e.rank} data-you={e.player.you || undefined} style={{ "--glow": glowOf(e.player) } as CSSProperties}>
              {e.rank === 1 && <Crown className="pg-ov-crown" size={size * 0.38} />}
              <Duo player={e.player} size={e.rank === 1 ? size : size * 0.82} />
              <span className="pg-ov-block" style={{ height: stage * steps[i] }}>
                <strong>{e.player.you ? "You" : displayName(e.player)}</strong>
                <small>{formatValue(metric, e.value, period, true)}</small>
              </span>
            </span>
          );
        })}
      </span>
      {footer && (
        <span className="pg-ov-podium-foot">
          {mine && mine.rank > 3 ? <>You're <b>#{mine.rank}</b> of {board.players}</> : board.champion ? <><Trophy size={12} /> {displayName(board.champion.player)} won last {period === "month" ? "month" : "week"}</> : mine ? <>You're on the podium!</> : null}
        </span>
      )}
    </button>
  );
}

// ---------- Cheers and requests ----------

export function Cheers({ me, friends, height }: ViewProps) {
  const [busy, setBusy] = useState(false);
  if (!friends) return <Waiting text="Finding your friends…" />;
  if (!friends.friends.length && !friends.incoming.length) {
    return (
      <div className="pg-ov-cheers is-empty">
        <span>No friends yet. Share your code:</span>
        <FriendCode code={me.friendCode} handle={me.player.handle} />
      </div>
    );
  }
  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try { await run(); await refresh(); } catch { /* shown as before */ } finally { setBusy(false); }
  };
  const cheer = (id: string) => void api.cheer(id).then(() => {
    setFriends({ ...friends, friends: friends.friends.map((f) => (f.player.userId === id ? { ...f, cheered: true } : f)) });
  }, () => {});
  const cheeredYou = friends.friends.filter((f) => f.cheeredYou);
  const toCheer = friends.friends.filter((f) => !f.cheered);
  const room = Math.max(1, Math.floor((height - 60 - (friends.incoming.length ? 40 : 0)) / 34));
  return (
    <div className="pg-ov-cheers">
      <div className="pg-ov-cheers-head">
        <span><Zap size={14} /> <b>{me.cheersThisWeek}</b> {me.cheersThisWeek === 1 ? "cheer" : "cheers"} this week</span>
        {cheeredYou.length > 0 && (
          <span className="pg-ov-faces" title={`Cheered you today: ${cheeredYou.map((f) => displayName(f.player)).join(", ")}`}>
            {cheeredYou.slice(0, 5).map((f) => <PlayerAvatar key={f.player.userId} player={f.player} size={22} />)}
          </span>
        )}
      </div>
      {friends.incoming.slice(0, 1).map((r) => (
        <div key={r.player.userId} className="pg-ov-cheer-row is-request">
          <Duo player={r.player} size={24} />
          <span><strong>{displayName(r.player)}</strong><small>wants to be friends</small></span>
          <button disabled={busy} onClick={() => void act(() => api.acceptFriend(r.player.userId))} aria-label={`Accept ${displayName(r.player)}`}><Check size={13} /></button>
          <button disabled={busy} onClick={() => void act(() => api.removeFriend(r.player.userId))} aria-label={`Decline ${displayName(r.player)}`}><X size={13} /></button>
        </div>
      ))}
      {toCheer.length ? toCheer.slice(0, room).map((f) => (
        <div key={f.player.userId} className="pg-ov-cheer-row">
          <Duo player={f.player} size={24} />
          <span><strong>{displayName(f.player)}</strong><small>{f.streak ? `${f.streak}-day streak` : lemmaName(f.player)}</small></span>
          <button className="pg-ov-cheer" onClick={() => cheer(f.player.userId)} aria-label={`Cheer ${displayName(f.player)} on`}><Zap size={13} /></button>
        </div>
      )) : <span className="pg-ov-done">You've cheered everyone today ⚡</span>}
    </div>
  );
}

// ---------- Garden window ----------

export const GardenView = ({ height }: ViewProps) => <div className="pg-ov-garden"><Garden height={height} /></div>;

// ---------- Dashboard ----------

export function Dashboard(props: ViewProps) {
  const { width, height } = props;
  const left = Math.round((width - 12) * 0.55), right = width - left - 12;
  const top = Math.round((height - 12) * 0.6), bottom = height - top - 12;
  const at = (w: number, h: number) => ({ ...props, width: w, height: h });
  const cell = (area: string, children: ReactNode) => <div className="pg-ov-cell" style={{ gridArea: area }}>{children}</div>;
  return (
    <div className="pg-ov-dash" style={{ gridTemplateColumns: `${left}px ${right}px`, gridTemplateRows: `${top}px ${bottom}px` }}>
      {cell("board", <BoardView {...at(left, height)} />)}
      {cell("podium", <Podium {...at(right, top)} />)}
      {cell("flame", <FlameView {...at(right, bottom)} />)}
    </div>
  );
}

// ---------- States ----------

const Lonely = ({ text }: { text: string }) => <div className="pg-ov-wait">{text}</div>;

/** A board layout before you're on the boards. */
export function JoinBoards({ openBoards, height }: ViewProps) {
  return (
    <button className="pg-ov-join" onClick={openBoards}>
      {height >= 120 && <Trophy size={24} />}
      <strong>Join the boards</strong>
      {height >= 100 && <small>Share your streaks and see how you stack up against friends.</small>}
    </button>
  );
}

export const VIEW_COMPONENTS = { pulse: Pulse, flame: FlameView, rival: Rival, race: Race, board: BoardView, podium: Podium, cheers: Cheers, garden: GardenView, dashboard: Dashboard };
