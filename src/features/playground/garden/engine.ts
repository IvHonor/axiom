// The garden's life: where each Lemma is, what it's doing and saying. Plain
// logic, no drawing (Garden.tsx draws it), so it runs and is tested anywhere.
//
// Positions are shares of the lawn: x 0 (left) to 1 (right), y 0 (far, by
// the hedge) to 1 (near). Time is in milliseconds. Each Lemma picks its next
// thing to do by its personality (cheerful ones dance, calm ones sit, witty
// ones chat), and its friends: Lemmas visit and chat with each other, race
// for seeds you drop (seeds nobody reaches grow into plants), react when
// poked, and rest on the charging pads at night.
import { chatter, reaction, type Line } from "./lines.ts";

export type Activity =
  | "idle" | "walk" | "visit" | "chat" | "play" | "dance" | "sit" | "sleep"
  | "react" | "dizzy" | "fetch" | "eat" | "arrive" | "celebrate" | "gate";

/** How it looks while doing it (a Lemma `Mood`). */
export type Look = "idle" | "happy" | "sleepy" | "listening" | "puzzled" | "encouraging" | "thinking" | "waiting";

export interface Resident {
  id: string;
  personality: string;
  /** Yours. */
  you?: boolean;
  /** Waiting at the gate: asked to be friends. */
  gate?: boolean;
  /** Just became a friend: arrives in a beam rather than already being here. */
  arriving?: boolean;
}

export interface Spirit {
  id: string;
  personality: string;
  you: boolean;
  x: number;
  y: number;
  /** Where it's heading. */
  tx: number;
  ty: number;
  /** -1 facing left, 1 right. */
  facing: -1 | 1;
  activity: Activity;
  /** Time left in it. */
  left: number;
  /** Who it's with (visiting, chatting, playing). */
  partner: string | null;
  look: Look;
  /** What it's saying, and for how much longer. */
  say: Line | null;
  sayLeft: number;
  /** Height off the ground (0 to 1 of a hop), for drawing. */
  lift: number;
  /** Runs while moving and hopping. */
  phase: number;
  /** Pokes in quick succession: enough of them and it's dizzy. */
  pokes: number;
  pokeAt: number;
  /** Walking somewhere to do this when it arrives (to a charging pad, to rest). */
  goal: "rest" | null;
  /** The charging pad it's resting on (or heading to), by index in `PADS`. */
  pad: number | null;
}

/** A seed nobody reached, grown into a plant. Kept on this computer. */
export interface Plant {
  id: string;
  x: number;
  y: number;
  /** Which of the plants it grew into. */
  kind: number;
  /** When, in Unix ms. */
  born: number;
}

export interface Seed {
  id: number;
  x: number;
  y: number;
  /** Time since it landed. */
  age: number;
}

/** A small, seedable random source, so tests can replay a garden. */
export function random(seed = Date.now()): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const X = [0.07, 0.86] as const;
const Y = [0.08, 0.95] as const;
/** Where gate visitors stand: outside the back fence, by the gate on the right. */
const GATE = { x: 0.93, y: 0 };
/** Charging pads, where Lemmas rest: at the back, by the trees. */
export const PADS = [{ x: 0.2, y: 0.14 }, { x: 0.3, y: 0.1 }, { x: 0.74, y: 0.12 }] as const;
/** Lemmas only race for seeds this near; farther ones are left to grow. */
const REACH = 0.38;
/** A seed nobody's coming for grows after this long. */
export const GROW_MS = 5000;
/** Most plants a garden keeps; the oldest goes when another grows. */
export const MAX_PLANTS = 30;
export const PLANT_KINDS = 3;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** Walking speed (lawn widths a second) by personality. */
const SPEED: Record<string, number> = { standard: 0.11, cheerful: 0.14, calm: 0.07, direct: 0.15, witty: 0.11, coach: 0.16 };

/** How likely each thing is next, by personality. */
const LIKES: Record<string, Partial<Record<Activity, number>>> = {
  standard: { idle: 3, walk: 4, visit: 3, sit: 1, dance: 1 },
  cheerful: { idle: 2, walk: 4, visit: 4, dance: 3, play: 2 },
  calm: { idle: 4, walk: 2, visit: 2, sit: 4, sleep: 1 },
  direct: { idle: 2, walk: 6, visit: 2, sit: 1 },
  witty: { idle: 3, walk: 3, visit: 5, sit: 1, dance: 1 },
  coach: { idle: 1, walk: 5, visit: 3, play: 3, dance: 1 },
};

export class Garden {
  spirits = new Map<string, Spirit>();
  seeds: Seed[] = [];
  plants: Plant[] = [];
  /** Bumped when a plant grows, so it can be saved. */
  plantsVersion = 0;
  /** Night: Lemmas get sleepy and fireflies come out. */
  night = false;
  /** Reduced motion: nobody wanders, hops or races; they still react and talk. */
  still = false;
  /** Bumped whenever something worth redrawing (not just moving) changes. */
  version = 0;
  private seedId = 0;
  private clock = 0;
  /** Replies waiting for the first speaker to finish. */
  private replies = new Map<string, Line>();

  private rand: () => number;

  constructor(rand: () => number = random()) {
    this.rand = rand;
  }

  /** Brings the garden in line with who's in it: new arrivals, leavers, gate visitors. */
  sync(residents: Resident[]) {
    const ids = new Set(residents.map((r) => r.id));
    for (const id of this.spirits.keys()) if (!ids.has(id)) this.spirits.delete(id);
    for (const r of residents) {
      const known = this.spirits.get(r.id);
      if (known) {
        known.personality = r.personality;
        // Accepted: in through the gate.
        if (known.activity === "gate" && !r.gate) this.start(known, "walk", 9000, this.spot());
        continue;
      }
      // Several at the gate queue along the fence.
      const queued = [...this.spirits.values()].filter((o) => o.activity === "gate").length;
      const at = r.gate ? { x: GATE.x - queued * 0.07, y: GATE.y } : this.spot();
      const s: Spirit = {
        id: r.id, personality: r.personality, you: !!r.you,
        x: at.x, y: at.y, tx: at.x, ty: at.y, facing: this.rand() < 0.5 ? -1 : 1,
        activity: "idle", left: 500 + this.rand() * 2000, partner: null, look: "idle",
        say: null, sayLeft: 0, lift: 0, phase: this.rand() * 10, pokes: 0, pokeAt: -1e9, goal: null, pad: null,
      };
      this.spirits.set(r.id, s);
      if (r.gate) this.start(s, "gate", Infinity);
      else if (r.arriving) {
        this.start(s, "arrive", 1600);
        this.speak(s, { text: chatter(s.personality, "arrive", this.rand), emoji: "✨" }, 2600);
      }
    }
    this.version++;
  }

  private spot() {
    return { x: X[0] + this.rand() * (X[1] - X[0]), y: Y[0] + this.rand() * (Y[1] - Y[0]) };
  }

  private start(s: Spirit, activity: Activity, ms: number, target?: { x: number; y: number }) {
    // Anything else interrupts going to rest (`rest` sets them again after).
    s.goal = null;
    if (activity !== "sleep") s.pad = null;
    s.activity = activity;
    s.left = ms;
    if (target) {
      s.tx = clamp(target.x, X);
      s.ty = clamp(target.y, Y);
    }
    s.look = ({ sleep: "sleepy", chat: "happy", play: "happy", dance: "happy", react: "happy", eat: "happy", celebrate: "encouraging", arrive: "happy", sit: "listening", dizzy: "puzzled", gate: "waiting", fetch: "encouraging" } as Partial<Record<Activity, Look>>)[activity] ?? "idle";
    if (activity !== "visit" && activity !== "chat" && activity !== "play") s.partner = null;
    this.version++;
  }

  private speak(s: Spirit, line: Line, ms = 2400) {
    s.say = line;
    s.sayLeft = ms;
    this.version++;
  }

  /** What a Lemma does when it's finished what it was doing. */
  private next(s: Spirit) {
    if (this.still) return this.start(s, this.rand() < 0.3 ? "sit" : "idle", 3000 + this.rand() * 4000);
    if (this.night && this.rand() < (s.personality === "calm" ? 0.5 : 0.3)) return this.rest(s);
    const likes = LIKES[s.personality] ?? LIKES.standard;
    const options = Object.entries(likes) as [Activity, number][];
    let roll = this.rand() * options.reduce((n, [, w]) => n + w, 0);
    const choice = options.find(([, w]) => (roll -= w) < 0)?.[0] ?? "idle";
    switch (choice) {
      case "walk":
        return this.start(s, "walk", 9000, this.spot());
      case "visit": {
        // Someone free and in the garden, more often yours.
        const others = [...this.spirits.values()].filter((o) => o !== s && o.activity !== "gate" && o.activity !== "sleep" && !o.partner);
        if (!others.length) return this.start(s, "idle", 1500);
        const yours = others.find((o) => o.you);
        const other = yours && this.rand() < 0.35 ? yours : others[Math.floor(this.rand() * others.length)];
        s.partner = other.id;
        const side = other.x > s.x ? -1 : 1;
        this.start(s, "visit", 9000, { x: other.x + side * 0.09, y: other.y });
        s.partner = other.id;
        return;
      }
      case "dance":
        this.speak(s, { text: "", emoji: s.personality === "coach" ? "💪" : "🎶" }, 1800);
        return this.start(s, "dance", 2000 + this.rand() * 1200);
      case "play":
        return this.start(s, "play", 1800);
      case "sit":
        return this.start(s, "sit", 2500 + this.rand() * 3000);
      case "sleep":
        return this.rest(s);
      default:
        return this.start(s, "idle", 800 + this.rand() * 2200);
    }
  }

  /** Off to a free charging pad to rest, or a nap where it stands if they're all taken. */
  private rest(s: Spirit) {
    const taken = new Set([...this.spirits.values()].filter((o) => o !== s && o.pad !== null).map((o) => o.pad));
    const free = PADS.findIndex((_, i) => !taken.has(i));
    if (free < 0) return this.start(s, "sleep", 5000 + this.rand() * 6000);
    this.start(s, "walk", 15000, PADS[free]);
    s.goal = "rest";
    s.pad = free;
  }

  /** Arrived next to who it was visiting: chat (or play), both of them. */
  private meet(s: Spirit) {
    const other = s.partner ? this.spirits.get(s.partner) : undefined;
    if (!other || other.activity === "gate" || other.activity === "sleep" || (other.partner && other.partner !== s.id)) return this.next(s);
    const together: Activity = this.rand() < 0.7 ? "chat" : "play";
    const ms = together === "chat" ? 4200 : 2200;
    s.facing = other.x > s.x ? 1 : -1;
    other.facing = s.x > other.x ? 1 : -1;
    this.start(s, together, ms);
    this.start(other, together, ms);
    s.partner = other.id;
    other.partner = s.id;
    if (together === "chat") {
      const [first, reply] = chatter.pair(s.personality, other.personality, this.rand);
      this.speak(s, first, 2000);
      // The reply comes once the first's said.
      other.say = null;
      other.sayLeft = -2000;
      this.replies.set(other.id, reply);
    } else {
      this.speak(s, { text: "", emoji: "🙌" }, 1600);
      this.speak(other, { text: "", emoji: "🙌" }, 1600);
    }
  }

  /** You clicked a Lemma. Too many clicks in a row and it's dizzy. */
  poke(id: string, you = "you") {
    const s = this.spirits.get(id);
    if (!s || s.activity === "arrive") return;
    if (s.activity === "gate") return this.speak(s, { text: chatter(s.personality, "gate", this.rand), emoji: "👋" });
    s.pokes = this.clock - s.pokeAt < 1500 ? s.pokes + 1 : 1;
    s.pokeAt = this.clock;
    if (s.pokes >= 4) {
      s.pokes = 0;
      this.start(s, "dizzy", 2200);
      return this.speak(s, { text: chatter(s.personality, "dizzy", this.rand), emoji: "💫" });
    }
    if (s.partner) this.release(s);
    this.start(s, "react", 1300);
    this.speak(s, reaction(s.personality, s.you, you, this.rand));
  }

  /** A real cheer was sent: they celebrate. */
  cheer(id: string) {
    const s = this.spirits.get(id);
    if (!s) return;
    if (s.partner) this.release(s);
    this.start(s, "celebrate", 2200);
    this.speak(s, { text: chatter(s.personality, "cheered", this.rand), emoji: "⚡" }, 2600);
  }

  /** You dropped a data seed: the nearest couple of awake Lemmas race for it. */
  drop(x: number, y: number): Seed | null {
    if (this.still) return null;
    const seed = { id: ++this.seedId, x: clamp(x, X), y: clamp(y, Y), age: 0 };
    this.seeds.push(seed);
    if (this.seeds.length > 6) this.seeds.shift();
    const near = [...this.spirits.values()]
      .filter((s) => s.activity !== "gate" && s.activity !== "arrive" && Math.hypot(s.x - x, s.y - y) < REACH && !(s.activity === "sleep" && Math.hypot(s.x - x, s.y - y) > 0.2))
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
      .slice(0, 2);
    for (const s of near) {
      if (s.partner) this.release(s);
      this.start(s, "fetch", 8000, seed);
      this.speak(s, { text: "", emoji: "❗" }, 900);
    }
    this.version++;
    return seed;
  }

  /** Lets go of whoever it was with. */
  private release(s: Spirit) {
    const other = s.partner ? this.spirits.get(s.partner) : undefined;
    s.partner = null;
    if (other && other.partner === s.id) {
      other.partner = null;
      if (other.activity === "chat" || other.activity === "play") this.start(other, "idle", 800);
    }
  }

  /** Moves time on by `dt` ms. */
  step(dt: number) {
    dt = Math.min(dt, 100);
    this.clock += dt;
    for (const seed of this.seeds) seed.age += dt;
    this.grow();
    for (const s of this.spirits.values()) this.live(s, dt);
    this.separate();
  }

  private live(s: Spirit, dt: number) {
    s.phase += dt / 1000;
    if (this.still) {
      s.lift = 0;
      if (s.activity === "walk" || s.activity === "visit" || s.activity === "fetch" || s.activity === "arrive") this.start(s, "idle", 2000);
    }
    // Words fade; a reply waits its turn.
    if (s.sayLeft > 0) {
      s.sayLeft -= dt;
      if (s.sayLeft <= 0) {
        s.say = null;
        this.version++;
      }
    } else if (s.sayLeft < 0) {
      s.sayLeft += dt;
      const reply = this.replies.get(s.id);
      if (s.sayLeft >= 0 && reply) {
        this.replies.delete(s.id);
        if (s.activity === "chat") this.speak(s, reply, 2000);
      }
    }

    const moving = s.activity === "walk" || s.activity === "visit" || s.activity === "fetch";
    if (moving) {
      // A visit follows its friend, who may be walking too.
      const other = s.activity === "visit" && s.partner ? this.spirits.get(s.partner) : undefined;
      if (other) {
        const side = other.x > s.x ? -1 : 1;
        s.tx = clamp(other.x + side * 0.09, X);
        s.ty = clamp(other.y, Y);
      }
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy * 1.6);
      const speed = (SPEED[s.personality] ?? 0.11) * (s.activity === "fetch" ? 1.9 : 1) * (this.night ? 0.7 : 1);
      const stepLen = (speed * dt) / 1000;
      if (Math.abs(dx) > 0.004) s.facing = dx > 0 ? 1 : -1;
      if (dist <= stepLen || dist < 0.01) {
        s.x = s.tx;
        s.y = s.ty;
        if (s.activity === "visit") return this.meet(s);
        if (s.activity === "fetch") return this.eat(s);
        if (s.goal === "rest") {
          const pad = s.pad;
          this.start(s, "sleep", 7000 + this.rand() * 9000);
          s.pad = pad;
          return;
        }
        return this.start(s, "idle", 600 + this.rand() * 1500);
      }
      s.x += (dx / dist) * stepLen;
      s.y += ((dy / dist) * stepLen) / 1.6;
      s.lift = Math.abs(Math.sin(s.phase * (s.activity === "fetch" ? 16 : 11))) * 0.18;
    } else {
      const hop = s.activity === "dance" || s.activity === "play" || s.activity === "react" || s.activity === "celebrate" || s.activity === "arrive";
      s.lift = hop ? Math.abs(Math.sin(s.phase * (s.activity === "celebrate" ? 9 : 7))) * (s.activity === "react" ? 0.9 : 0.6) : s.activity === "sleep" ? 0 : Math.sin(s.phase * 2) * 0.04 + 0.04;
      if (s.activity === "dance") s.facing = Math.sin(s.phase * 3.5) > 0 ? 1 : -1;
      if (s.activity === "arrive") s.lift = Math.max(0, s.left / 1600) * 4;
    }

    if (s.activity === "gate") {
      // Gate visitors wave now and then.
      if (this.rand() < dt / 9000) this.speak(s, { text: "", emoji: "👋" }, 1400);
      return;
    }
    s.left -= dt;
    if (s.left <= 0) {
      if (s.partner) this.release(s);
      this.next(s);
    }
  }

  private eat(s: Spirit) {
    const seed = this.seeds.find((x) => Math.hypot(x.x - s.x, x.y - s.y) < 0.03);
    if (!seed) return this.start(s, "idle", 800);
    this.seeds = this.seeds.filter((x) => x !== seed);
    // Whoever else was racing for it missed out.
    for (const o of this.spirits.values()) {
      if (o !== s && o.activity === "fetch" && Math.hypot(o.tx - seed.x, o.ty - seed.y) < 0.02) {
        this.start(o, "idle", 900);
        this.speak(o, { text: "", emoji: "😮" }, 1200);
      }
    }
    this.start(s, "eat", 1500);
    this.speak(s, { text: chatter(s.personality, "yum", this.rand), emoji: "✨" }, 1800);
  }

  /** Seeds nobody's coming for take root. */
  private grow() {
    const wanted = new Set([...this.spirits.values()].filter((s) => s.activity === "fetch").map((s) => `${s.tx.toFixed(3)},${s.ty.toFixed(3)}`));
    const grown = this.seeds.filter((seed) => seed.age >= GROW_MS && !wanted.has(`${seed.x.toFixed(3)},${seed.y.toFixed(3)}`));
    if (!grown.length) return;
    this.seeds = this.seeds.filter((seed) => !grown.includes(seed));
    for (const seed of grown) {
      this.plants.push({ id: `${Date.now().toString(36)}${seed.id}`, x: seed.x, y: seed.y, kind: Math.floor(this.rand() * PLANT_KINDS), born: Date.now() });
    }
    if (this.plants.length > MAX_PLANTS) this.plants = this.plants.slice(-MAX_PLANTS);
    this.plantsVersion++;
    this.version++;
  }

  /** Nudges Lemmas apart so they don't stand inside each other. */
  private separate() {
    const list = [...this.spirits.values()].filter((s) => s.activity !== "gate");
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = (b.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy);
        const min = a.partner === b.id ? 0.07 : 0.06;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d / 1.6;
          if (a.activity !== "sleep") { a.x = clamp(a.x - ux * push, X); a.y = clamp(a.y - uy * push, Y); }
          if (b.activity !== "sleep") { b.x = clamp(b.x + ux * push, X); b.y = clamp(b.y + uy * push, Y); }
        }
      }
    }
  }
}
