// Being in Nexus with everyone else: entering, checking in about once a
// second (where you are, and which building you're in if any; back comes
// who's in the same place within 200 m of you), emotes and
// phrases, waves and hi's sent to you, and leaving the moment you close it or
// the window. Everyone's drawn by the engine, which glides them between
// check-ins.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Player } from "../api";
import * as hub from "../hub/api";
import type { Point } from "./world";

export interface Toast {
  id: number;
  from: Player;
  text: string;
  emoji: string;
}

/** Someone near you, as last heard. */
export interface Near {
  player: Player;
  x: number;
  z: number;
  shown: hub.Shown | null;
  /** When `shown` began, in performance.now() time. */
  shownAt: number;
}

export type Status = "entering" | "inside" | "gone";

/** Where you are: in the city, or inside a building (x and z from its middle). */
export interface Where extends Point {
  inside: string | null;
}

const SYNC_MS = 1000;
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * `where` says where you are now; null until the city's ready. `onGone` hears
 * why you're out (it couldn't let you in, or you were away too long).
 */
export function useLive(where: (() => Where) | null, onGone: (why: string) => void, onFull: () => void = () => {}) {
  const [status, setStatus] = useState<Status>("entering");
  const [people, setPeople] = useState<Map<string, Near>>(new Map());
  /** Which place `people` are in: the building, or null for the city. */
  const [place, setPlace] = useState<string | null>(null);
  const [counts, setCounts] = useState<hub.DistrictCount[]>([]);
  const [online, setOnline] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mine, setMine] = useState<{ kind: hub.ActKind; id: string; at: number } | null>(null);
  const inside = useRef(false);
  const gone = useRef(onGone);
  gone.current = onGone;
  const full = useRef(onFull);
  full.current = onFull;

  const take = useCallback((state: hub.HubState, inside: string | null) => {
    const now = performance.now();
    setPlace(inside);
    setPeople((known) => {
      const next = new Map<string, Near>();
      for (const p of state.people) {
        const before = known.get(p.player.userId);
        const fresh = (p.shown?.id ?? null) !== (before?.shown?.id ?? null) || (!!p.shown && !!before?.shown && p.shown.age < before.shown.age);
        next.set(p.player.userId, { player: p.player, x: p.x, z: p.z, shown: p.shown, shownAt: fresh ? now - (p.shown?.age ?? 0) : before?.shownAt ?? now });
      }
      return next;
    });
    setCounts(state.districts);
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
  }, []);

  const fail = useCallback((e: unknown) => {
    const message = String(e);
    // A building at capacity: the server kept you outside, so step back out.
    if (/building is full/i.test(message)) return full.current();
    if (/left (Nexus|the Hub)/i.test(message)) {
      inside.current = false;
      setStatus("gone");
      gone.current("You were away for a bit, so your AI left Nexus. Enter again to come back.");
    }
  }, []);

  // In once the city's ready, then check in every second until you leave.
  useEffect(() => {
    if (!where) return;
    let live = true, timer = 0, busy = false;
    const check = async () => {
      if (!live || !inside.current) return;
      if (!busy) {
        busy = true;
        const at = where();
        try {
          const state = await hub.syncHub(round(at.x), round(at.z), at.inside);
          if (live) take(state, at.inside);
        } catch (e) {
          if (live) fail(e);
        } finally {
          busy = false;
        }
      }
      if (live && inside.current) timer = window.setTimeout(() => void check(), SYNC_MS);
    };
    const at = where();
    hub.enterHub(round(at.x), round(at.z), at.inside).then(
      (state) => {
        if (!live) return void hub.leaveHub().catch(() => {});
        inside.current = true;
        take(state, at.inside);
        setStatus("inside");
        timer = window.setTimeout(() => void check(), SYNC_MS);
      },
      (e) => {
        if (!live) return;
        setStatus("gone");
        gone.current(String(e));
      },
    );
    // Closing Nexus (or Axiom) logs your AI off straight away.
    const away = () => { if (inside.current) void hub.leaveHub().catch(() => {}); };
    window.addEventListener("pagehide", away);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", away);
      away();
      inside.current = false;
    };
  }, [where, take, fail]);

  const act = useCallback(async (kind: hub.ActKind, id: string, to: string | null = null) => {
    if (!inside.current) return;
    setMine({ kind, id, at: performance.now() });
    try {
      await hub.actHub(kind, id, to);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  return {
    status, people, place, counts, online, toasts, mine, act,
    dismiss: (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
  };
}
