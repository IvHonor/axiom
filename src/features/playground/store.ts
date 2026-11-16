// The Playground's state for the whole window: you (once you've a handle)
// and your friends, kept in one place so the page, its sidebar, the overview
// tile and the friends button in the top bar agree. Also keeps what others see up to date: your numbers, and your Lemma
// whenever you change how it looks.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { normaliseLook, type Look } from "../lemma/look";
import { normalisePersona } from "../lemma/persona";
import { readSetting } from "../../lib/settings";
import { useAccount } from "../../shell/useAccount";
import { useDataChanged } from "../../lib/sync";
import * as api from "./api";
import { allStats, dayKey } from "./stats";

interface State {
  /** undefined: not asked yet; null: no handle yet (and so no friends). */
  me: api.PlaygroundMe | null | undefined;
  friends: api.Friends | null;
  error: string | null;
}

let state: State = { me: undefined, friends: null, error: null };
const listeners = new Set<() => void>();
const set = (change: Partial<State>) => {
  state = { ...state, ...change };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let loading: Promise<void> | null = null;
let revision = 0;
let refreshRequest = 0;

/** Asks the server again for you and your friends. */
export function refresh(): Promise<void> {
  const version = revision, request = ++refreshRequest;
  loading = (async () => {
    try {
      const me = await api.getMe();
      const friends = me ? await api.getFriends() : null;
      if (version === revision && request === refreshRequest) set({ me, error: null, friends });
    } catch (e) {
      if (version === revision && request === refreshRequest) set({ error: String(e) });
    } finally { if (request === refreshRequest) loading = null; }
  })();
  return loading;
}

export const setMe = (me: api.PlaygroundMe | null) => { revision++; set({ me, friends: me ? state.friends : null }); };
export const setFriends = (friends: api.Friends) => set({ friends });
export const today = () => dayKey(new Date());

/** Your Lemma as everyone will see it: how it looks and who it is right now. */
export function myLemma(): api.LemmaCard {
  const look: Look = normaliseLook(readSetting("axiom.lemma.look"));
  const persona = normalisePersona(readSetting("axiom.lemma.persona"));
  return { look: { ...look } as unknown as Record<string, string>, name: persona.name.trim(), personality: persona.personality };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function usePlayground() {
  const s = useSyncExternalStore(subscribe, () => state);
  const [account] = useAccount();
  const signedIn = account?.state === "signed_in";
  useEffect(() => {
    if (signedIn && s.me === undefined && !loading) void refresh();
    if (!signedIn && account) { revision++; set({ me: undefined, friends: null, error: null }); }
  }, [signedIn, account, s.me]);
  return { ...s, signedIn, refresh: useCallback(() => refresh(), []) };
}

// ---------- Keeping what others see up to date ----------

let lastSent = "";
let sending = false;
let publishing: Promise<api.Published | null> | null = null;
let changingSharing = false;

/** Finish any in-flight publish before changing consent, so it cannot restore old sharing choices. */
export async function changeSharing(audience: string, shared: string[]) {
  if (changingSharing) throw new Error("Sharing preferences are already being saved.");
  const id = state.me?.player.userId;
  if (!id) throw new Error("Pick a handle before joining the leaderboards.");
  changingSharing = true;
  try {
    await publishing;
    const me = state.me;
    if (!me || me.player.userId !== id) throw new Error("Your account changed. Please try again.");
    if (audience === "off") {
      await api.leave();
      setMe({ ...me, inPlayground: false, global: false, shared: [] });
    } else {
      setMe(await api.saveMe(me.player.handle, audience === "global", shared, myLemma(), true));
    }
    lastSent = "";
  } finally { changingSharing = false; }
  if (audience !== "off") await sendStats(true);
  await refresh();
}

/** Keeps your Lemma up to date for friends, and (on the boards) works out
 * your shared numbers and sends them if they've changed. Quiet on failure. */
export function sendStats(force = false): Promise<api.Published | null> {
  if (changingSharing) return Promise.resolve(null);
  if (publishing) return publishing;
  publishing = publishStats(force).finally(() => { publishing = null; });
  return publishing;
}

async function publishStats(force: boolean): Promise<api.Published | null> {
  const me = state.me;
  if (!me || sending) return null;
  sending = true;
  try {
    // Your Lemma follows you: change its look and the Playground sees it.
    const lemma = myLemma();
    if (!same(lemma, me.player.lemma)) setMe(await api.saveMe(me.player.handle, me.global, me.shared, lemma, me.inPlayground));
    if (!me.inPlayground) return null;
    const day = today();
    const stats = allStats(await api.getDays(), me.shared, day);
    const payload = JSON.stringify({ user: me.player.userId, day, stats });
    if (!force && payload === lastSent) return null;
    const published = await api.publish(day, stats);
    lastSent = payload;
    return published;
  } catch {
    return null;
  } finally {
    sending = false;
  }
}

const EVERY = 10 * 60 * 1000;

/** Mounted once (App): sends your numbers soon after starting, every ten minutes, and after synced changes. */
export function usePlaygroundPublisher() {
  const { me, signedIn } = usePlayground();
  const joined = !!me;
  useEffect(() => {
    if (!signedIn || !joined) return;
    const first = window.setTimeout(() => void sendStats(), 15_000);
    const every = window.setInterval(() => void sendStats(), EVERY);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [signedIn, joined]);
  useDataChanged(() => {
    if (!state.me) return;
    window.clearTimeout(changed);
    changed = window.setTimeout(() => void sendStats(), 30_000);
  });
}
let changed = 0;
