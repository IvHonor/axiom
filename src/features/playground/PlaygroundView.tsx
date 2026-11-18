// The Playground: a holographic training ground where everyone's Lemma
// lives. A console bar picks friends or everyone, the period and the "lab"
// (metric); the top three stand on a lit stage; everyone else is ranked
// below with their Lemma, streak flames and a way to cheer them on; and a
// signal log on the side narrates what's going on.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Crown, Globe2, Lock, RefreshCw, Settings2, Sparkles, Swords, Trophy, Users, X, Zap } from "lucide-react";
import { useBoardFilters, usePlaygroundMode, usePlaygroundOptions, type BoardFilters } from "./preferences";
import { useBoardAlerts } from "./useBoardAlerts";
import "./preferences.css";
import { useAssistantName, usePersona } from "../lemma/persona";
import { Face } from "../lemma/Face";
import { Modal } from "../../shell/ui/Modal";
import { Backdrop } from "./Backdrop";
import { Flame, atRisk, nextTier } from "./Flame";
import { Join } from "./Join";
import { glowOf, lemmaName } from "./PeerLemma";
import { Duo } from "./Duo";
import { lineFor } from "./banter";
import { PERIODS, before, formatValue, metricInfo, type MetricInfo } from "./metrics";
import * as api from "./api";
import { displayName, type Board, type BoardEntry, type Period, type Scope } from "./api";
import { sendStats, setFriends, today, usePlayground } from "./store";
import { FriendCode } from "./parts";
import { BoardPicker } from "./BoardPicker";
import { Hub } from "./hub/Hub";
import { isWeb } from "../../lib/platform";
import { markFound } from "../lemma/achievements/secrets";

function useBoard(prefs: BoardFilters, enabled: boolean, revision: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const ticket = ++asked.current;
    setLoading(true);
    try {
      const next = await api.getBoard(prefs.metric, prefs.period, prefs.scope, today());
      if (ticket === asked.current) { setBoard(next); setError(null); }
    } catch (e) {
      if (ticket === asked.current) setError(String(e));
    } finally {
      if (ticket === asked.current) setLoading(false);
    }
  }, [prefs.metric, prefs.period, prefs.scope, enabled, revision]);
  useEffect(() => { setBoard(null); setError(null); void load(); return () => { asked.current++; }; }, [load]);
  // Fresh every couple of minutes while open.
  useEffect(() => {
    const every = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(every);
  }, [load]);
  return { board, setBoard, error, loading, reload: load };
}

type View = "boards" | "nexus";

/** The Playground's two views: the leaderboards first, Nexus beside them. */
function ViewSwitch({ view, onView }: { view: View; onView: (view: View) => void }) {
  return (
    <div className="pg-segment pg-views" role="tablist" aria-label="View">
      <button role="tab" aria-selected={view === "boards"} onClick={() => onView("boards")}><Trophy size={14} /> Leaderboards</button>
      <button role="tab" aria-selected={view === "nexus"} onClick={() => onView("nexus")}><Sparkles size={14} /> Nexus</button>
    </div>
  );
}

/** The leaderboards: friends or everyone, by period and board. */
function BoardsView({ onNexus, onView }: { onNexus: () => void; onView: (view: View) => void }) {
  const { me, friends, signedIn, error: meError, refresh } = usePlayground();
  const [prefs, setPrefs] = useBoardFilters();
  const { options } = usePlaygroundOptions();
  const [settings, setSettings] = useState(false);
  const [card, setCard] = useState<BoardEntry | null>(null);
  const metric = metricInfo(prefs.metric);
  // A friends-only metric can't be on the global boards.
  const scope: Scope = prefs.scope === "global" && !metric.global ? "friends" : prefs.scope;
  const view = { ...prefs, scope };
  const { board, setBoard, error, loading, reload } = useBoard(view, !!me, `${me?.player.userId}:${me?.inPlayground}:${me?.global}:${me?.shared.join("|")}`);
  const { notices, dismiss } = useBoardAlerts(board, friends, me?.player.userId, options.alerts);

  // Send fresh numbers when the page opens, then show them.
  const joined = !!me?.inPlayground;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (joined) void sendStats().then((sent) => { if (sent) void reloadRef.current(); });
  }, [joined]);

  const colors = useMemo(() => (board?.entries ?? []).slice(0, 8).map((e) => glowOf(e.player)), [board]);

  if (!signedIn) return <Shell colors={[]}><Gate icon={<Lock size={22} />} title="Sign in to enter the Playground" text="The Playground needs an Axiom account: it's how friends find you. Open Account (bottom left) to sign in." /></Shell>;
  if (me === undefined) return <Shell colors={[]}><Gate icon={<RefreshCw size={22} className="pg-spin" />} title={meError ? "Couldn't reach the Playground" : "Booting the Playground…"} text={meError ?? "Finding your friends."} action={meError ? { label: "Try again", run: refresh } : undefined} /></Shell>;
  // A handle (for friends) isn't joining: the boards are a choice of their own.
  if (me === null) return <Shell colors={[]}><div className="pg-join-wrap"><Join me={me} /></div></Shell>;

  const cheer = async (entry: BoardEntry) => {
    try {
      await api.cheer(entry.player.userId);
      const mark = (e: BoardEntry) => (e.player.userId === entry.player.userId ? { ...e, cheered: true } : e);
      setBoard((b) => (b ? { ...b, entries: b.entries.map(mark), you: b.you && mark(b.you) } : b));
      setCard((c) => (c ? mark(c) : c));
      if (friends) setFriends({ ...friends, friends: friends.friends.map((f) => (f.player.userId === entry.player.userId ? { ...f, cheered: true } : f)) });
    } catch { /* shown as not cheered */ }
  };

  // Cheered from the sidebar too: the board shows it straight away.
  const cheeredIds = new Set((friends?.friends ?? []).filter((f) => f.cheered).map((f) => f.player.userId));
  const withCheers = (e: BoardEntry) => (cheeredIds.has(e.player.userId) && !e.cheered ? { ...e, cheered: true } : e);
  const entries = (board?.entries ?? []).map(withCheers);
  const mine = entries.find((e) => e.player.you) ?? board?.you ?? null;
  return (
    <Shell colors={colors}>
      <div className="pg-alerts" aria-live="polite" aria-label="Playground alerts">
        {notices.map(n => <div key={n.id} className="pg-alert"><span>{n.text}</span><button className="icon-btn" aria-label="Dismiss Playground alert" onClick={() => dismiss(n.id)}><X size={14} /></button></div>)}
      </div>
      <header className="pg-console">
        <div className="pg-console-title">
          <Sparkles size={18} />
          <h1>Playground</h1>
          <code className="pg-address" aria-label="Board">playground://{scope}/{metric.id}?{view.period}<span className="pg-caret" aria-hidden="true" onClick={onNexus} /></code>
        </div>
        <div className="pg-console-controls">
          <div className="pg-segment" role="tablist" aria-label="Who">
            <button role="tab" aria-selected={scope === "friends"} onClick={() => setPrefs({ ...prefs, scope: "friends" })}><Users size={14} /> Friends</button>
            <button role="tab" aria-selected={scope === "global"} disabled={!metric.global} title={metric.global ? undefined : "Just for friends: everyone counts this differently"} onClick={() => setPrefs({ ...prefs, scope: "global" })}><Globe2 size={14} /> Everyone</button>
          </div>
          <div className="pg-segment" role="tablist" aria-label="When">
            {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={view.period === p.id} onClick={() => setPrefs({ ...prefs, period: p.id })}>{p.short}</button>)}
          </div>
          <button className="pg-icon" onClick={() => void reload()} aria-label="Refresh" title="Refresh"><RefreshCw size={15} className={loading ? "pg-spin" : undefined} /></button>
          <button className="pg-icon" onClick={() => setSettings(true)} aria-label="Your Playground settings" title="How you appear"><Settings2 size={15} /></button>
          <ViewSwitch view="boards" onView={onView} />
        </div>
      </header>

      <BoardPicker metric={metric} shared={me.shared} onPick={(m) => setPrefs({ ...prefs, metric: m.id, scope: m.global ? prefs.scope : "friends" })} />

      <div className="pg-main">
        <section className="pg-arena" aria-label={`${metric.lab}: ${metric.label}, ${PERIODS.find((p) => p.id === view.period)?.label}`}>
          <div className="pg-arena-head">
            <div>
              <span className="pg-kicker">{metric.label} · {PERIODS.find((p) => p.id === view.period)?.label}</span>
              <h2>{metric.lab}</h2>
            </div>
            <span className="pg-online"><i aria-hidden="true" /> {board ? onBoard(board) : "Connecting…"}</span>
          </div>

          {error && <p className="pg-error" role="alert">{error} <button onClick={() => void reload()}>Retry</button></p>}
          {board && !board.joined && <NotOnBoard board={board} metric={metric} meShares={me.shared.includes(metric.id)} onSettings={() => setSettings(true)} />}

          {board && board.champion && <Champion entry={board.champion} metric={metric} period={view.period} />}
          {board && options.podium && <Stage entries={entries.slice(0, 3)} metric={metric} period={view.period} onOpen={setCard} />}
          {board && <Rival board={board} metric={metric} period={view.period} />}
          {board && <Ranks entries={options.podium ? entries.slice(3) : entries} you={board.you && withCheers(board.you)} metric={metric} period={view.period} leader={entries[0]?.value ?? 0} onOpen={setCard} onCheer={cheer} />}
          {board && scope === "friends" && entries.length <= 1 && <Invite code={me.friendCode} />}
        </section>

        <aside className="pg-side">
          <YouCard me={me} entry={mine} metric={metric} period={view.period} />
          <SignalLog board={board} friends={friends} metric={metric} period={view.period} />
        </aside>
      </div>

      {settings && (
        <Modal title="Your Playground" onClose={() => setSettings(false)} width={620} className="pg-modal">
          <Join me={me} onDone={() => { setSettings(false); void reload(); }} />
        </Modal>
      )}
      {card && <ProfileCard entry={card} metric={metric} period={view.period} onClose={() => setCard(null)} onCheer={cheer} />}
    </Shell>
  );
}

/** "You and 4 friends on this board", or on a global board "120 people on this board". */
function onBoard(board: Board): string {
  if (board.scope === "global") return `${board.players.toLocaleString()} ${board.players === 1 ? "person" : "people"} on this board`;
  const friends = board.players - (board.joined ? 1 : 0);
  if (friends <= 0) return board.joined ? "Just you so far" : "No friends here yet";
  return `${board.joined ? "You and " : ""}${friends} ${friends === 1 ? "friend" : "friends"} on this board`;
}

/** The Playground opens on the leaderboards; Nexus (the live city of AIs) is
 *  the second view, switched to from the console bar. The old secret doors
 *  still work and still count for the achievement: type "nexus" anywhere on
 *  the boards, or click the address bar's blinking caret. */
export function PlaygroundView() {
  const [mode, setMode] = usePlaygroundMode();
  const found = useCallback(() => { markFound("nexus"); setMode("nexus"); }, [setMode]);
  useSecretWord("nexus", found, mode === "boards");
  if (mode === "boards") return <BoardsView onNexus={found} onView={setMode} />;
  return (
    <Shell colors={[]}>
      <ViewSwitch view="nexus" onView={setMode} />
      {isWeb ? <DesktopOnly /> : <Hub />}
    </Shell>
  );
}

/** Calls `onFound` when `word` is typed, outside any text field. */
function useSecretWord(word: string, onFound: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let typed = "";
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || t?.closest("input, textarea, select, [contenteditable]")) return;
      typed = (typed + e.key.toLowerCase()).slice(-word.length);
      if (typed === word) onFound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [word, onFound, enabled]);
}

/** On the web: Nexus is a desktop app feature, for now. */
function DesktopOnly() {
  return (
    <div className="hub-outside">
      <div className="hub-card">
        <span className="pg-kicker"><Sparkles size={12} /> Desktop app</span>
        <h2>Nexus lives in the Axiom desktop app</h2>
        <p>Walk your AI through a city of AIs and meet whoever's there right now. Get Axiom for your computer to step in. Friends, the leaderboards and your garden all work here too.</p>
        {/* The web app runs on the website, which has the download page. */}
        <a className="pg-enter hub-enter" href="/download" target="_blank" rel="noreferrer">Get the desktop app</a>
      </div>
    </div>
  );
}

function Shell({ colors, children }: { colors: string[]; children: ReactNode }) {
  const { options } = usePlaygroundOptions();
  return (
    <div className="pg-view" data-compact={options.compact || undefined} data-no-companions={!options.companions || undefined} data-reduced-motion={options.reducedMotion || undefined}>
      <Backdrop colors={colors} reducedMotion={options.reducedMotion} />
      <div className="pg-content">{children}</div>
    </div>
  );
}

function Gate({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="pg-gate">
      <div className="pg-gate-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <button className="pg-enter" onClick={action.run}>{action.label}</button>}
    </div>
  );
}

// ---------- The stage ----------

const ORDER = [1, 0, 2]; // second, first, third

function Stage({ entries, metric, period, onOpen }: { entries: BoardEntry[]; metric: MetricInfo; period: Period; onOpen: (e: BoardEntry) => void }) {
  const persona = usePersona();
  const { options } = usePlaygroundOptions();
  if (!entries.length) {
    return (
      <div className="pg-stage is-empty">
        <div className="pg-solo"><Face mood="idle" size={120} /><p className="pg-bubble">{lineFor(persona.personality, "warming", "empty")}</p></div>
        <p className="pg-empty-note">Nobody's on this board yet. Be the first.</p>
      </div>
    );
  }
  const leader = entries[0];
  return (
    <div className="pg-stage" data-count={entries.length}>
      {ORDER.map((i) => {
        const e = entries[i];
        if (!e) return <div key={`gap-${i}`} className="pg-podium is-vacant" data-place={i + 1} />;
        const glow = glowOf(e.player);
        return (
          <button key={e.player.userId} className="pg-podium" data-place={e.rank} data-you={e.player.you || undefined} style={{ "--glow": glow } as CSSProperties} onClick={() => onOpen(e)} aria-label={`${e.rank}. ${displayName(e.player)}, ${formatValue(metric, e.value, period)}`}>
            <span className="pg-spot" aria-hidden="true" />
            {e.rank === 1 && <Crown className="pg-crown" size={30} aria-hidden="true" />}
            {e === leader && leader.value > 0 && <span className="pg-bubble is-stage">{lineFor(e.player.lemma.personality, "leading", e.player.userId)}</span>}
            <span className="pg-podium-duo"><Duo player={e.player} size={e.rank === 1 ? 100 : 84} lemmaSize={e.rank === 1 ? 78 : 64} placement="side" alive={options.companions && !options.reducedMotion} mood={e.rank === 1 ? "happy" : "idle"} /></span>
            <span className="pg-pedestal">
              <span className="pg-place">{e.rank}</span>
              <strong className="pg-podium-name">{displayName(e.player)}{e.player.you && <em>you</em>}</strong>
              <span className="pg-podium-sub">@{e.player.handle} · {lemmaName(e.player)}</span>
              <span className="pg-podium-value">{formatValue(metric, e.value, period)}</span>
              {period !== "streak" && <Flame streak={e.streak} risk={atRisk(e.streakThrough, e.asOf)} best={e.bestStreak} size={16} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Champion({ entry, metric, period }: { entry: BoardEntry; metric: MetricInfo; period: Period }) {
  return (
    <div className="pg-champion" style={{ "--glow": glowOf(entry.player) } as CSSProperties}>
      <Trophy size={16} />
      <Duo player={entry.player} size={28} />
      <span><strong>{displayName(entry.player)}</strong> and {lemmaName(entry.player)} won {before(period)} with {formatValue(metric, entry.value, period)}</span>
    </div>
  );
}

function Rival({ board, metric, period }: { board: Board; metric: MetricInfo; period: Period }) {
  const persona = usePersona();
  const lemma = useAssistantName();
  const list = board.entries;
  const i = list.findIndex((e) => e.player.you);
  if (i < 0 || list.length < 2) return null;
  const me = list[i];
  if (i === 0) {
    const second = list[1];
    const lead = me.value - second.value;
    return (
      <div className="pg-rival is-leading">
        <Crown size={16} />
        <span><strong>You're top.</strong> {lead > 0 ? `${formatValue(metric, lead, period)} clear of ${displayName(second.player)}.` : `Level with ${displayName(second.player)}.`} <em>{lemma}: “{lineFor(persona.personality, "leading", "you")}”</em></span>
      </div>
    );
  }
  const rival = list[i - 1];
  const gap = Math.max(0, rival.value - me.value) + 1;
  return (
    <div className="pg-rival" style={{ "--glow": glowOf(rival.player) } as CSSProperties}>
      <Swords size={16} />
      <span><strong>Next up: {displayName(rival.player)}</strong>. {formatValue(metric, gap, period)} to take #{rival.rank}. <em>{lemma}: “{lineFor(persona.personality, "chasing", rival.player.userId, { rival: `@${rival.player.handle}`, gap: formatValue(metric, gap, period) })}”</em></span>
    </div>
  );
}

// ---------- The ranks ----------

function Ranks({ entries, you, metric, period, leader, onOpen, onCheer }: {
  entries: BoardEntry[]; you: BoardEntry | null; metric: MetricInfo; period: Period; leader: number;
  onOpen: (e: BoardEntry) => void; onCheer: (e: BoardEntry) => void;
}) {
  if (!entries.length && !you) return null;
  return (
    <ol className="pg-ranks">
      {entries.map((e) => <Row key={e.player.userId} entry={e} metric={metric} period={period} leader={leader} onOpen={onOpen} onCheer={onCheer} />)}
      {you && <><li className="pg-gap" aria-hidden="true">⋯</li><Row entry={you} metric={metric} period={period} leader={leader} onOpen={onOpen} onCheer={onCheer} /></>}
    </ol>
  );
}

function Row({ entry: e, metric, period, leader, onOpen, onCheer }: { entry: BoardEntry; metric: MetricInfo; period: Period; leader: number; onOpen: (e: BoardEntry) => void; onCheer: (e: BoardEntry) => void }) {
  const { options } = usePlaygroundOptions();
  const share = leader > 0 ? Math.max(0.03, e.value / leader) : 0;
  const beat = e.previous !== null && period !== "all" && period !== "streak" && e.value > e.previous && e.previous > 0;
  return (
    <li className="pg-row" data-you={e.player.you || undefined} style={{ "--glow": glowOf(e.player), "--share": share } as CSSProperties}>
      <button className="pg-row-main" onClick={() => onOpen(e)}>
        <span className="pg-rank">{e.rank}</span>
        <Duo player={e.player} size={options.compact ? 28 : 40} />
        <span className="pg-row-who">
          <strong>{displayName(e.player)}{e.player.you && <em>you</em>}</strong>
          <span>@{e.player.handle} · {lemmaName(e.player)}</span>
        </span>
        {period !== "streak" && <Flame streak={e.streak} risk={atRisk(e.streakThrough, e.asOf)} best={e.bestStreak} />}
        <span className="pg-row-value">
          <strong>{formatValue(metric, e.value, period, true)}</strong>
          {beat ? <small className="is-up">▲ beat {before(period)}</small> : e.previous !== null && period !== "all" && period !== "streak" ? <small>{before(period)}: {formatValue(metric, e.previous, period, true)}</small> : null}
        </span>
        <span className="pg-signal" aria-hidden="true"><span /></span>
      </button>
      {e.player.friend && !e.player.you && (
        <button className="pg-cheer" data-done={e.cheered || undefined} disabled={e.cheered} onClick={() => onCheer(e)} title={e.cheered ? "Cheered today" : `Cheer ${displayName(e.player)} on`} aria-label={e.cheered ? "Cheered today" : `Cheer ${displayName(e.player)} on`}>
          <Zap size={14} />
        </button>
      )}
    </li>
  );
}

function NotOnBoard({ board, metric, meShares, onSettings }: { board: Board; metric: MetricInfo; meShares: boolean; onSettings: () => void }) {
  if (!meShares) return <div className="pg-ghost"><Lock size={15} /><span>You don't share <strong>{metric.label.toLowerCase()}</strong>, so you're not on this board.</span><button onClick={onSettings}>Share it</button></div>;
  if (board.scope === "global") {
    return (
      <div className="pg-ghost">
        <Globe2 size={15} />
        <span>{board.you ? <>You'd be <strong>#{board.you.rank}</strong> of {board.players + 1} here. Only you can see that.</> : "You're not on the global boards."}</span>
        <button onClick={onSettings}>Join the global boards</button>
      </div>
    );
  }
  return null;
}

function Invite({ code }: { code: string }) {
  return (
    <div className="pg-invite">
      <Users size={18} />
      <div>
        <strong>This playground's a bit quiet</strong>
        <span>Give friends your code. Whoever enters it becomes your friend straight away.</span>
      </div>
      <FriendCode code={code} />
    </div>
  );
}

// ---------- The side ----------

function YouCard({ me, entry, metric, period }: { me: api.PlaygroundMe; entry: BoardEntry | null; metric: MetricInfo; period: Period }) {
  const lemma = useAssistantName();
  const streak = entry?.streak ?? 0;
  const next = nextTier(streak);
  return (
    <section className="pg-you">
      <div className="pg-you-face"><Duo player={me.player} size={64} placement="side" lemmaSize={44} mood={entry?.rank === 1 ? "happy" : "idle"} /></div>
      <div className="pg-you-text">
        <strong>@{me.player.handle}</strong>
        <span>with {lemma}</span>
        <div className="pg-you-stats">
          <span><small>Rank</small><b>{entry ? `#${entry.rank}` : "—"}</b></span>
          <span><small>{period === "streak" ? "Streak" : metric.label}</small><b>{entry ? formatValue(metric, entry.value, period, true) : "—"}</b></span>
          <span><small>Cheers</small><b><Zap size={12} /> {me.cheersThisWeek}</b></span>
        </div>
        {streak > 0 && <p className="pg-you-flame"><Flame streak={streak} risk={entry ? atRisk(entry.streakThrough, entry.asOf) : false} size={20} /> {next ? `${next.at - streak} more ${next.at - streak === 1 ? "day" : "days"} to ${next.name}` : "Maximum flame"}</p>}
      </div>
    </section>
  );
}

interface Signal { tag: string; text: string; tone?: string }

function SignalLog({ board, friends, metric, period }: { board: Board | null; friends: api.Friends | null; metric: MetricInfo; period: Period }) {
  const signals = useMemo(() => {
    const out: Signal[] = [];
    for (const f of friends?.friends ?? []) if (f.cheeredYou) out.push({ tag: "cheer", text: `${displayName(f.player)} cheered you on`, tone: "cheer" });
    for (const r of friends?.incoming ?? []) out.push({ tag: "link", text: `@${r.player.handle} wants to be friends`, tone: "link" });
    const entries = board?.entries ?? [];
    if (entries[0] && entries[0].value > 0) out.push({ tag: "rank", text: `${lemmaName(entries[0].player)} has ${displayName(entries[0].player)} leading ${metric.lab}` });
    for (const e of entries) {
      if (e.streak >= 3 && atRisk(e.streakThrough, e.asOf)) out.push({ tag: "risk", text: `${displayName(e.player)}'s ${e.streak}-day streak is flickering`, tone: "risk" });
      else if (e.streak >= 7) out.push({ tag: "fire", text: `${lemmaName(e.player)} keeps ${displayName(e.player)}'s fire lit: ${e.streak} days`, tone: "fire" });
      if (e.bestStreak >= 30 && e.streak === e.bestStreak) out.push({ tag: "best", text: `${displayName(e.player)} is on their best streak ever`, tone: "fire" });
    }
    if (board?.champion) out.push({ tag: "crown", text: `${displayName(board.champion.player)} won ${before(period)}` });
    return out.slice(0, 12);
  }, [board, friends, metric, period]);
  return (
    <section className="pg-log" aria-label="Signal log">
      <h3><span className="pg-dot" aria-hidden="true" /> Signal log</h3>
      {signals.length ? (
        <ol>{signals.map((s, i) => <li key={i} data-tone={s.tone} style={{ animationDelay: `${i * 60}ms` }}><code>[{s.tag}]</code> {s.text}</li>)}</ol>
      ) : <p>Quiet on the network. Log something and watch it light up.</p>}
    </section>
  );
}

// ---------- A Lemma's card ----------

function ProfileCard({ entry: e, metric, period, onClose, onCheer }: { entry: BoardEntry; metric: MetricInfo; period: Period; onClose: () => void; onCheer: (e: BoardEntry) => void }) {
  const { options } = usePlaygroundOptions();
  const [added, setAdded] = useState<string | null>(null);
  const add = async () => {
    try {
      const result = await api.addFriend({ handle: e.player.handle });
      setAdded(result.outcome === "friends" ? "You're friends now!" : "Request sent.");
    } catch (err) {
      setAdded(String(err));
    }
  };
  const personality = e.player.lemma.personality;
  return (
    <Modal title={displayName(e.player)} onClose={onClose} width={440} className="pg-modal">
      <div className="pg-card" data-no-companions={!options.companions || undefined} data-reduced-motion={options.reducedMotion || undefined} style={{ "--glow": glowOf(e.player) } as CSSProperties}>
        <div className="pg-card-stage">
          <span className="pg-spot" aria-hidden="true" />
          <Duo player={e.player} size={130} placement="side" lemmaSize={110} alive={options.companions && !options.reducedMotion} mood={e.cheered ? "happy" : "idle"} />
        </div>
        <p className="pg-bubble">{lineFor(personality, e.streak >= 3 ? "streak" : e.rank === 1 ? "leading" : "warming", e.player.userId, { streak: e.streak, next: e.streak + 1 })}</p>
        <h3>{displayName(e.player)}</h3>
        <p className="pg-card-sub">@{e.player.handle} · <strong>{lemmaName(e.player)}</strong>, {personality}</p>
        <div className="pg-card-badges">
          {e.player.perks.firstLight && <span title="Joined Axiom early">First Light</span>}
          {e.player.perks.admin && <span title="Runs this Axiom server">Admin</span>}
          {e.player.friend && <span>Friend</span>}
        </div>
        <dl className="pg-card-stats">
          <div><dt>{metric.label}</dt><dd>{formatValue(metric, e.value, period)}</dd></div>
          <div><dt>Rank</dt><dd>#{e.rank}</dd></div>
          <div><dt>Streak</dt><dd>{e.streak ? <Flame streak={e.streak} risk={atRisk(e.streakThrough, e.asOf)} /> : "—"}</dd></div>
          <div><dt>Best streak</dt><dd>{e.bestStreak} {e.bestStreak === 1 ? "day" : "days"}</dd></div>
        </dl>
        <div className="pg-card-actions">
          {e.player.friend && !e.player.you && <button className="pg-enter" disabled={e.cheered} onClick={() => onCheer(e)}><Zap size={14} /> {e.cheered ? "Cheered today" : "Cheer them on"}</button>}
          {!e.player.friend && !e.player.you && (added ? <span className="pg-note">{added}</span> : <button className="pg-enter" onClick={() => void add()}><Users size={14} /> Add friend</button>)}
        </div>
      </div>
    </Modal>
  );
}
