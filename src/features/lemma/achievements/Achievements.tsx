// The achievements, on Lemma's page in place of the chat: a summary of what's
// earned, what's closest, then every area's achievements with their levels.
// Later, levels unlock Lemma's customisation (see TIER_POINTS).
import { useMemo, type CSSProperties } from "react";
import { Award, Compass, Lock, Medal, Sparkles, X } from "lucide-react";
import { findExtension } from "../../../extensions";
import type { Achievement } from "./catalog";
import { TIERS, tierOf } from "./progress";
import { useAchievements, type Standing } from "./useAchievements";
import "./achievements.css";

const areaName = (area: string) => (area === "axiom" ? "Axiom" : findExtension(area)?.name ?? area);
const areaIcon = (area: string) => (area === "axiom" ? Compass : findExtension(area)?.icon ?? Sparkles);
const areaColor = (area: string) => (area === "axiom" ? "var(--accent)" : findExtension(area)?.color ?? "var(--accent)");
const reachedOf = ({ state }: Standing) => (state.kind === "counted" ? state.reached : 0);
const fmt = (a: Achievement, n: number) => (a.format ? a.format(n) : Math.round(n).toLocaleString("en-GB"));

export function Achievements({ onClose }: { onClose: () => void }) {
  const { areas, loading, error } = useAchievements();
  const all = useMemo(() => areas.flatMap((a) => a.standings), [areas]);
  const levels = all.reduce((n, s) => n + s.achievement.levels.length, 0);
  const earned = all.reduce((n, s) => n + reachedOf(s), 0);
  const byTier = TIERS.map((tier) => all.filter((s) => tierOf(reachedOf(s), s.achievement.levels.length) === tier).length);
  // Closest to their next level: the ones worth a push.
  const next = all
    .filter((s) => s.state.kind === "counted" && s.state.target !== null && s.state.fraction > 0 && !s.achievement.secret)
    .sort((a, b) => (b.state.kind === "counted" ? b.state.fraction : 0) - (a.state.kind === "counted" ? a.state.fraction : 0))
    .slice(0, 3);

  return (
    <section className="lemma-main ach" aria-label="Achievements">
      <header className="lemma-head">
        <Award size={18} strokeWidth={1.75} />
        <h2>Achievements</h2>
        <button className="icon-btn" onClick={onClose} title="Back to chats" aria-label="Back to chats"><X size={15} strokeWidth={1.75} /></button>
      </header>
      <div className="ach-scroll">
        <div className="ach-summary">
          <div className="ach-total">
            <strong>{earned}</strong>
            <span>of {levels} levels earned</span>
            <div className="ach-bar" role="progressbar" aria-label="Levels earned" aria-valuemin={0} aria-valuemax={levels} aria-valuenow={earned}><i style={{ width: `${levels ? (earned / levels) * 100 : 0}%` }} /></div>
          </div>
          <ul className="ach-tiers" aria-label="Highest levels reached">
            {TIERS.map((tier, i) => <li key={tier} data-tier={tier}><Medal size={16} aria-hidden="true" /><b>{byTier[i]}</b><span>{tier}</span></li>)}
          </ul>
        </div>
        {error && <p className="ach-note" role="alert">Couldn't count your achievements: {error}</p>}
        {loading && <p className="ach-note" role="status">Counting…</p>}

        {next.length > 0 && (
          <section className="ach-area" aria-label="Next up">
            <h3><Sparkles size={15} /> Next up</h3>
            <ul className="ach-grid">{next.map((s) => <Card key={s.achievement.id} standing={s} showArea />)}</ul>
          </section>
        )}

        <nav className="ach-jump" aria-label="Areas">
          {areas.map(({ area }) => { const Icon = areaIcon(area); return <a key={area} href={`#ach-${area}`} style={{ "--area": areaColor(area) } as CSSProperties} onClick={(e) => { e.preventDefault(); document.getElementById(`ach-${area}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><Icon size={13} /> {areaName(area)}</a>; })}
        </nav>

        {areas.map(({ area, standings }) => {
          const Icon = areaIcon(area);
          const got = standings.reduce((n, s) => n + reachedOf(s), 0);
          const of = standings.reduce((n, s) => n + s.achievement.levels.length, 0);
          return (
            <section key={area} id={`ach-${area}`} className="ach-area" aria-label={areaName(area)} style={{ "--area": areaColor(area) } as CSSProperties}>
              <h3><Icon size={15} /> {areaName(area)} <small>{got} of {of} levels</small></h3>
              <ul className="ach-grid">{standings.map((s) => <Card key={s.achievement.id} standing={s} />)}</ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Card({ standing: { achievement: a, state }, showArea }: { standing: Standing; showArea?: boolean }) {
  const reached = state.kind === "counted" ? state.reached : 0;
  const tier = tierOf(reached, a.levels.length);
  const hidden = a.secret && !reached;
  const complete = state.kind === "counted" && state.target === null;
  // The goal for the next level, or the last one once they're all earned.
  const goal = hidden ? "A secret. Keep exploring." : a.goal(state.kind === "counted" && state.target !== null ? state.target : a.levels[a.levels.length - 1]);
  return (
    <li className="ach-card" data-tier={tier ?? undefined} data-state={state.kind} data-complete={complete || undefined} style={showArea ? { "--area": areaColor(a.area) } as CSSProperties : undefined}>
      <span className="ach-medal" aria-hidden="true">{hidden || state.kind === "soon" ? <Lock size={18} /> : <Medal size={20} />}</span>
      <div className="ach-body">
        <strong>{hidden ? "???" : a.name}{showArea && <em>{areaName(a.area)}</em>}</strong>
        <span className="ach-goal">{goal}</span>
        {state.kind === "counted" && !complete && !hidden && state.target !== null && (
          <>
            <div className="ach-bar" role="progressbar" aria-label={`${a.name} progress`} aria-valuemin={0} aria-valuemax={state.target} aria-valuenow={Math.min(state.count, state.target)}><i style={{ width: `${state.fraction * 100}%` }} /></div>
            <small>{fmt(a, state.count)} / {fmt(a, state.target)}</small>
          </>
        )}
        {complete && <small className="ach-done">{a.levels.length > 1 ? "Every level earned" : "Earned"}</small>}
        {state.kind === "soon" && <small className="ach-tag">Coming soon</small>}
        {state.kind === "unknown" && <small>{state.why}</small>}
      </div>
      {a.levels.length > 1 && (
        <span className="ach-pips" role="img" aria-label={`Level ${reached} of ${a.levels.length}`}>
          {a.levels.map((_, i) => <i key={i} data-tier={TIERS[i]} data-on={i < reached || undefined} />)}
        </span>
      )}
    </li>
  );
}
