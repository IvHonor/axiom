// Typed wrappers for the Playground commands in src-tauri/src/playground.rs.
// The server's types (crates/protocol/src/playground.rs) arrive camelCase,
// exactly as declared here. Each call rejects with a message ready to show.
import { invoke } from "@tauri-apps/api/core";

export type Period = "week" | "month" | "all" | "streak";
export type Scope = "friends" | "global";

/** Someone's Lemma as everyone sees it. `look` is a `Look` (normalise before drawing). */
export interface LemmaCard {
  look: Record<string, string>;
  name: string;
  personality: string;
}

export interface Perks {
  admin: boolean;
  firstLight: boolean;
}

export interface Player {
  userId: string;
  handle: string;
  name: string | null;
  lemma: LemmaCard;
  perks: Perks;
  /** Which picture they have (fetch it with `getAvatar` and keep it); null without one. */
  avatar?: string | null;
  you: boolean;
  friend: boolean;
}

/** You: null until you pick a handle. A handle is enough for friends; boards need `inPlayground`. */
export interface PlaygroundMe {
  player: Player;
  inPlayground: boolean;
  global: boolean;
  shared: string[];
  friendCode: string;
  joinedAt: string;
  cheersThisWeek: number;
  requests: number;
}

/** One metric's numbers, worked out on this device (see stats.ts). */
export interface MetricStats {
  metric: string;
  weekKey: string;
  week: number;
  lastWeek: number;
  monthKey: string;
  month: number;
  lastMonth: number;
  total: number;
  streak: number;
  bestStreak: number;
  streakThrough: string | null;
}

export interface BoardEntry {
  rank: number;
  player: Player;
  value: number;
  previous: number | null;
  streak: number;
  bestStreak: number;
  streakThrough: string | null;
  asOf: string;
  cheered: boolean;
}

export interface Board {
  metric: string;
  period: Period;
  scope: Scope;
  entries: BoardEntry[];
  you: BoardEntry | null;
  joined: boolean;
  players: number;
  champion: BoardEntry | null;
}

export interface Friend {
  player: Player;
  since: string;
  streak: number | null;
  streakThrough: string | null;
  asOf: string | null;
  cheered: boolean;
  cheeredYou: boolean;
}

export interface FriendRequest {
  player: Player;
  sentAt: string;
}

export interface Friends {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** People you've blocked (missing from older servers). */
  blocked?: Player[];
}

export interface Added {
  outcome: "friends" | "requested";
  player: Player;
}

export interface Published {
  saved: number;
  refused: string[];
}

/** Metric id to the amount on each day ("2026-11-13") it happened. */
export type DayCounts = Record<string, Record<string, number>>;

export const getDays = () => invoke<DayCounts>("playground_days");
/** A server from before friends-for-everyone sends no `inPlayground`: then a handle meant being on the boards. */
const withDefaults = (me: PlaygroundMe | null): PlaygroundMe | null => (me ? { ...me, inPlayground: me.inPlayground ?? true } : me);

export const getMe = () => invoke<PlaygroundMe | null>("playground_me").then(withDefaults);
/** `playground` false keeps just the handle and friends, and shares nothing. */
export const saveMe = (handle: string, global: boolean, shared: string[], lemma: LemmaCard, playground = true) =>
  invoke<PlaygroundMe>("playground_save", { playground, handle, global, shared, lemma }).then((me) => withDefaults(me)!);
/** Leaves the boards; your handle and friends stay. */
export const leave = () => invoke<void>("playground_leave");
export const newCode = () => invoke<PlaygroundMe>("playground_new_code").then((me) => withDefaults(me)!);
export const publish = (today: string, stats: MetricStats[]) => invoke<Published>("playground_publish", { today, stats });
export const getBoard = (metric: string, period: Period, scope: Scope, today: string) =>
  invoke<Board>("playground_board", { metric, period, scope, today });
export const getFriends = () => invoke<Friends>("playground_friends");
export const addFriend = (by: { handle?: string; code?: string }) =>
  invoke<Added>("playground_add_friend", { handle: by.handle ?? null, code: by.code ?? null });
export const acceptFriend = (userId: string) => invoke<void>("playground_accept", { userId });
export const removeFriend = (userId: string) => invoke<void>("playground_remove", { userId });
export const cheer = (userId: string) => invoke<void>("playground_cheer", { userId });
/** Unfriends them, drops requests either way, and hides you from each other in Nexus. They aren't told. */
export const block = (userId: string) => invoke<void>("playground_block", { userId });
export const unblock = (userId: string) => invoke<void>("playground_unblock", { userId });
export const getAvatar = (userId: string) => invoke<{ avatar: string | null }>("playground_avatar", { userId }).then((r) => r.avatar);

/** The name to show: their display name, or @handle. */
export const displayName = (p: Player) => p.name?.trim() || `@${p.handle}`;
