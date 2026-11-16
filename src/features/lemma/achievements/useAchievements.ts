// Where every achievement stands, worked out from this computer's data: the
// Playground's days (each area's activity, day by day), Lemma's look, friends
// and secrets found. Nothing is stored yet, so it's always up to date and
// counts everything done before achievements existed.
import { useEffect, useMemo, useState } from "react";
import { EXTENSIONS } from "../../../extensions";
import { useInstalled } from "../../../shell/useInstalled";
import { isWeb } from "../../../lib/platform";
import { getDays } from "../../playground/api";
import { RULES } from "../../playground/rules";
import { usePlayground } from "../../playground/store";
import { STANDARD, useLook, type Look } from "../look";
import { ACHIEVEMENTS, AREAS, type Achievement, type Known } from "./catalog";
import { progressOf, type Progress } from "./progress";
import { useSecrets } from "./secrets";

export type State =
  | { kind: "soon" }
  | { kind: "unknown"; why: string }
  | ({ kind: "counted"; count: number } & Progress);

export interface Standing { achievement: Achievement; state: State }
export interface AreaStanding { area: string; standings: Standing[] }

/** The web can't read encrypted areas, so these aren't counted there (see src/web/commands/playground.ts). */
const NOT_ON_WEB = ["active", "journal.days", "goals.checkins"];
const LOOKS: (keyof Look)[] = ["glow", "shell", "shape", "accessory", "facewear", "neckwear", "finish", "holding"];

export function stateOf(a: Achievement, known: Known | null): State {
  if (!a.count) return { kind: "soon" };
  const count = known ? a.count(known) : undefined;
  if (count === undefined) return known ? { kind: "unknown", why: a.unknown ?? "Not counted here yet." } : { kind: "unknown", why: "Counting…" };
  return { kind: "counted", count, ...progressOf(count, a.levels) };
}

export function useAchievements() {
  const [days, setDays] = useState<Known["days"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const look = useLook();
  const secrets = useSecrets();
  const { me, friends } = usePlayground();
  const { isOn } = useInstalled();

  useEffect(() => {
    let live = true;
    getDays().then(
      (all) => {
        if (!live) return;
        // A metric with no days yet still counts, as 0.
        const known: Known["days"] = { ...all };
        for (const rule of RULES) known[rule.id] ??= {};
        if (isWeb) for (const metric of NOT_ON_WEB) delete known[metric];
        setDays(known);
      },
      (e) => live && setError(String(e)),
    );
    return () => { live = false; };
  }, []);

  const known: Known | null = useMemo(() => days && {
    days,
    lookChanged: LOOKS.some((k) => look[k] !== STANDARD[k]),
    friends: me && friends ? friends.friends.length : undefined,
    secrets,
  }, [days, look, me, friends, secrets]);

  const areas: AreaStanding[] = useMemo(() => {
    const on = (area: string) => area === "axiom" || EXTENSIONS.some((e) => e.id === area && isOn(e));
    return AREAS.filter(on).map((area) => ({
      area,
      standings: ACHIEVEMENTS.filter((a) => a.area === area).map((achievement) => ({ achievement, state: stateOf(achievement, known) })),
    }));
  }, [known, isOn]);

  return { areas, loading: !days && !error, error };
}
