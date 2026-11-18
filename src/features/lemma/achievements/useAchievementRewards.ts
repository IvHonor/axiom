import { useEffect, useSyncExternalStore } from "react";
import { isWeb } from "../../../lib/platform";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { useDataChanged } from "../../../lib/sync";
import { getDays } from "../../playground/api";
import { useAccount } from "../../../shell/useAccount";
import { ACHIEVEMENTS } from "./catalog";

const KEY = "axiom.achievements.rewards";
const ALL_REWARDS = ACHIEVEMENTS.flatMap(a => a.reward ? [a.reward.id] : []);
const parse = (raw: unknown): string[] => Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => ACHIEVEMENTS.some(a => a.reward?.id === id)))] : [];
let rewards = parse(readSetting(KEY));
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;

function remember(next: string[]) {
  if (next.length === rewards.length && next.every(id => rewards.includes(id))) return;
  rewards = next;
  listeners.forEach(listener => listener());
}

onSettingSynced(KEY, raw => {
  const incoming = parse(raw);
  remember([...new Set([...rewards, ...incoming])]);
  // An older device's profile must not erase a reward already earned here.
  if (rewards.length > incoming.length) saveSetting(KEY, rewards);
});

/** Historical activity grants these once; a broken streak or deleted entry never revokes them. */
function refresh() {
  if (isWeb) return; // Desktop activity is encrypted; earned rewards sync through the profile.
  pending ??= getDays().then(days => {
    if (!days?.active) return;
    const known = { days, lookChanged: false, secrets: [] };
    const earned = ACHIEVEMENTS.filter(a => a.reward && (a.count?.(known) ?? 0) >= a.levels[0]).map(a => a.reward!.id);
    const next = [...new Set([...rewards, ...earned])];
    if (next.length === rewards.length) return;
    remember(next);
    saveSetting(KEY, rewards);
  }).catch(() => {}).finally(() => { pending = null; });
}

export function useAchievementRewards(enabled = true): readonly string[] {
  const [account] = useAccount();
  const unlocked = useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => rewards);
  useEffect(() => { if (enabled) refresh(); }, [enabled]);
  useDataChanged(() => { if (enabled) refresh(); });
  // Admin access is temporary; only genuinely earned rewards are saved.
  return account?.state === "signed_in" && account.admin ? ALL_REWARDS : unlocked;
}
