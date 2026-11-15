// The friends garden, an AI garden: where your Lemma and your friends'
// Lemmas live. They wander (leaving light trails when they run), visit and
// chat, high-five, dance, rest on the charging pads at night, and race for
// the data seeds you drop on the lawn; a seed nobody reaches grows into a
// glowing plant that stays. Pixel flowers open as Lemmas pass. Point at one and it looks at you; click it
// and it reacts (too many clicks and it's dizzy); cheer a friend from their
// tag and their Lemma celebrates. Friend requests wait at the gate.
//
// engine.ts decides what everyone does; this draws it. Lemmas are the light
// illustrated faces, not 3D, so a whole garden of them stays smooth. It
// pauses when hidden, and stands still with reduced motion.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Maximize2, Sprout, X, Zap } from "lucide-react";
import { readSetting, saveSetting } from "../../../lib/settings";
import { useAssistantName } from "../../lemma/persona";
import * as api from "../api";
import { displayName, type Player } from "../api";
import { Flame, atRisk } from "../Flame";
import { PeerLemma, glowOf, lemmaName } from "../PeerLemma";
import { refresh, setFriends, usePlayground } from "../store";
import { Garden as Sim, MAX_PLANTS, PADS, PLANT_KINDS, type Plant, type Resident, type Spirit } from "./engine";
import { Scenery, type Time } from "./Scenery";
import "./garden.css";

function timeOfDay(now = new Date()): Time {
  const h = now.getHours();
  return h < 6 || h >= 21 ? "night" : h < 8 ? "dawn" : h >= 18 ? "dusk" : "day";
}

/** Friends this computer has already seen in the garden; anyone new arrives in a beam. */
function arrivals(me: string, ids: string[]): Set<string> {
  const key = `axiom.garden.seen.${me}`;
  const saved = readSetting(key);
  const known = Array.isArray(saved) ? new Set(saved.filter((x): x is string => typeof x === "string")) : null;
  saveSetting(key, ids);
  // The first visit: everyone's already at home.
  return known ? new Set(ids.filter((id) => !known.has(id))) : new Set();
}

/** Pixel flowers, in the same places each time for the same person. */
function flowersFor(seed: string) {
  let h = 2166136261;
  for (const c of `${seed}:flowers`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  return Array.from({ length: 12 }, () => ({ x: 0.08 + rand() * 0.84, y: 0.18 + rand() * 0.78, hue: [330, 45, 190, 280, 150][Math.floor(rand() * 5)] }));
}

/** The plants grown here (on this computer only). */
const plantsKey = (me: string) => `axiom.garden.plants.${me}`;
function loadPlants(me: string): Plant[] {
  const saved = readSetting(plantsKey(me));
  if (!Array.isArray(saved)) return [];
  const share = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
  return saved
    .filter((p): p is Plant => !!p && typeof p === "object" && typeof p.id === "string" && share(p.x) && share(p.y) && Number.isInteger(p.kind) && p.kind >= 0 && p.kind < PLANT_KINDS && typeof p.born === "number")
    .slice(-MAX_PLANTS);
}

interface GardenProps {
  height: number;
  /** Opens the garden bigger. */
  onExpand?: () => void;
  big?: boolean;
}

export function Garden({ height, onExpand, big = false }: GardenProps) {
  const { me, friends } = usePlayground();
  const yourName = me?.player.name?.split(" ")[0] || (me ? `@${me.player.handle}` : "you");
  const lemma = useAssistantName();
  const host = useRef<HTMLDivElement>(null);
  const sim = useMemo(() => new Sim(), []);
  const els = useRef(new Map<string, { root: HTMLDivElement; body: HTMLDivElement }>());
  const flowerEls = useRef<(HTMLSpanElement | null)[]>([]);
  const myId = me?.player.userId;
  // Plants grown before come back.
  useEffect(() => {
    if (myId) sim.plants = loadPlants(myId);
  }, [myId, sim]);
  const [width, setWidth] = useState(0);
  const [, setVersion] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [time, setTime] = useState<Time>(() => timeOfDay());
  const [banner, setBanner] = useState<string | null>(null);
  const [still, setStill] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Who lives here: you, your friends, and requests at the gate.
  const players = useMemo(() => {
    const map = new Map<string, Player>();
    if (me) map.set(me.player.userId, me.player);
    for (const f of friends?.friends ?? []) map.set(f.player.userId, f.player);
    for (const r of friends?.incoming ?? []) map.set(r.player.userId, r.player);
    return map;
  }, [me, friends]);
  const gate = useMemo(() => new Set((friends?.incoming ?? []).map((r) => r.player.userId)), [friends]);
  const friendInfo = useMemo(() => new Map((friends?.friends ?? []).map((f) => [f.player.userId, f])), [friends]);

  const residentsKey = [...players.keys()].sort().join() + "|" + [...gate].sort().join();
  useEffect(() => {
    if (!me) return;
    const ids = (friends?.friends ?? []).map((f) => f.player.userId);
    const fresh = friends ? arrivals(me.player.userId, ids) : new Set<string>();
    const residents: Resident[] = [...players.values()].map((p) => ({
      id: p.userId,
      personality: p.lemma.personality,
      you: p.you,
      gate: gate.has(p.userId),
      arriving: fresh.has(p.userId),
    }));
    sim.sync(residents);
    const first = [...fresh][0];
    if (first) {
      const p = players.get(first)!;
      setBanner(`${lemmaName(p)} moved into your garden with ${displayName(p)}`);
      const gone = window.setTimeout(() => setBanner(null), 4200);
      return () => window.clearTimeout(gone);
    }
  }, [residentsKey]);

  useEffect(() => {
    sim.night = time === "night";
    sim.still = still;
  }, [time, still, sim]);

  useEffect(() => {
    const every = window.setInterval(() => setTime(timeOfDay()), 60_000);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setStill(motion.matches);
    motion.addEventListener("change", changed);
    return () => { window.clearInterval(every); motion.removeEventListener("change", changed); };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const sized = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    sized.observe(el);
    return () => sized.disconnect();
  }, []);

  // Where the lawn is on screen, and how big a Lemma stands at each depth.
  const horizon = height * 0.3;
  const lemmaBase = Math.max(30, Math.min(big ? 104 : 56, height * (big ? 0.19 : 0.21)));
  const place = (s: Spirit) => {
    const scale = 0.72 + 0.42 * s.y;
    const size = lemmaBase * scale;
    return { x: s.x * width - size / 2, y: horizon + s.y * (height - horizon - 8) - size, scale, size };
  };

  // Moves everyone every frame without re-rendering; re-renders a few times a
  // second when what they're doing or saying changes.
  useEffect(() => {
    if (!width) return;
    let frame = 0, last = performance.now(), drawn = -1, rendered = 0, visible = true;
    const paint = () => {
      for (const s of sim.spirits.values()) {
        const el = els.current.get(s.id);
        if (!el) continue;
        const at = place(s);
        el.root.style.transform = `translate(${at.x}px, ${at.y}px)`;
        el.root.style.zIndex = String(10 + Math.round(s.y * 100));
        const hop = s.lift * lemmaBase * 0.45;
        const tilt = s.activity === "walk" || s.activity === "fetch" || s.activity === "visit" ? s.facing * 4 : s.activity === "dizzy" ? Math.sin(s.phase * 12) * 14 : 0;
        el.body.style.transform = `translateY(${-hop}px) rotate(${tilt}deg)`;
        el.root.style.setProperty("--gd-shadow", String(1 - Math.min(0.7, s.lift * 0.6)));
        el.root.dataset.facing = s.facing > 0 ? "right" : "left";
      }
      // Pixel flowers open while a Lemma's near.
      const spirits = [...sim.spirits.values()];
      flowersFor(myId ?? "").forEach((f, i) => {
        const el = flowerEls.current[i];
        if (!el) return;
        const open = spirits.some((s) => s.activity !== "gate" && Math.abs(s.x - f.x) < 0.07 && Math.abs(s.y - f.y) < 0.12);
        if ((el.dataset.open === "1") !== open) el.dataset.open = open ? "1" : "";
      });
    };
    let savedPlants = sim.plantsVersion;
    const tick = (now: number) => {
      sim.step(still ? 0 : now - last);
      last = now;
      paint();
      if (sim.version !== drawn && now - rendered > 120) {
        drawn = sim.version;
        rendered = now;
        setVersion(sim.version);
      }
      if (sim.plantsVersion !== savedPlants && myId) {
        savedPlants = sim.plantsVersion;
        saveSetting(plantsKey(myId), sim.plants);
      }
      frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const start = () => { if (!frame && visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(tick); } };
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); });
    if (host.current) seen.observe(host.current);
    const shown = () => (document.hidden ? (cancelAnimationFrame(frame), (frame = 0)) : start());
    document.addEventListener("visibilitychange", shown);
    // Still: no frames, just a slow clock so words come and go.
    const slow = still ? window.setInterval(() => { sim.step(250); paint(); setVersion(sim.version); }, 250) : 0;
    if (still) paint(); else start();
    return () => { cancelAnimationFrame(frame); seen.disconnect(); document.removeEventListener("visibilitychange", shown); window.clearInterval(slow); };
  }, [width, height, still, sim, myId]);

  const lawnPoint = (e: ReactPointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    const y = (e.clientY - r.top - horizon) / (height - horizon - 8);
    return { x: (e.clientX - r.left) / r.width, y };
  };
  const dropSeed = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const at = lawnPoint(e);
    if (at.y < 0) return;
    sim.drop(at.x, at.y);
    setVersion(sim.version);
  };

  const cheer = async (id: string) => {
    try {
      await api.cheer(id);
      sim.cheer(id);
      if (friends) setFriends({ ...friends, friends: friends.friends.map((f) => (f.player.userId === id ? { ...f, cheered: true } : f)) });
    } catch { /* stays uncheered */ }
  };
  const answer = async (id: string, accept: boolean) => {
    try {
      await (accept ? api.acceptFriend(id) : api.removeFriend(id));
      await refresh();
    } catch { /* still at the gate */ }
  };

  if (!me) return null;
  const flowers = flowersFor(me.player.userId);
  const lawnY = (y: number) => horizon + y * (height - horizon - 8);
  const spirits = [...sim.spirits.values()];
  /** Everyone in the garden but you. */
  const pals = spirits.filter((s) => s.activity !== "gate" && !s.you).length;
  const palsText = pals === 0 ? "Just you" : `${pals} ${pals === 1 ? "friend" : "friends"}`;

  return (
    <div className="gd" data-time={time} data-big={big || undefined} style={{ height } as CSSProperties}>
      <div
        ref={host}
        className="gd-lawn"
        onPointerDown={dropSeed}
        title={still ? undefined : "Click the grass to drop a data seed"}
        aria-label={`Your garden: you and ${pals} ${pals === 1 ? "friend" : "friends"}`}
        role="group"
      >
        <Scenery layout={{ width, height, horizon, lawnY, big }} time={time} seed={me.player.userId} />
        {flowers.map((f, i) => (
          <span key={`f${i}`} ref={(el) => { flowerEls.current[i] = el; }} className="gd-flower" aria-hidden="true"
            style={{ left: `${f.x * 100}%`, top: lawnY(f.y), zIndex: 10 + Math.round(f.y * 100), "--hue": f.hue } as CSSProperties}>
            <i /><i /><i /><i />
          </span>
        ))}
        {PADS.map((pad, i) => {
          const charging = spirits.some((s) => s.pad === i && s.activity === "sleep");
          return (
            <span key={`pad${i}`} className="gd-pad" data-charging={charging || undefined} aria-hidden="true"
              style={{ left: pad.x * width, top: lawnY(pad.y), zIndex: 10 + Math.round(pad.y * 100) - 1, "--pad": `${lemmaBase * (0.8 + 0.4 * pad.y)}px` } as CSSProperties} />
          );
        })}
        {sim.plants.map((plant) => (
          <span key={plant.id} className="gd-plant" data-kind={plant.kind} aria-hidden="true"
            style={{ left: plant.x * width, top: lawnY(plant.y), zIndex: 10 + Math.round(plant.y * 100), "--s": 0.7 + 0.5 * plant.y } as CSSProperties}>
            <i /><b />
          </span>
        ))}
        {sim.seeds.map((seed) => (
          <span key={seed.id} className="gd-seed" aria-hidden="true" style={{ left: seed.x * width, top: lawnY(seed.y), zIndex: 10 + Math.round(seed.y * 100) }} />
        ))}

        {spirits.map((s) => {
          const p = players.get(s.id);
          if (!p) return null;
          const at = place(s);
          const info = friendInfo.get(s.id);
          return (
            <div
              key={s.id}
              className="gd-spirit"
              data-activity={s.activity}
              data-you={s.you || undefined}
              style={{ transform: `translate(${at.x}px, ${at.y}px)`, width: at.size, height: at.size, "--glow": glowOf(p) } as CSSProperties}
              ref={(root) => {
                if (root) els.current.set(s.id, { root, body: root.querySelector(".gd-body") as HTMLDivElement });
                else els.current.delete(s.id);
              }}
              onPointerEnter={() => setHover(s.id)}
              onPointerLeave={() => setHover((h) => (h === s.id ? null : h))}
            >
              <span className="gd-shadow" aria-hidden="true" />
              <span className="gd-trail" aria-hidden="true" />
              {s.activity === "arrive" && <span className="gd-beam" aria-hidden="true" />}
              <button
                className="gd-body"
                onClick={() => { sim.poke(s.id, yourName); setVersion(sim.version); }}
                aria-label={`${displayName(p)}'s ${lemmaName(p)}${s.you ? " (yours)" : ""}: ${s.activity}`}
              >
                <PeerLemma player={p} size={Math.round(at.size)} mood={hover === s.id && s.activity !== "sleep" ? "listening" : s.look} />
                {s.activity === "sleep" && <span className="gd-zzz" aria-hidden="true">z<i>z</i><b>z</b></span>}
                {s.activity === "celebrate" && <span className="gd-burst" aria-hidden="true" />}
              </button>
              {s.say && (
                <span className="gd-say" key={`${s.say.text}${s.say.emoji}`}>
                  <span aria-hidden="true">{s.say.emoji}</span>
                  {s.say.text && <span>{s.say.text}</span>}
                </span>
              )}
              {hover === s.id && (
                <span className="gd-tag" onPointerDown={(e) => e.stopPropagation()}>
                  <strong>{s.you ? lemma : lemmaName(p)}</strong>
                  <small>{s.you ? "yours" : gate.has(s.id) ? `@${p.handle} wants to be friends` : `@${p.handle}`}</small>
                  {info?.streak ? <Flame streak={info.streak} risk={atRisk(info.streakThrough, info.asOf)} size={12} /> : null}
                  {gate.has(s.id) ? (
                    <span className="gd-tag-actions">
                      <button onClick={() => void answer(s.id, true)} aria-label={`Accept @${p.handle}`} title="Let them in"><Check size={12} /></button>
                      <button onClick={() => void answer(s.id, false)} aria-label={`Decline @${p.handle}`} title="Decline"><X size={12} /></button>
                    </span>
                  ) : info && !s.you ? (
                    <span className="gd-tag-actions">
                      <button disabled={info.cheered} onClick={() => void cheer(s.id)} aria-label={info.cheered ? "Cheered today" : `Cheer ${displayName(p)} on`} title={info.cheered ? "Cheered today" : "Cheer them on"}><Zap size={12} /></button>
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="gd-hud">
        <span><Sprout size={12} /> {palsText}{gate.size ? ` · ${gate.size} at the gate` : ""}</span>
        {onExpand && <button onClick={onExpand} aria-label="Open the garden bigger" title="Open bigger"><Maximize2 size={12} /></button>}
      </div>
      {banner && <div className="gd-banner" role="status">✨ {banner}</div>}
      {pals === 0 && !gate.size && <div className="gd-empty">Your garden's waiting for friends. Share your code to invite them in.</div>}
    </div>
  );
}
