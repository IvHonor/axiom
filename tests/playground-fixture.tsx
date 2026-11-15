// The real Playground page, sidebar and tile against a pretend server: four
// friends with different Lemmas, streaks at every flame tier, cheers, and a
// global board. ?new: no handle yet. ?handle: a handle for friends, not on
// the boards. ?lonely: no friends. ?phone: the page alone.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { PlaygroundView } from "../src/features/playground/PlaygroundView";
import { PlaygroundSidebar } from "../src/features/playground/PlaygroundSidebar";
import { PlaygroundSummary } from "../src/features/playground/PlaygroundSummary";
import { FriendsButton } from "../src/shell/friends/FriendsButton";
import type { Board, BoardEntry, Friends, Player, PlaygroundMe } from "../src/features/playground/api";
import { dayKey, addDays } from "../src/features/playground/stats";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/lemma/lemma.css";
import "../src/features/playground/playground.css";

const query = new URLSearchParams(location.search);
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
const friends: Friends = query.has("lonely") ? { friends: [], incoming: [], outgoing: [] } : {
  friends: people.filter((p) => !p.you).map((p, i) => ({ player: p, since: "2026-11-02T10:00:00Z", streak: [142, 34, 3, 1][i], streakThrough: today, asOf: today, cheered: i === 1, cheeredYou: i === 0 })),
  incoming: [{ player: player("u-mo", "mo_codes", "Mo", { glow: "#ff5a3c", shape: "prism" }, "", "standard", { friend: false }), sentAt: "2026-11-12T10:00:00Z" }],
  outgoing: [{ player: player("u-lu", "lu", null, { glow: "#f2f2f4", shape: "drop" }, "", "calm", { friend: false }), sentAt: "2026-11-11T10:00:00Z" }],
};

function board(args: { metric: string; period: string; scope: string }): Board {
  const lonely = query.has("lonely");
  const list = lonely ? entries.filter((e) => e.player.you).map((e) => ({ ...e, rank: 1 })) : entries;
  const scoped = args.scope === "global" ? list.map((e) => ({ ...e, player: { ...e.player, friend: false } })).filter((e) => !e.player.you) : list;
  const ranked = args.period === "streak" ? [...scoped].sort((a, b) => b.streak - a.streak).map((e, i) => ({ ...e, value: e.streak, rank: i + 1 })) : scoped;
  for (const e of ranked) e.cheered = cheered.has(e.player.userId);
  return {
    metric: args.metric, period: args.period as Board["period"], scope: args.scope as Board["scope"], entries: ranked,
    you: args.scope === "global" ? { ...entries[1], rank: 2 } : null, joined: args.scope !== "global", players: ranked.length,
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

// A pretend live Hub: friends wander the Plaza, Ren reads in the Library,
// and Ada says hi to you on your second check-in.
const hub = {
  room: "plaza", syncs: 0,
  where: new Map<string, { room: string; x: number; y: number }>([
    ["u-ada", { room: "plaza", x: 0.3, y: 0.6 }], ["u-sam", { room: "plaza", x: 0.7, y: 0.55 }],
    ["u-kai", { room: "plaza", x: 0.62, y: 0.82 }], ["u-ren", { room: "library", x: 0.5, y: 0.7 }],
  ]),
};
const hubState = (room: string) => {
  hub.room = room;
  hub.syncs++;
  for (const [id, w] of hub.where) if (id !== "u-ren") hub.where.set(id, { ...w, x: Math.min(0.9, Math.max(0.1, w.x + (Math.random() - 0.5) * 0.12)), y: Math.min(0.9, Math.max(0.15, w.y + (Math.random() - 0.5) * 0.1)) });
  const everyone = [...people.filter((p) => !p.you)];
  const here = everyone.filter((p) => hub.where.get(p.userId)?.room === room).map((p) => ({ player: { ...p, friend: false }, ...hub.where.get(p.userId)!, shown: p.userId === "u-sam" && hub.syncs % 4 === 0 ? { kind: "emote", id: "dance", age: 200, to: null } : p.userId === "u-ada" && hub.syncs === 2 ? { kind: "phrase", id: "hi", age: 100, to: "u-me" } : null }));
  const counts = ["plaza", "library", "lab", "terrace", "arcade"].map((id) => ({ id, count: [...hub.where.values()].filter((w) => w.room === id).length + (id === room ? 1 : 0) }));
  return { room, people: here, rooms: counts, online: hub.where.size + 1, events: hub.syncs === 2 ? [{ id: 1, from: people[0], kind: "phrase", item: "hi" }] : [] };
};

let joined = !query.has("new");
const cheered = new Set<string>(["u-sam"]);
mockWindows("main");
mockIPC((command, args) => {
  calls.push({ command, args });
  const a = args as Record<string, string>;
  switch (command) {
    case "account_status": return { state: "signed_in", email: "me@example.com", admin: false, createdAt: "2026-10-01T00:00:00Z" };
    case "account_profile": return { displayName: "Danial Rahmani", avatar: null };
    case "playground_me": return joined ? me : null;
    case "playground_save": joined = true; me.inPlayground = (args as { playground: boolean }).playground; return { ...me, player: { ...me.player, handle: a.handle } };
    case "playground_friends": return friends;
    case "playground_board": return board(a as never);
    case "playground_days": return { active: { [today]: 1 }, "reading.pages": { [today]: 30 } };
    case "playground_publish": return { saved: 2, refused: [] };
    case "playground_cheer": cheered.add(a.userId); return null;
    case "playground_avatar": return { avatar: pictures[a.userId] ?? null };
    case "hub_peek": return { online: 4, rooms: hubState("plaza").rooms, plaza: hubState("plaza").people };
    case "hub_enter": hub.syncs = 0; return hubState(a.room);
    case "hub_sync": return hubState(a.room);
    case "hub_act": case "hub_leave": return null;
    case "playground_add_friend": return { outcome: "requested", player: friends.incoming[0]?.player ?? you };
    default: return null;
  }
});

createRoot(document.getElementById("root")!).render(
  query.has("phone") ? <ThemeProvider installed={EXTENSIONS}><div style={{ height: "100vh" }}><PlaygroundView /></div></ThemeProvider> :
  <ThemeProvider installed={EXTENSIONS}>
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <aside style={{ borderRight: "1px solid var(--line)", background: "var(--surface)", overflow: "auto" }}>
        <PlaygroundSidebar active onOpen={() => {}} />
        <div style={{ margin: 12, height: 190, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }} data-tile>
          <PlaygroundSummary onOpen={() => {}} />
        </div>
      </aside>
      <main style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}><FriendsButton onOpenPlayground={() => document.body.setAttribute("data-opened", "playground")} /></div>
        <div style={{ flex: 1, minHeight: 0 }}><PlaygroundView /></div>
      </main>
    </div>
  </ThemeProvider>,
);
