// The achievements, on Lemma's page in place of the chat: a short summary, what's
// closest, and one tile per area. A tile opens that area's achievements in a
// pop-out. Each step earns a medal, and one step of some achievements a reward.
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { Award, Check, ChevronRight, Compass, Glasses, Hand, Layers, Lock, MessageCircle, Sparkles, Medal, X } from "lucide-react";
import { findExtension } from "../../../extensions";
import { Modal } from "../../../shell/ui/Modal";
import { useAccount } from "../../../shell/useAccount";
import { TieIcon, TopHatIcon } from "../wearIcons";
import { INTERVIEW_SECRET, REWARD_KINDS, rewardsOf, type Achievement, type RewardId, type RewardKind } from "./catalog";
import { Interview } from "./Interview";
import { TIERS, tierOf } from "./progress";
import { useAchievements, type Standing } from "./useAchievements";
import { currentRewards, useAchievementRewards } from "./useAchievementRewards";
import "./achievements.css";

const areaName = (area: string) => (area === "axiom" ? "Axiom" : findExtension(area)?.name ?? area);
const areaIcon = (area: string) => (area === "axiom" ? Compass : findExtension(area)?.icon ?? Sparkles);
const areaColor = (area: string) => (area === "axiom" ? "var(--accent)" : findExtension(area)?.color ?? "var(--accent)");
const areaStyle = (area: string) => ({ "--area": areaColor(area) }) as CSSProperties;
const reachedOf = ({ state }: Standing) => (state.kind === "counted" ? state.reached : 0);
const stepsIn = (standings: Standing[]) => standings.reduce((n, s) => n + s.achievement.levels.length, 0);
const doneIn = (standings: Standing[]) => standings.reduce((n, s) => n + reachedOf(s), 0);
const fmt = (a: Achievement, n: number) => (a.format ? a.format(n) : Math.round(n).toLocaleString("en-GB"));
const compact = new Intl.NumberFormat("en-GB", { notation: "compact" });
/** A step's number, short enough to sit under its marker. */
const stepLabel = (a: Achievement, n: number) => (a.format ? a.format(n) : compact.format(n));

/** The same icon and name for every reward of a kind, wherever it appears. */
const KINDS: Record<RewardKind, { name: string; Icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  headwear: { name: "Headwear", Icon: TopHatIcon },
  neckwear: { name: "Neckwear", Icon: TieIcon },
  facewear: { name: "Facewear", Icon: Glasses },
  holding: { name: "Held item", Icon: Hand },
  material: { name: "Material", Icon: Layers },
  glow: { name: "Glow", Icon: Sparkles },
  personality: { name: "Personality", Icon: MessageCircle },
};

type Previews = Partial<Record<RewardId, string>>;

/** Pictures of an area's rewards; the 3D code only loads once one is wanted. */
function useRewardPreviews(standings: Standing[] | undefined): Previews {
  const [previews, setPreviews] = useState<Previews>({});
  const ids = (standings ?? []).flatMap((s) => (s.achievement.secret && !reachedOf(s) ? [] : rewardsOf(s.achievement).map((reward) => reward.id)));
  const wanted = ids.join(" ");
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void import("../rewardPreview")
      .then(({ rewardPreviews }) => rewardPreviews(wanted.split(" ") as RewardId[]))
      .then((made) => { if (live) setPreviews((known) => ({ ...known, ...made })); })
      .catch(() => {}); // Without 3D graphics, each reward keeps its kind's icon.
    return () => { live = false; };
  }, [wanted]);
  return previews;
}

export function Achievements({ onClose }: { onClose: () => void }) {
  const { areas, loading, error, bookFinished, secrets } = useAchievements();
  const answered = secrets.includes(INTERVIEW_SECRET);
  const [interview, setInterview] = useState<"first" | "replay" | "dismissed" | null>(null);
  // Finishing a certain book brings the shadow, the next time you come here.
  useEffect(() => { if (bookFinished && !answered && interview === null) setInterview("first"); }, [bookFinished, answered, interview]);
  // Subscribes, so a reward earned while this is open shows straight away.
  useAchievementRewards();
  const [account] = useAccount();
  const admin = account?.state === "signed_in" && account.admin;
  const earnedRewards = currentRewards(false);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const opened = areas.find(({ area }) => area === openArea);
  const previews = useRewardPreviews(opened?.standings);
  const all = useMemo(() => areas.flatMap((a) => a.standings), [areas]);
  const steps = stepsIn(all), done = doneIn(all);
  const byTier = TIERS.map((tier) => all.filter((s) => tierOf(reachedOf(s), s.achievement.levels.length) === tier).length);
  const rewardsIn = (standings: Standing[]) => standings.flatMap((s) => rewardsOf(s.achievement));
  // Closest to their next step: the ones worth a push.
  const next = all
    .filter((s) => s.state.kind === "counted" && s.state.target !== null && s.state.fraction > 0 && !s.achievement.secret)
    .sort((a, b) => (b.state.kind === "counted" ? b.state.fraction : 0) - (a.state.kind === "counted" ? a.state.fraction : 0))
    .slice(0, 3);
  const OpenIcon = opened ? areaIcon(opened.area) : null;

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
            <strong>{done}</strong>
            <span>of {steps} steps done</span>
            <div className="ach-bar" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={steps} aria-valuenow={done}><i style={{ width: `${steps ? (done / steps) * 100 : 0}%` }} /></div>
          </div>
          <ul className="ach-tiers" aria-label="Highest medals reached">
            {TIERS.map((tier, i) => <li key={tier} data-tier={tier}><Medal size={16} aria-hidden="true" /><b>{byTier[i]}</b><span>{tier}</span></li>)}
          </ul>
        </div>
        {error && <p className="ach-note" role="alert">Couldn't count your achievements: {error}</p>}
        {loading && <p className="ach-note" role="status">Counting…</p>}

        <section className="ach-area" aria-label="Areas">
          <h3>Areas</h3>
          <ul className="ach-tiles">
            {areas.map(({ area, standings }) => {
              const Icon = areaIcon(area);
              const got = doneIn(standings), of = stepsIn(standings);
              const rewards = rewardsIn(standings);
              return (
                <li key={area} style={areaStyle(area)}>
                  <button type="button" className="ach-tile" aria-haspopup="dialog" data-complete={(of > 0 && got === of) || undefined} onClick={() => setOpenArea(area)}>
                    <span className="ach-tile-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
                    <span className="ach-tile-text">
                      <strong>{areaName(area)}</strong>
                      <small>{got} of {of} steps{rewards.length > 0 && ` · ${rewards.filter((reward) => earnedRewards.includes(reward.id)).length} of ${rewards.length} rewards`}</small>
                      <span className="ach-bar" aria-hidden="true"><i style={{ width: `${of ? (got / of) * 100 : 0}%` }} /></span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {next.length > 0 && (
          <section className="ach-area" aria-label="Next up">
            <h3>Next up</h3>
            <ul className="ach-next">
              {next.map((s) => {
                const { achievement: a, state } = s;
                if (state.kind !== "counted" || state.target === null) return null;
                return (
                  <li key={a.id} style={areaStyle(a.area)}>
                    <button type="button" aria-haspopup="dialog" onClick={() => setOpenArea(a.area)}>
                      <span><strong>{a.name}</strong><small>{areaName(a.area)}</small></span>
                      <small className="ach-next-count">{fmt(a, state.count)} / {fmt(a, state.target)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {opened && OpenIcon && (
        <Modal title={areaName(opened.area)} icon={<OpenIcon size={16} strokeWidth={1.75} />} onClose={() => setOpenArea(null)} width={860}>
          <div className="ach ach-popup" style={areaStyle(opened.area)}>
            <p className="ach-how"><Medal size={14} aria-hidden="true" /> Every step earns a medal, and the step showing an item's icon earns that item. Press a step to see what it takes.</p>
            <ul className="ach-grid">{opened.standings.map((s) => <Card key={s.achievement.id} standing={s} earnedRewards={earnedRewards} admin={admin} previews={previews} onReplay={s.achievement.reward?.id === "true-compass" ? () => { setOpenArea(null); setInterview("replay"); } : undefined} />)}</ul>
          </div>
        </Modal>
      )}
      {(interview === "first" || interview === "replay") && <Interview replay={interview === "replay"} onClose={() => setInterview("dismissed")} />}
    </section>
  );
}

function Card({ standing: { achievement: a, state }, earnedRewards, admin, previews, onReplay }: { standing: Standing; earnedRewards: readonly string[]; admin: boolean; previews: Previews; onReplay?: () => void }) {
  const items = rewardsOf(a);
  const reached = state.kind === "counted" ? state.reached : 0;
  const tier = tierOf(reached, a.levels.length);
  const hidden = a.secret && !reached;
  const complete = state.kind === "counted" && state.target === null;
  const many = a.levels.length > 1;
  const [picked, setPicked] = useState<number | null>(null);
  const last = a.levels.length - 1;
  // The step being read: the one pressed, or else the next to do (the last once they're all done).
  const shown = picked ?? (state.kind === "counted" ? Math.min(reached, last) : last);
  const level = a.levels[shown], from = shown ? a.levels[shown - 1] : 0;
  const goal = hidden ? "A secret. Keep exploring." : a.goal(level);
  const count = state.kind === "counted" ? state.count : null;
  const stepDone = count !== null && count >= level;
  const fraction = count === null ? 0 : Math.max(0, Math.min(1, (count - from) / (level - from)));
  // The item for the step being read, or the achievement's one item.
  const item = items.find((reward) => reward.target === level) ?? (items.length === 1 ? items[0] : undefined);
  const kind = item && KINDS[REWARD_KINDS[item.id]];
  const earned = !!item && earnedRewards.includes(item.id);
  const stepName = many && item ? `Step ${a.levels.indexOf(item.target) + 1} reward` : "Reward";
  return (
    <li className="ach-card" data-tier={tier ?? undefined} data-state={state.kind} data-complete={complete || undefined}>
      <span className="ach-medal" aria-hidden="true">{hidden || state.kind === "soon" ? <Lock size={18} /> : <Medal size={20} />}</span>
      <div className="ach-body">
        <strong>{hidden ? "???" : a.name}</strong>
        <span className="ach-goal" aria-live="polite">{goal}</span>
        {count !== null && !hidden && (picked !== null || !complete) && (
          <>
            <div className="ach-bar" role="progressbar" aria-label={`${a.name} progress`} aria-valuemin={0} aria-valuemax={level} aria-valuenow={Math.min(count, level)}><i style={{ width: `${fraction * 100}%` }} /></div>
            <small>{many && `Step ${shown + 1} of ${a.levels.length} · `}{stepDone ? "Done" : `${fmt(a, count)} / ${fmt(a, level)}`}</small>
          </>
        )}
        {complete && picked === null && <small className="ach-done">{many ? "Every step done" : "Done"}</small>}
        {state.kind === "soon" && <small className="ach-tag">Coming soon</small>}
        {state.kind === "unknown" && <small>{state.why}</small>}
        {many && !hidden && (
          <ol className="ach-steps" aria-label={`Steps for ${a.name}`}>
            {a.levels.map((step, i) => {
              const finished = i < reached, gives = items.find((reward) => reward.target === step);
              const givesKind = gives && KINDS[REWARD_KINDS[gives.id]];
              return (
                <li key={step} data-tier={TIERS[i]} data-done={finished || undefined} data-current={(state.kind === "counted" && i === reached) || undefined} data-reward={!!gives || undefined} data-kind={gives ? REWARD_KINDS[gives.id] : undefined} data-picked={picked === i || undefined}>
                  {/* Pressing a step previews it; pressing it again goes back to the current one. */}
                  <button type="button" className="ach-step" aria-pressed={picked === i} aria-label={`Step ${i + 1}: ${a.goal(step)}${finished ? ", done" : ""}${gives ? `. Earns ${gives.name}` : ""}`} title={`Step ${i + 1}: ${a.goal(step)}${gives ? ` · ${gives.name}` : ""}`} onClick={() => setPicked(picked === i ? null : i)}>
                    <span className="ach-step-mark" aria-hidden="true">{finished ? <Check size={11} strokeWidth={3} /> : givesKind ? <givesKind.Icon size={12} strokeWidth={2} /> : i + 1}</span>
                    <span className="ach-step-count" aria-hidden="true">{stepLabel(a, step)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {item && kind && !hidden && (
          <div className="ach-reward" data-unlocked={earned || undefined}>
            <span className="ach-reward-art" data-kind={REWARD_KINDS[item.id]}>
              {previews[item.id] ? <img src={previews[item.id]} alt={`${item.name} preview`} /> : <kind.Icon size={18} strokeWidth={1.75} />}
              {earned && <i aria-hidden="true"><Award size={10} /></i>}
            </span>
            <small>
              <b>{item.name}</b>
              <span>{kind.name} · {earned ? "earned" : `${stepName}: ${a.goal(item.target)}`}{!earned && admin && " · already available to admins"}</span>
            </small>
          </div>
        )}
        {onReplay && !hidden && <button type="button" className="btn btn-sm ach-replay" onClick={onReplay}>Replay The Interview</button>}
      </div>
    </li>
  );
}
