// A pretend Playground server for the browser previews: five friends with
// different AIs and pictures, streaks at every flame tier, cheers, requests,
// boards, and a live Hub. ?new: no handle yet. ?handle: a handle for friends,
// not on the boards. ?lonely: no friends.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Board, BoardEntry, Friends, Player, PlaygroundMe } from "../src/features/playground/api";
import { dayKey, addDays } from "../src/features/playground/stats";

export const query = new URLSearchParams(location.search);
const today = dayKey(new Date());
const calls: { command: string; args: unknown }[] = [];
(window as unknown as { calls: typeof calls }).calls = calls;

const player = (id: string, handle: string, name: string | null, look: Record<string, string>, lemma: string, personality: string, extra: Partial<Player> = {}): Player => ({
  userId: id, handle, name, lemma: { look, name: lemma, personality }, perks: { admin: false, firstLight: true }, you: false, friend: true, ...extra,
});
const you = player("u-me", "danial", "Danial", { glow: "#2ec4ff", shape: "orb", accessory: "headphones", holding: "coffee" }, "Pixel", "witty", { you: true, friend: false });
const people = [
  player("u-ada", "ada_l", "Ada Lovelace", { glow: "#ff5c8a", shape: "prism", accessory: "crown", facewear: "glasses", finish: "glass" }, "Babbage", "cheerful"),
  you,
  player("u-sam", "sam", "Sam", { glow: "#3ddc84", shape: "drop", accessory: "beanie", holding: "plant" }, "", "coach"),
  player("u-kai", "kai", null, { glow: "#ffb627", shape: "pyramid", accessory: "halo", neckwear: "bow" }, "Orbit", "calm"),
  player("u-ren", "ren", "Ren", { glow: "#a77bff", shape: "orb", facewear: "sunglasses", finish: "metal" }, "Nova", "direct"),
];
const values = [41, 33, 28, 12, 5];
const streaks = [142, 9, 34, 3, 1];
const entries: BoardEntry[] = people.map((p, i) => ({
  rank: i + 1, player: p, value: values[i], previous: Math.round(values[i] * 0.8), streak: streaks[i], bestStreak: streaks[i] + 4,
  streakThrough: i === 3 ? addDays(today, -1) : today, asOf: today, cheered: i === 2,
}));

const me: PlaygroundMe = { player: you, inPlayground: !query.has("handle"), global: false, shared: ["active", "reading.pages", "reading.books", "learning.minutes", "daily_plan.focus", "journal.days", "project_board.done"], friendCode: "K7Q2M9XD", joinedAt: "2026-11-01T10:00:00Z", cheersThisWeek: 4, requests: 1 };
if (query.has("persist")) {
  const stored = sessionStorage.getItem("playground.mock.me");
  if (stored) Object.assign(me, JSON.parse(stored));
}
const persistMe = () => { if (query.has("persist")) sessionStorage.setItem("playground.mock.me", JSON.stringify(me)); };
const friends: Friends = query.has("lonely") ? { friends: [], incoming: [], outgoing: [] } : {
  friends: people.filter((p) => !p.you).map((p, i) => ({ player: p, since: "2026-11-02T10:00:00Z", streak: [142, 34, 3, 1][i], streakThrough: today, asOf: today, cheered: i === 1, cheeredYou: i === 0 })),
  incoming: [{ player: player("u-mo", "mo_codes", "Mo", { glow: "#ff5a3c", shape: "prism" }, "", "standard", { friend: false }), sentAt: "2026-11-12T10:00:00Z" }],
  outgoing: [{ player: player("u-lu", "lu", null, { glow: "#f2f2f4", shape: "drop" }, "", "calm", { friend: false }), sentAt: "2026-11-11T10:00:00Z" }],
};

function board(args: { metric: string; period: string; scope: string }): Board {
  const lonely = query.has("lonely");
  const eligible = entries.filter(e => !e.player.you || (me.inPlayground && me.shared.includes(args.metric)));
  const list = lonely ? eligible.filter((e) => e.player.you).map((e) => ({ ...e, rank: 1 })) : eligible;
  const scoped = args.scope === "global" ? list.map((e) => ({ ...e, player: { ...e.player, friend: false } })).filter((e) => !e.player.you) : list;
  const ranked = args.period === "streak" ? [...scoped].sort((a, b) => b.streak - a.streak).map((e, i) => ({ ...e, value: e.streak, rank: i + 1 })) : scoped;
  for (const e of ranked) e.cheered = cheered.has(e.player.userId);
  return {
    metric: args.metric, period: args.period as Board["period"], scope: args.scope as Board["scope"], entries: ranked,
    you: args.scope === "global" && me.inPlayground && me.shared.includes(args.metric) ? { ...entries[1], rank: 2 } : null, joined: me.inPlayground && me.shared.includes(args.metric) && (args.scope !== "global" || me.global), players: ranked.length,
    champion: args.period === "week" && !lonely ? { ...entries[2], value: 47, previous: null } : null,
  };
}

// Pretend profile pictures, drawn here: a face-ish blob on a colour.
function picture(hue: number, ink: string): string {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = `hsl(${hue} 55% 42%)`;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = `hsl(${hue} 40% 78%)`;
  g.beginPath(); g.arc(64, 52, 26, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(64, 128, 46, 40, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = ink;
  g.fillRect(52, 48, 6, 6); g.fillRect(70, 48, 6, 6);
  return c.toDataURL("image/png");
}
const pictures: Record<string, string> = { "u-ada": picture(330, "#3a1020"), "u-me": picture(205, "#0d2233"), "u-sam": picture(140, "#0f2a17"), "u-ren": picture(265, "#1d1033") };
for (const p of [...people, you]) p.avatar = pictures[p.userId] ? `v-${p.userId}` : null;

// A pretend live Nexus: friends wander about the Nexus near where you arrive,
// Ren reads in a nook inside the Great Library (seen only once you go in), Sam
// dances now and then, and Ada says hi to you on your second check-in.
// Positions are metres on the city map (or from a building's middle), like the
// real thing.
const DISTRICT_HEARTS: [string, number, number, number][] = [["nexus", 0, 0, 52], ["memory", -145, -78, 62], ["computation", 145, -78, 62], ["simulation", 132, 120, 62], ["gardens", -132, 120, 62]];
const hub = {
  syncs: 0,
  where: new Map<string, { x: number; z: number; inside: string | null }>([
    ["u-ada", { x: -14, z: 36, inside: null }], ["u-sam", { x: 16, z: 30, inside: null }],
    ["u-kai", { x: 8, z: 44, inside: null }], ["u-ren", { x: -18.5, z: 13, inside: "library" }],
  ]),
};
const INSIDE_OF: Record<string, string> = { library: "memory", core: "computation", observatory: "simulation", forge: "gardens" };
const hubState = (x: number, z: number, inside: string | null = null) => {
  hub.syncs++;
  for (const [id, w] of hub.where) if (id !== "u-ren") hub.where.set(id, { ...w, x: Math.min(30, Math.max(-30, w.x + (Math.random() - 0.5) * 7)), z: Math.min(48, Math.max(20, w.z + (Math.random() - 0.5) * 6)) });
  const near = people.filter((p) => {
    const w = !p.you && hub.where.get(p.userId);
    return !!w && w.inside === inside && Math.hypot(w.x - x, w.z - z) <= 200;
  });
  const here = near.map((p) => ({ player: { ...p, friend: false }, x: hub.where.get(p.userId)!.x, z: hub.where.get(p.userId)!.z, shown: p.userId === "u-sam" && hub.syncs % 4 === 0 ? { kind: "emote", id: "dance", age: 200, to: null } : p.userId === "u-ada" && hub.syncs === 2 ? { kind: "phrase", id: "hi", age: 100, to: "u-me" } : p.userId === "u-ren" && hub.syncs % 5 === 0 ? { kind: "phrase", id: "reading", age: 100, to: null } : null }));
  const all = [...hub.where.values(), { x, z, inside }];
  const districts = DISTRICT_HEARTS.map(([id, cx, cz, r]) => ({ id, count: all.filter((w) => (w.inside ? INSIDE_OF[w.inside] === id : Math.hypot(w.x - cx, w.z - cz) <= r)).length }));
  return { people: here, districts, online: hub.where.size + 1, events: hub.syncs === 2 ? [{ id: 1, from: people[0], kind: "phrase", item: "hi" }] : [] };
};
const num = (v: unknown) => Number(v) || 0;

let joined = !query.has("new");
const cheered = new Set<string>(["u-sam"]);
let boardAttempts = 0;
let releasePublish: (() => void) | null = null;
let holdNextMe = false;
let releaseRefresh: (() => void) | null = null;
mockWindows("main");
mockIPC((command, args) => {
  calls.push({ command, args });
  const a = args as Record<string, string>;
  switch (command) {
    case "account_status": return { state: "signed_in", email: "me@example.com", admin: false, createdAt: "2026-10-01T00:00:00Z" };
    case "account_profile": return { displayName: "Danial Rahmani", avatar: null };
    case "playground_me": {
      const value = joined ? structuredClone(me) : null;
      if (holdNextMe) {
        holdNextMe = false;
        return new Promise(resolve => { releaseRefresh = () => resolve(value); });
      }
      return value;
    }
    case "playground_save": {
      if (query.has("saveerror")) throw new Error("Could not save sharing preferences");
      joined = true;
      me.inPlayground = (args as { playground: boolean }).playground;
      me.global = me.inPlayground && !!(args as { global: boolean }).global;
      me.shared = me.inPlayground ? [...(args as { shared: string[] }).shared] : [];
      me.player = { ...me.player, handle: a.handle };
      persistMe();
      return structuredClone(me);
    }
    case "playground_leave": me.inPlayground = false; me.global = false; me.shared = []; persistMe(); return null;
    case "playground_friends": return structuredClone(friends);
    case "playground_board":
      if (query.has("boarderror") && boardAttempts++ === 0) throw new Error("Rankings temporarily unavailable");
      return board(a as never);
    case "playground_days": return { active: { [today]: 1 }, "reading.pages": { [today]: 30 } };
    case "playground_publish":
      if (query.has("slowpublish")) return new Promise(resolve => { releasePublish = () => resolve({ saved: 2, refused: [] }); });
      return { saved: 2, refused: [] };
    case "playground_cheer": cheered.add(a.userId); friends.friends = friends.friends.map(f => f.player.userId === a.userId ? { ...f, cheered: true } : f); return null;
    case "playground_avatar": return { avatar: pictures[a.userId] ?? null };
    case "hub_peek": { const s = hubState(0, 30); return { online: 4, districts: s.districts, nexus: s.people.filter((p) => Math.hypot(p.x, p.z) <= 52) }; }
    case "hub_enter": hub.syncs = 0; return hubState(num(a.x), num(a.z), a.inside ?? null);
    case "hub_sync": return hubState(num(a.x), num(a.z), a.inside ?? null);
    case "hub_act": case "hub_leave": return null;
    case "playground_accept": {
      const request = friends.incoming.find(r => r.player.userId === a.userId);
      if (request) { friends.incoming = friends.incoming.filter(r => r !== request); friends.friends.push({ player: request.player, since: today, streak: 0, streakThrough: null, asOf: today, cheered: false, cheeredYou: false }); }
      return null;
    }
    case "playground_remove": friends.friends = friends.friends.filter(f => f.player.userId !== a.userId); friends.incoming = friends.incoming.filter(f => f.player.userId !== a.userId); friends.outgoing = friends.outgoing.filter(f => f.player.userId !== a.userId); return null;
    case "playground_new_code": me.friendCode = "NEWCODE1"; return structuredClone(me);
    case "playground_add_friend": return { outcome: "requested", player: friends.incoming[0]?.player ?? you };
    default: return null;
  }
});


(window as unknown as { playgroundMock: unknown }).playgroundMock = {
  rank(rank: number) { entries.find(e => e.player.you)!.rank = rank; },
  cheerYou() { friends.friends[1].cheeredYou = true; },
  releasePublish() { releasePublish?.(); },
  holdRefresh() { holdNextMe = true; },
  releaseRefresh() { releaseRefresh?.(); },
};
