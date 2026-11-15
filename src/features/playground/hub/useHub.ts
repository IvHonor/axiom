// Being in the Hub: entering, checking in about once a second (where you are,
// and who's in your room), walking (click to go, or the arrow keys), doors,
// emotes and phrases, and leaving the moment you close it or the window.
// Everyone else's position glides between check-ins, so they move smoothly.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Player } from "../api";
import * as hub from "./api";
import { ROOMS, clear, doorAt, spotAt, walk, type Point, type RoomId } from "./rooms";

export interface Remote {
  player: Player;
  from: Point;
  to: Point;
  /** When the glide from `from` to `to` began (performance.now). */
  at: number;
  facing: 1 | -1;
  shown: hub.Shown | null;
  /** When `shown` arrived here (performance.now), to time it out. */
  shownAt: number;
}

export interface Toast {
  id: number;
  from: Player;
  text: string;
  emoji: string;
}

export type Status = "outside" | "entering" | "inside";

const GLIDE_MS = 950;
const SYNC_MS = 1000;

export function useHub() {
  const [status, setStatus] = useState<Status>("outside");
  const [notice, setNotice] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomId>("plaza");
  const [counts, setCounts] = useState<hub.RoomCount[]>([]);
  const [online, setOnline] = useState(0);
  const [, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mine, setMine] = useState<{ kind: hub.ActKind; id: string; at: number } | null>(null);
  const [spot, setSpot] = useState<string | null>(null);

  const people = useRef(new Map<string, Remote>());
  const me = useRef({ x: 0.5, y: 0.7, tx: 0.5, ty: 0.7, facing: 1 as 1 | -1, moving: false });
  const roomRef = useRef<RoomId>("plaza");
  const inside = useRef(false);
  const timer = useRef(0);
  const keys = useRef(new Set<string>());
  const busy = useRef(false);
  const spotRef = useRef<string | null>(null);

  const take = useCallback((state: hub.HubState) => {
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of state.people) {
      seen.add(p.player.userId);
      const known = people.current.get(p.player.userId);
      const here = known ? position(known, now) : { x: p.x, y: p.y };
      const moved = Math.abs(p.x - here.x) > 0.001;
      const shownChanged = (p.shown?.id ?? null) !== (known?.shown?.id ?? null) || (p.shown && known?.shown && p.shown.age < known.shown.age);
      people.current.set(p.player.userId, {
        player: p.player,
        from: here,
        to: { x: p.x, y: p.y },
        at: now,
        facing: moved ? (p.x > here.x ? 1 : -1) : known?.facing ?? 1,
        shown: p.shown,
        shownAt: shownChanged ? now - (p.shown?.age ?? 0) : known?.shownAt ?? now,
      });
    }
    for (const id of [...people.current.keys()]) if (!seen.has(id)) people.current.delete(id);
    setCounts(state.rooms);
    setOnline(state.online);
    if (state.events.length) {
      setToasts((list) => [
        ...list,
        ...state.events.map((e) => ({
          id: e.id,
          from: e.from,
          text: e.kind === "phrase" ? hub.phraseOf(e.item) : hub.emoteOf(e.item)?.label ?? "",
          emoji: e.kind === "phrase" ? "💬" : hub.emoteOf(e.item)?.emoji ?? "✨",
        })),
      ].slice(-4));
    }
    setVersion((v) => v + 1);
  }, []);

  const fail = useCallback((e: unknown) => {
    const message = String(e);
    if (/left the Hub/i.test(message)) {
      inside.current = false;
      setStatus("outside");
      setNotice("You were away for a bit, so your AI left the Hub. Enter again to come back.");
    }
  }, []);

  const check = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!inside.current) return;
    if (!busy.current) {
      busy.current = true;
      try {
        take(await hub.syncHub(roomRef.current, round(me.current.x), round(me.current.y)));
      } catch (e) {
        fail(e);
      } finally {
        busy.current = false;
      }
    }
    if (inside.current) timer.current = window.setTimeout(() => void check(), SYNC_MS);
  }, [take, fail]);

  const enter = useCallback(async (where: RoomId = "plaza") => {
    setStatus("entering");
    setNotice(null);
    const spawn = ROOMS[where].spawn;
    try {
      const state = await hub.enterHub(where, spawn.x, spawn.y);
      const start = state.room === where ? spawn : ROOMS[state.room].spawn;
      me.current = { x: start.x, y: start.y, tx: start.x, ty: start.y, facing: 1, moving: false };
      roomRef.current = state.room;
      setRoom(state.room);
      people.current.clear();
      inside.current = true;
      take(state);
      setStatus("inside");
      timer.current = window.setTimeout(() => void check(), SYNC_MS);
    } catch (e) {
      setStatus("outside");
      setNotice(String(e));
    }
  }, [take, check]);

  const leave = useCallback(async () => {
    inside.current = false;
    window.clearTimeout(timer.current);
    people.current.clear();
    setStatus("outside");
    await hub.leaveHub().catch(() => {});
  }, []);

  // Closing the Hub (or Axiom) logs your AI off straight away.
  useEffect(() => {
    const gone = () => { if (inside.current) void hub.leaveHub().catch(() => {}); };
    window.addEventListener("pagehide", gone);
    return () => {
      window.removeEventListener("pagehide", gone);
      window.clearTimeout(timer.current);
      gone();
      inside.current = false;
    };
  }, []);

  const moveTo = useCallback((x: number, y: number) => {
    me.current.tx = Math.min(0.99, Math.max(0.01, x));
    me.current.ty = Math.min(0.99, Math.max(0.01, y));
    if (Math.abs(me.current.tx - me.current.x) > 0.002) me.current.facing = me.current.tx > me.current.x ? 1 : -1;
    me.current.moving = true;
  }, []);

  const act = useCallback(async (kind: hub.ActKind, id: string, to: string | null = null) => {
    setMine({ kind, id, at: performance.now() });
    try {
      await hub.actHub(kind, id, to);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  /** Through a door: the next room, on the other side of it. */
  const changeRoom = useCallback(async (to: RoomId, arrive: Point) => {
    const from = roomRef.current, back = { ...me.current };
    roomRef.current = to;
    me.current = { ...me.current, x: arrive.x, y: arrive.y, tx: arrive.x, ty: arrive.y, moving: false };
    people.current.clear();
    setRoom(to);
    setMine(null);
    try {
      take(await hub.syncHub(to, arrive.x, arrive.y));
    } catch (e) {
      // Full: back out of the door.
      roomRef.current = from;
      me.current = { ...back, x: back.x, y: back.y, tx: back.x, ty: back.y, moving: false };
      setRoom(from);
      setNotice(String(e));
      window.setTimeout(() => setNotice(null), 3500);
      fail(e);
    }
  }, [take, fail]);

  /** Moves you on by `dt` ms (called every frame by the Hub). */
  const step = useCallback((dt: number) => {
    if (!inside.current) return;
    const m = me.current;
    const room = ROOMS[roomRef.current];
    // Keys steer: a target just ahead in their direction.
    const k = keys.current;
    const kx = (k.has("ArrowRight") || k.has("d") ? 1 : 0) - (k.has("ArrowLeft") || k.has("a") ? 1 : 0);
    const ky = (k.has("ArrowDown") || k.has("s") ? 1 : 0) - (k.has("ArrowUp") || k.has("w") ? 1 : 0);
    if (kx || ky) {
      m.tx = Math.min(0.99, Math.max(0.01, m.x + kx * 0.06));
      m.ty = Math.min(0.99, Math.max(0.01, m.y + ky * 0.08));
      if (kx) m.facing = kx > 0 ? 1 : -1;
      m.moving = true;
    }
    if (!m.moving) return;
    const { at, arrived } = walk(room, { x: m.x, y: m.y }, { x: m.tx, y: m.ty }, dt);
    m.x = at.x;
    m.y = at.y;
    if (arrived && !(kx || ky)) m.moving = false;
    const through = doorAt(room, at);
    if (through) return void changeRoom(through.to, clear(ROOMS[through.to], through.arrive));
    // Stepping onto the dance floor, you dance (everyone sees).
    const now = spotAt(room, at)?.id ?? null;
    if (now !== spotRef.current) {
      spotRef.current = now;
      setSpot(now);
      if (now === "dance") void act("emote", "dance");
    }
  }, [changeRoom, act]);

  return {
    status, notice, room, counts, online, toasts, mine, spot,
    people, me, keys,
    enter, leave, moveTo, act, step,
    dismiss: (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
    clearNotice: () => setNotice(null),
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Where someone is now, partway through their glide. */
export function position(r: Remote, now: number): Point {
  const t = Math.min(1, (now - r.at) / GLIDE_MS);
  const ease = t * (2 - t);
  return { x: r.from.x + (r.to.x - r.from.x) * ease, y: r.from.y + (r.to.y - r.from.y) * ease };
}

export const moving = (r: Remote, now: number) => now - r.at < GLIDE_MS && Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y) > 0.004;
