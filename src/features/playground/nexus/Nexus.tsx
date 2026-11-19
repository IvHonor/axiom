// Nexus, the city of AIs: walking it, in 3D, with everyone who's there right
// now. A loading screen while the city starts, a title card as you cross into
// each district (and "New district found!" the first time), a minimap with
// everyone near on it, fast travel to districts you've found, name tags you can
// click for someone's profile, and the emote bar and set phrases for saying
// hello. Step on the ring at a building's door to go inside (the Great
// Library, the Processor Core, the Observatory). Close it and your AI's gone.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Compass, DoorOpen, HelpCircle, LogOut, MapPin, MessageCircle, Users, Volume2, VolumeX } from "lucide-react";
import { useAccount } from "../../../shell/useAccount";
import { readSetting, saveSetting } from "../../../lib/settings";
import { hasFirstLight, lookForRewards, normaliseLook, useLook } from "../../lemma/look";
import { useAchievementRewards } from "../../lemma/achievements/useAchievementRewards";
import { useAssistantName, usePersona } from "../../lemma/persona";
import type { Player } from "../api";
import { Duo } from "../Duo";
import { glowOf, lemmaName } from "../PeerLemma";
import { reaction } from "../garden/lines";
import { usePlayground } from "../store";
import { EMOTES, PHRASES, SHOW_MS, emoteOf, phraseOf, type Shown } from "../hub/api";
import { HubProfile } from "../hub/Profile";
import { createNexus, type Bubble, type NexusHandle, type Peer } from "./engine";
import { Minimap } from "./Minimap";
import { useLive } from "./useLive";
import { DISTRICTS, districtOf, type District } from "./world";
import type { Interior, Spot } from "./interiors";
import { createSound, type NexusSound } from "./sound";
import "./nexus.css";

const DISCOVERED = "axiom.nexus.discovered";
const MUTED = "axiom.nexus.muted";
const TIPS = [
  "Click the ground to walk. Your AI finds the way round buildings.",
  "Drag to turn the view, scroll to zoom, or use Q and E.",
  "WASD or the arrow keys walk too.",
  "Click the map in the corner to head somewhere far away.",
  "Every district you find goes on your travel list.",
  "Click someone's name to see their profile and say hi.",
  "Friends show up gold on the map.",
  "Step on a glowing ring by a door to go inside.",
  "The Great Library has aisles to wander and nooks to sit in.",
  "Find the dance floor in the Simulation Chambers.",
  "The Ascension Lift floats you up to the Simulation Chambers.",
  "Stop at the bench in the middle of the Rialto of Recall.",
  "Walk the Great Firewall down to the Model District.",
  "Stand by the Observatory's telescope and look up.",
];

/** What each spot shows over your head while you're in it. */
const SPOT_BUBBLES: Record<Spot["kind"], { emoji: string; text: string }> = {
  dance: { emoji: "🕺", text: "" },
  sit: { emoji: "📖", text: "Reading…" },
  stargaze: { emoji: "✨", text: "Stargazing" },
  lookout: { emoji: "🌉", text: "Taking in the view" },
};

/** A title card: a district, a building or a route, as you arrive. */
interface Card { name: string; subtitle: string; color: string; fresh: boolean; key: number; kind: "district" | "place" | "route" }

function readDiscovered(): Set<string> {
  const saved = readSetting(DISCOVERED);
  return new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : ["nexus"]);
}

/** What someone's showing, as a bubble, while it's still up. */
function bubbleOf(shown: Shown | null, since: number, me: string | undefined, now: number): Bubble | null {
  if (!shown || now - since > SHOW_MS) return null;
  const aimed = !!shown.to && shown.to === me;
  if (shown.kind === "emote") return { emoji: emoteOf(shown.id)?.emoji ?? "✨", aimed, dance: shown.id === "dance" };
  return { text: phraseOf(shown.id), aimed };
}

const random = () => Math.random();

export function Nexus({ onLeave }: { onLeave: (why?: string) => void }) {
  const chosenLook = useLook();
  const rewards = useAchievementRewards(false);
  const look = useMemo(() => lookForRewards(chosenLook, rewards), [chosenLook, rewards]);
  const lemma = useAssistantName();
  const persona = usePersona();
  const [account] = useAccount();
  const { me, friends } = usePlayground();
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<NexusHandle | null>(null);
  const [loading, setLoading] = useState<District | null>(DISTRICTS[0]);
  const [booting, setBooting] = useState(true);
  const [district, setDistrict] = useState<District | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [room, setRoom] = useState<Interior | null>(null);
  const [route, setRoute] = useState<{ id: string; name: string; blurb: string; color: string } | null>(null);
  const [going, setGoing] = useState<{ room: Interior; entering: boolean } | null>(null);
  const [discovered, setDiscovered] = useState(readDiscovered);
  const [travel, setTravel] = useState(false);
  const [phrasing, setPhrasing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [profile, setProfile] = useState<Player | null>(null);
  const [line, setLine] = useState<{ text: string; emoji: string; until: number } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [spot, setSpot] = useState<Spot | null>(null);
  const [muted, setMuted] = useState(() => readSetting(MUTED) === true);
  const [help, setHelp] = useState(false);
  const [lighter, setLighter] = useState(false);
  const sound = useRef<NexusSound | null>(null);
  const tip = useRef(TIPS[Math.floor(Math.random() * TIPS.length)]);
  const leave = useRef(onLeave);
  leave.current = onLeave;

  const where = useMemo(() => (handle ? () => { const m = handle.me(); return { x: m.x, z: m.z, inside: m.inside }; } : null), [handle]);
  const live = useLive(where, (why) => leave.current(why), () => {
    handle?.leaveBuilding();
    setLine({ text: "It's full in there. Let's come back later!", emoji: "🚪", until: Date.now() + 4000 });
  });
  const peopleRef = useRef(live.people);
  peopleRef.current = live.people;

  /** A title card on arriving somewhere, and "New … found!" the first time. */
  const arrive = (id: string, where: { name: string; subtitle: string; color: string }, kind: Card["kind"] = "district") => {
    setDiscovered((known) => {
      const fresh = !known.has(id);
      if (fresh) sound.current?.cue("found");
      setCard({ name: where.name, subtitle: where.subtitle, color: where.color, fresh, key: Date.now(), kind });
      if (!fresh) return known;
      const next = new Set(known).add(id);
      saveSetting(DISCOVERED, [...next]);
      return next;
    });
  };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let made: NexusHandle | null = null;
    try {
      made = createNexus(el, {
        look,
        glow: look.glow,
        shell: look.shell,
        admin: account?.state === "signed_in" && account.admin,
        firstLight: hasFirstLight(account),
        name: lemma,
      }, {
        onLoading: (d) => setLoading(d),
        onDistrict: (d) => {
          setDistrict(d);
          if (!d) return;
          arrive(d.id, d);
        },
        onPlace: (r) => {
          setRoom(r);
          sound.current?.setAmbience(r?.id ?? "city");
          if (r) arrive(r.id, r, "place");
        },
        onRoute: (r) => {
          setRoute(r);
          if (r) arrive(r.id, { name: r.name, subtitle: r.blurb, color: r.color }, "route");
        },
        onRide: (l) => { if (l) sound.current?.cue("door"); },
        onTravel: (g) => {
          setGoing(g);
          if (g) sound.current?.cue("door");
        },
        onSpot: (s) => {
          setSpot(s);
          if (s) sound.current?.cue("spot");
        },
        onQuality: () => setLighter(true),
        onPick: (id) => {
          const near = peopleRef.current.get(id);
          if (near) setProfile(near.player);
        },
        onPickMe: () => setPhrasing((p) => !p),
      });
      setHandle(made);
    } catch {
      setFailed(true);
    }
    const ready = window.setTimeout(() => setBooting(false), 1200);
    sound.current = createSound(readSetting(MUTED) === true);
    return () => { window.clearTimeout(ready); made?.dispose(); sound.current?.dispose(); sound.current = null; };
    // Built once; your look applies the next time you enter.
  }, []);

  // Bubbles come and go on their own: look again twice a second.
  useEffect(() => {
    const every = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(every);
  }, []);

  const friendIds = useMemo(() => new Set(friends?.friends.map((f) => f.player.userId) ?? []), [friends]);
  const myId = me?.player.userId;

  // Everyone near, to the 3D (once the last check-in's from where you are now).
  useEffect(() => {
    if (!handle) return;
    if (live.place !== (room?.id ?? null)) return handle.setPeople([]);
    const peers: Peer[] = [...live.people.values()].map((n) => {
      const theirs = normaliseLook(n.player.lemma.look);
      return {
        id: n.player.userId,
        handle: n.player.handle,
        name: lemmaName(n.player),
        friend: friendIds.has(n.player.userId),
        look: theirs,
        glow: theirs.glow,
        shell: theirs.shell,
        admin: n.player.perks.admin,
        firstLight: n.player.perks.firstLight,
        x: n.x,
        z: n.z,
        bubble: bubbleOf(n.shown, n.shownAt, myId, now),
      };
    });
    handle.setPeople(peers);
  }, [handle, live.people, live.place, room, friendIds, myId, now]);

  // What you're saying, your AI greeting someone back, or what you're up to on a spot, over your own head.
  useEffect(() => {
    if (!handle) return;
    const mine = live.mine && now - live.mine.at < SHOW_MS ? live.mine : null;
    if (mine) handle.setMine(mine.kind === "emote" ? { emoji: emoteOf(mine.id)?.emoji, dance: mine.id === "dance" } : { text: phraseOf(mine.id) });
    else if (line && line.until > Date.now()) handle.setMine({ emoji: line.emoji, text: line.text });
    else if (spot) handle.setMine({ ...SPOT_BUBBLES[spot.kind], text: SPOT_BUBBLES[spot.kind].text || undefined, dance: spot.kind === "dance" });
    else handle.setMine(null);
  }, [handle, live.mine, line, spot, now]);

  // On the dance floor, you dance, and everyone near sees it (again every few seconds while you stay).
  useEffect(() => {
    if (spot?.kind !== "dance") return;
    void live.act("emote", "dance");
    const again = window.setInterval(() => void live.act("emote", "dance"), SHOW_MS);
    return () => window.clearInterval(again);
    // live.act is stable.
  }, [spot?.id]);

  // Sound: what you do, and waves arriving.
  // (Not the dance floor's own repeats.)
  useEffect(() => { if (live.mine && !(live.mine.id === "dance" && spot?.kind === "dance")) sound.current?.cue("emote"); }, [live.mine]);
  useEffect(() => { if (live.toasts.length) sound.current?.cue("toast"); }, [live.toasts.length]);
  useEffect(() => {
    sound.current?.setMuted(muted);
    saveSetting(MUTED, muted);
  }, [muted]);
  useEffect(() => {
    if (!lighter) return;
    const gone = window.setTimeout(() => setLighter(false), 5000);
    return () => window.clearTimeout(gone);
  }, [lighter]);

  // Waves and hi's sent to you: your AI greets them back, in its own words.
  useEffect(() => {
    const latest = live.toasts[live.toasts.length - 1];
    if (!latest) return;
    const said = reaction(persona.personality, false, latest.from.name?.split(" ")[0] || `@${latest.from.handle}`, random);
    setLine({ ...said, until: Date.now() + 3000 });
    const gone = window.setTimeout(() => live.dismiss(latest.id), 6000);
    return () => window.clearTimeout(gone);
    // Only when one arrives.
  }, [live.toasts.length]);

  // A title card shows for a few seconds.
  useEffect(() => {
    if (!card) return;
    const gone = window.setTimeout(() => setCard(null), card.fresh ? 4200 : 2800);
    return () => window.clearTimeout(gone);
  }, [card]);

  const keyDown = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest("button")) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      e.preventDefault();
      handle?.keys.add(key);
    }
    if (key === "Escape") { setTravel(false); setPhrasing(false); setHelp(false); }
    if (key === "?" || key === "h") setHelp((h) => !h);
  };
  const keyUp = (e: React.KeyboardEvent) => handle?.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const refocus = () => stage.current?.focus();

  if (failed) {
    return (
      <div className="hub-outside">
        <div className="hub-card"><h2>Nexus needs 3D graphics</h2><p>This computer couldn't start the 3D city.</p><button className="pg-enter hub-enter" onClick={() => onLeave()}>Back</button></div>
      </div>
    );
  }

  const countOf = (id: string) => live.counts.find((c) => c.id === id)?.count ?? 0;
  const near = live.place === (room?.id ?? null) ? live.people.size : 0;
  const entering = live.status === "entering";

  return (
    <div className="nx" ref={stage} tabIndex={0} onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => handle?.keys.clear()} aria-label="Nexus. Click the ground or use WASD to walk.">
      <div className="nx-world" ref={host} />

      <div className="nx-top">
        <span className="nx-chip" aria-live="polite"><i className="nx-live" /> {live.online} online{near ? <em>· {near} near you</em> : <em>· nobody near yet</em>}</span>
        {room ? (
          <span className="nx-chip" style={{ "--d": room.color } as CSSProperties}><DoorOpen size={13} /> {room.name}{near > 0 && <em>· {near + 1} inside</em>}</span>
        ) : route ? (
          <span className="nx-chip" style={{ "--d": route.color } as CSSProperties}><Compass size={13} /> {route.name}</span>
        ) : district && <span className="nx-chip" style={{ "--d": district.color } as CSSProperties}><MapPin size={13} /> {district.name}{countOf(district.id) > 1 && <em>· {countOf(district.id)} here</em>}</span>}
        <span className="nx-spacer" />
        {room && handle && <button className="nx-btn" onClick={() => { handle.leaveBuilding(); refocus(); }}><DoorOpen size={14} /> Leave building</button>}
        <div className="nx-travel-wrap">
          <button className="nx-btn" onClick={() => setTravel(!travel)} aria-expanded={travel}><Compass size={14} /> Travel</button>
          {travel && handle && (
            <div className="nx-travel" role="menu">
              {DISTRICTS.map((d) => {
                const known = discovered.has(d.id);
                return (
                  <button key={d.id} role="menuitem" disabled={!known || (!room && district?.id === d.id)} style={{ "--d": d.color } as CSSProperties}
                    onClick={() => { if (room) handle.leaveBuilding(d.center); else handle.walkTo(d.center); setTravel(false); refocus(); }}>
                    <i />
                    <span><strong>{known ? d.name : "Undiscovered"}</strong><small>{known ? d.subtitle : "Explore to find it"}</small></span>
                    {countOf(d.id) > 0 && <b><Users size={11} /> {countOf(d.id)}</b>}
                  </button>
                );
              })}
              <small>{DISTRICTS.filter((d) => discovered.has(d.id)).length} of {DISTRICTS.length} districts found{room ? ` · you'll leave ${room.name} first` : ""}</small>
            </div>
          )}
        </div>
        <button className="nx-btn is-icon" onClick={() => setMuted(!muted)} aria-label={muted ? "Sound off. Turn it on" : "Sound on. Turn it off"} aria-pressed={!muted} title={muted ? "Sound off" : "Sound on"}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
        <button className="nx-btn is-icon" onClick={() => setHelp(!help)} aria-expanded={help} aria-label="Controls" title="Controls (?)"><HelpCircle size={14} /></button>
        <button className="nx-btn is-leave" onClick={() => onLeave()}><LogOut size={14} /> Leave</button>
      </div>

      {help && (
        <div className="nx-help" role="dialog" aria-label="Controls">
          <strong>Getting around</strong>
          <dl>
            <dt>Click the ground</dt><dd>Walk there. Your AI finds the way round things.</dd>
            <dt>W A S D · arrows</dt><dd>Walk, relative to the camera.</dd>
            <dt>Drag · Q / E</dt><dd>Turn the view.</dd>
            <dt>Scroll</dt><dd>Zoom in and out.</dd>
            <dt>Glowing ring</dt><dd>Step on it to go into a building, or back out.</dd>
            <dt>The map</dt><dd>Click it to head somewhere far. Friends show in gold.</dd>
            <dt>A name tag</dt><dd>Their profile: say hi, wave, cheer or add them.</dd>
            <dt>Your AI</dt><dd>Click it for things to say.</dd>
          </dl>
          <small>Look for the dance floor, the library's reading nooks and the Observatory's telescope.</small>
          <button className="nx-btn" onClick={() => { setHelp(false); refocus(); }}>Got it</button>
        </div>
      )}
      {spot && <div className="nx-spot" key={spot.id}>{SPOT_BUBBLES[spot.kind].emoji} {spot.label}</div>}
      {lighter && <div className="nx-spot is-note" role="status">Drawing a little lighter to keep things smooth.</div>}

      {card && (
        <div className="nx-card" key={card.key} style={{ "--d": card.color } as CSSProperties}>
          {card.fresh && <span className="nx-card-new">{card.kind === "district" ? "New district found!" : card.kind === "route" ? "New route found!" : "New place found!"}</span>}
          <strong>{card.name}</strong>
          <span>{card.subtitle}</span>
        </div>
      )}

      <div className="nx-toasts" aria-live="polite">
        {live.toasts.map((t) => (
          <div key={t.id} className="nx-toast" style={{ "--glow": glowOf(t.from) } as CSSProperties}>
            <Duo player={t.from} size={30} />
            <span><strong>{lemmaName(t.from)}</strong> <small>@{t.from.handle}</small><br />{t.emoji} {t.text}</span>
            <button onClick={() => { void live.act("phrase", "hi", t.from.userId); live.dismiss(t.id); }}>Say hi back</button>
          </div>
        ))}
      </div>

      {handle && (
        <div className="nx-map">
          <Minimap size={170} me={handle.me} view={handle.view} people={handle.peers} place={handle.place} discovered={discovered} onWalk={(p) => { handle.walkTo(p); refocus(); }} />
        </div>
      )}

      <div className="nx-bar">
        {EMOTES.map((e) => (
          <button key={e.id} className="nx-emote" onClick={() => { void live.act("emote", e.id); refocus(); }} title={e.label} aria-label={e.label} disabled={live.status !== "inside"}>{e.emoji}</button>
        ))}
        <span className="nx-bar-sep" />
        <div className="nx-say-wrap">
          <button className="nx-btn is-say" onClick={() => setPhrasing(!phrasing)} aria-expanded={phrasing} disabled={live.status !== "inside"}><MessageCircle size={14} /> Say…</button>
          {phrasing && (
            <div className="nx-phrases" role="menu">
              {PHRASES.map((p) => (
                <button key={p.id} role="menuitem" onClick={() => { void live.act("phrase", p.id); setPhrasing(false); refocus(); }}>{p.text}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <span className="nx-hint">Click to walk · WASD · drag to turn · click a name to say hi</span>

      {(booting || loading || entering || going) && (
        <div className="nx-loading" data-boot={booting || entering || going || undefined} style={{ "--d": going?.room.color ?? (loading ?? DISTRICTS[0]).color } as CSSProperties}>
          <div className="nx-loading-ring"><span /><span /></div>
          <strong>{booting || entering ? "Entering Nexus" : going ? (going.entering ? `Entering ${going.room.name}` : `Back to the ${districtOf(going.room.district).name.replace(/^The /, "")}`) : `Loading ${loading?.name}`}</strong>
          <small>{booting || entering ? `${lemma}: ${tip.current}` : going ? (going.entering ? going.room.subtitle : districtOf(going.room.district).subtitle) : loading?.subtitle}</small>
          <div className="nx-loading-bar"><i /></div>
        </div>
      )}

      {profile && (
        <HubProfile
          player={profile}
          friend={friends?.friends.find((f) => f.player.userId === profile.userId) ?? null}
          requested={!!friends?.outgoing.some((r) => r.player.userId === profile.userId)}
          onClose={() => { setProfile(null); refocus(); }}
          onSay={(id) => void live.act("phrase", id, profile.userId)}
          onWave={() => void live.act("emote", "wave", profile.userId)}
        />
      )}
    </div>
  );
}
