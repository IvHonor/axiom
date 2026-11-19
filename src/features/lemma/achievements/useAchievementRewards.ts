import { useEffect, useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { useDataChanged } from "../../../lib/sync";
import { getDays } from "../../playground/api";
import { useAccount } from "../../../shell/useAccount";
import { ACHIEVEMENTS, countsToShare, earnedRewards, mergeSharedCounts, readSharedCounts, rewardsOf, SHARED_COUNTS, type SharedCounts } from "./catalog";
import { currentSecrets, useSecrets } from "./secrets";

const KEY = "axiom.achievements.rewards";
const COUNTS_KEY = "axiom.achievements.counts";
const ALL_REWARDS: string[] = ACHIEVEMENTS.flatMap(a => rewardsOf(a).map(reward => reward.id));
const parse = (raw: unknown): string[] => Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => ALL_REWARDS.includes(id)))] : [];
let rewards = parse(readSetting(KEY));
let counts = readSharedCounts(readSetting(COUNTS_KEY));
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null, again = false;
const tell = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function remember(next: string[]) {
  if (next.length === rewards.length && next.every(id => rewards.includes(id))) return;
  rewards = next;
  tell();
}

const sameCounts = (a: SharedCounts, b: SharedCounts) => SHARED_COUNTS.every(id => a[id] === b[id]);

/** Keeps the best of both, and says whether that's more than `other` holds. */
function rememberCounts(other: SharedCounts) {
  const merged = mergeSharedCounts(counts, other);
  if (!sameCounts(merged, counts)) { counts = merged; tell(); }
  return !sameCounts(merged, other);
}

onSettingSynced(KEY, raw => {
  const incoming = parse(raw);
  remember([...new Set([...rewards, ...incoming])]);
  // An older device's profile must not erase a reward already earned here.
  if (rewards.length > incoming.length) saveSetting(KEY, rewards);
});

onSettingSynced(COUNTS_KEY, raw => {
  if (rememberCounts(readSharedCounts(raw))) saveSetting(COUNTS_KEY, counts);
  // What another device counted can earn items here.
  refreshRewards();
});

/**
 * Historical activity grants these once; a broken streak or deleted entry never
 * revokes them. Each device earns what it can count: the web can't read encrypted
 * areas, so those rewards, and the shared counts, reach it through the profile.
 */
export function refreshRewards() {
  // Something changed while counting: count again afterwards, so it isn't missed.
  if (pending) { again = true; return; }
  pending = getDays().then(days => {
    if (!days) return;
    const known = { days, lookChanged: false, secrets: currentSecrets() };
    const seen = countsToShare(known);
    const before = counts;
    rememberCounts(seen);
    if (counts !== before) saveSetting(COUNTS_KEY, counts);
    const next = [...new Set([...rewards, ...earnedRewards(known, counts)])];
    if (next.length === rewards.length) return;
    remember(next);
    saveSetting(KEY, rewards);
  }).catch(() => {}).finally(() => {
    pending = null;
    if (again) { again = false; refreshRewards(); }
  });
}

/** What's unlocked right now, for code outside React. */
export const currentRewards = (admin: boolean): readonly string[] => admin ? ALL_REWARDS : rewards;

/** Counts shared by the person's other devices (see `SHARED_COUNTS`). */
export const useSharedCounts = (): SharedCounts => useSyncExternalStore(subscribe, () => counts);

/** Admin access is temporary; only genuinely earned rewards are saved. */
export function useAchievementRewards(enabled = true): readonly string[] {
  const [account] = useAccount();
  const unlocked = useSyncExternalStore(subscribe, () => rewards);
  // Secrets count too: a new theme tried or area opened can earn something.
  const secrets = useSecrets();
  useEffect(() => { if (enabled) refreshRewards(); }, [enabled, secrets]);
  useDataChanged(() => { if (enabled) refreshRewards(); });
  return account?.state === "signed_in" && account.admin ? ALL_REWARDS : unlocked;
}
