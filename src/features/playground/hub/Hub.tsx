// The Hub: walk your AI through the Plaza, the Library, the Focus Lab, the
// Garden Terrace and the Arcade, and meet whoever's there right now. Click the
// floor (or use the arrow keys) to walk, walk into a door to change rooms,
// click someone to see their profile and wave, say hi or add them, and use the
// emote bar to dance, clap or say a quick phrase. Only people actually in the
// Hub are here: close it and your AI's gone.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DoorOpen, LogOut, MapPin, MessageCircle, Sparkles, UserPlus, Users, Zap } from "lucide-react";
import { Face } from "../../lemma/Face";
import { useAssistantName, usePersona } from "../../lemma/persona";
import { Modal } from "../../../shell/ui/Modal";
import * as api from "../api";
import { displayName, type Player } from "../api";
import { Duo, PlayerAvatar } from "../Duo";
import { HandleForm } from "../HandleForm";
import { PeerLemma, glowOf, lemmaName } from "../PeerLemma";
import { reaction } from "../garden/lines";
import { refresh, setFriends, usePlayground } from "../store";
import { EMOTES, PHRASES, SHOW_MS, emoteOf, peekHub, phraseOf, type HubPeek } from "./api";
import { ROOMS, ROOM_ORDER, type RoomId } from "./rooms";
import { Scene, type Layout } from "./scenes";
import { moving, position, useHub, type Remote } from "./useHub";
import "./hub.css";

const random = () => Math.random();

/** A word over someone's head that only you see: their AI reacting to you. */
interface LocalLine { text: string; emoji: string; until: number }

export function Hub() {
  const { me, friends, signedIn } = usePlayground();
  const h = useHub();
  const lemma = useAssistantName();
  const persona = usePersona();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [profile, setProfile] = useState<Player | null>(null);
  const [phrasing, setPhrasing] = useState(false);
  const [map, setMap] = useState(false);
  const [local, setLocal] = useState<Record<string, LocalLine>>({});
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const sized = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    sized.observe(el);
    return () => sized.disconnect();
  }, [h.status]);

  const layout: Layout = useMemo(() => {
    const wall = size.height * 0.34;
    return { width: size.width, height: size.height, wall, px: (x: number) => x * size.width, py: (y: number) => wall + y * (size.height - wall - 12) };
  }, [size]);
  const base = Math.max(44, Math.min(86, size.height * 0.13));
  const scaleAt = (y: number) => 0.78 + 0.38 * y;

  // Everyone moves every frame (no re-rendering); you walk.
  useEffect(() => {
    if (h.status !== "inside" || !size.width) return;
    let frame = 0, last = performance.now();
    const place = (el: HTMLDivElement | undefined, x: number, y: number, walking: boolean, facing: number) => {
      if (!el) return;
      const s = base * scaleAt(y);
      el.style.transform = `translate(${layout.px(x) - s / 2}px, ${layout.py(y) - s}px)`;
      el.style.width = el.style.height = `${s}px`;
      el.style.zIndex = String(100 + Math.round(y * 500));
      el.dataset.walking = walking ? "1" : "";
      el.dataset.facing = facing > 0 ? "right" : "left";
    };
    const tick = (now: number) => {
      h.step(Math.min(64, now - last));
      last = now;
      const m = h.me.current;
      place(els.current.get("me"), m.x, m.y, m.moving, m.facing);
      for (const [id, r] of h.people.current) {
        const at = position(r, now);
        place(els.current.get(id), at.x, at.y, moving(r, now), r.facing);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // h's functions are stable; positions live in refs.
  }, [h.status, size.width, size.height, layout, base, h.step, h.me, h.people]);

  // Waves and hi's sent to you: your AI greets them back, in its own words.
  useEffect(() => {
    const latest = h.toasts[h.toasts.length - 1];
    if (!latest) return;
    const line = reaction(persona.personality, false, latest.from.name?.split(" ")[0] || `@${latest.from.handle}`, random);
    setLocal((l) => ({ ...l, me: { ...line, until: Date.now() + 3000 } }));
    const gone = window.setTimeout(() => h.dismiss(latest.id), 6000);
    return () => window.clearTimeout(gone);
    // Only when one arrives.
  }, [h.toasts.length]);

  // Local lines fade.
  useEffect(() => {
    const keys = Object.keys(local);
    if (!keys.length) return;
    const t = window.setTimeout(() => setLocal((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v.until > Date.now()))), 500);
    return () => window.clearTimeout(t);
  }, [local]);

  if (!signedIn) return <div className="hub-outside"><div className="hub-card"><h2>The Hub</h2><p>Sign in to meet everyone's AIs.</p></div></div>;
  if (me === undefined) return <div className="hub-outside"><div className="hub-card"><p>Connecting…</p></div></div>;
  if (h.status !== "inside") return <Outside entering={h.status === "entering"} notice={h.notice} onEnter={(room) => void h.enter(room)} hasHandle={!!me} />;

  const floorPoint = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = host.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top - layout.wall) / (size.height - layout.wall - 12);
    return { x, y };
  };
  const walkTo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(".hub-char, .hub-ui")) return;
    const p = floorPoint(e);
    if (p.y < -0.08) return;
    h.moveTo(p.x, Math.max(0.01, p.y));
    setPhrasing(false);
  };
  const keyDown = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) {
      e.preventDefault();
      h.keys.current.add(e.key);
    }
  };
  const keyUp = (e: KeyboardEvent) => h.keys.current.delete(e.key);

  /** Walks to the door that leads towards `room`. */
  const head = (room: RoomId) => {
    const here = ROOMS[h.room];
    const door = here.doors.find((d) => d.to === room) ?? here.doors.find((d) => d.to === "plaza");
    if (door) h.moveTo(door.x + door.w / 2, door.y + door.h / 2);
    setMap(false);
  };

  const poke = (p: Player) => {
    const line = reaction(p.lemma.personality, false, me?.player.name?.split(" ")[0] || "you", random);
    setLocal((l) => ({ ...l, [p.userId]: { ...line, until: Date.now() + 2500 } }));
    setProfile(p);
  };

  const remotes = [...h.people.current.values()];
  const now = performance.now();
  const shownOf = (r: Remote) => (r.shown && now - r.shownAt < SHOW_MS ? r.shown : null);
  const myShown = h.mine && now - h.mine.at < SHOW_MS ? h.mine : null;

  return (
    <div className="hub" data-room={h.room}>
      <div className="hub-top hub-ui">
        <div className="hub-room-name">
          <MapPin size={14} />
          <strong>{ROOMS[h.room].name}</strong>
          <span>{ROOMS[h.room].tagline}</span>
        </div>
        <span className="hub-online"><i /> {h.online} online</span>
        <div className="hub-map-wrap">
          <button className="hub-btn" onClick={() => setMap(!map)} aria-expanded={map}><DoorOpen size={14} /> Rooms</button>
          {map && (
            <div className="hub-map" role="menu">
              {ROOM_ORDER.map((id) => (
                <button key={id} role="menuitem" data-here={id === h.room || undefined} disabled={id === h.room} onClick={() => head(id)}>
                  <span>{ROOMS[id].name}</span>
                  <b>{h.counts.find((c) => c.id === id)?.count ?? 0}</b>
                </button>
              ))}
              <small>Your AI walks to the door that leads there.</small>
            </div>
          )}
        </div>
        <button className="hub-btn is-leave" onClick={() => void h.leave()}><LogOut size={14} /> Leave</button>
      </div>

      <div
        ref={host}
        className="hub-room"
        tabIndex={0}
        onPointerDown={walkTo}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onBlur={() => h.keys.current.clear()}
        aria-label={`${ROOMS[h.room].name}. Click the floor or use the arrow keys to walk.`}
      >
        {size.width > 0 && <Scene room={h.room} layout={layout} counts={h.counts} online={h.online} />}

        {me && (
          <Character
            key="me"
            player={me.player}
            you
            name={lemma}
            setRef={(el) => { if (el) els.current.set("me", el); else els.current.delete("me"); }}
            shown={myShown ? { kind: myShown.kind, id: myShown.id } : null}
            local={local.me}
            mood={h.spot === "desk" ? "thinking" : h.spot === "nook" ? "sleepy" : myShown ? "happy" : "idle"}
            onClick={() => setPhrasing((p) => !p)}
          />
        )}
        {remotes.map((r) => {
          const shown = shownOf(r);
          return (
            <Character
              key={r.player.userId}
              player={r.player}
              name={lemmaName(r.player)}
              setRef={(el) => { if (el) els.current.set(r.player.userId, el); else els.current.delete(r.player.userId); }}
              shown={shown}
              aimedAtYou={!!shown?.to && shown.to === me?.player.userId}
              local={local[r.player.userId]}
              mood={shown ? "happy" : "idle"}
              friend={!!friends?.friends.some((f) => f.player.userId === r.player.userId)}
              onClick={() => poke(r.player)}
            />
          );
        })}
        {!remotes.length && <div className="hub-alone hub-ui">Nobody else is in {ROOMS[h.room].name.replace("The ", "the ")} right now. Try another room, or invite a friend.</div>}
      </div>

      <div className="hub-bar hub-ui">
        {EMOTES.map((e) => (
          <button key={e.id} className="hub-emote" onClick={() => void h.act("emote", e.id)} title={e.label} aria-label={e.label}>{e.emoji}</button>
        ))}
        <span className="hub-bar-sep" />
        <div className="hub-say-wrap">
          <button className="hub-btn is-say" onClick={() => setPhrasing(!phrasing)} aria-expanded={phrasing}><MessageCircle size={14} /> Say…</button>
          {phrasing && (
            <div className="hub-phrases" role="menu">
              {PHRASES.map((p) => (
                <button key={p.id} role="menuitem" onClick={() => { void h.act("phrase", p.id); setPhrasing(false); }}>{p.text}</button>
              ))}
            </div>
          )}
        </div>
        <span className="hub-hint">Click to walk · arrow keys · walk into a door</span>
      </div>

      <div className="hub-toasts hub-ui" aria-live="polite">
        {h.toasts.map((t) => (
          <div key={t.id} className="hub-toast" style={{ "--glow": glowOf(t.from) } as CSSProperties}>
            <Duo player={t.from} size={30} />
            <span><strong>{lemmaName(t.from)}</strong> <small>@{t.from.handle}</small><br />{t.emoji} {t.text}</span>
            <button onClick={() => { void h.act("phrase", "hi", t.from.userId); h.dismiss(t.id); }}>Say hi back</button>
          </div>
        ))}
      </div>
      {h.notice && <div className="hub-notice hub-ui" role="status" onClick={h.clearNotice}>{h.notice}</div>}

      {profile && (
        <HubProfile
          player={profile}
          friend={friends?.friends.find((f) => f.player.userId === profile.userId) ?? null}
          requested={!!friends?.outgoing.some((r) => r.player.userId === profile.userId)}
          onClose={() => setProfile(null)}
          onSay={(id) => void h.act("phrase", id, profile.userId)}
          onWave={() => void h.act("emote", "wave", profile.userId)}
        />
      )}
    </div>
  );
}

interface CharacterProps {
  player: Player;
  name: string;
  you?: boolean;
  friend?: boolean;
  setRef: (el: HTMLDivElement | null) => void;
  shown: { kind: string; id: string } | null;
  aimedAtYou?: boolean;
  local?: LocalLine;
  mood: "idle" | "happy" | "thinking" | "sleepy";
  onClick: () => void;
}

/** Someone's AI in the room: it, its shadow, a name tag, and what it's saying. */
function Character({ player, name, you, friend, setRef, shown, aimedAtYou, local, mood, onClick }: CharacterProps) {
  const emote = shown?.kind === "emote" ? emoteOf(shown.id) : null;
  const words = shown?.kind === "phrase" ? phraseOf(shown.id) : null;
  return (
    <div ref={setRef} className="hub-char" data-you={you || undefined} data-emote={emote?.id} style={{ "--glow": glowOf(player) } as CSSProperties}>
      <span className="hub-char-shadow" />
      {you && <span className="hub-char-ring" />}
      <button className="hub-char-body" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={you ? `You: ${name}. Click to say something.` : `${name}, ${displayName(player)}'s AI. Click for their profile.`}>
        <PeerLemma player={player} size={86} mood={emote ? "happy" : mood} />
      </button>
      {(emote || words || local) && (
        <span className="hub-bubble" data-aimed={aimedAtYou || undefined} key={`${shown?.id ?? ""}${local?.text ?? ""}`}>
          {emote && <span className="hub-bubble-emoji">{emote.emoji}</span>}
          {words && <span>{words}</span>}
          {!emote && !words && local && <><span className="hub-bubble-emoji">{local.emoji}</span><span>{local.text}</span></>}
        </span>
      )}
      <span className="hub-tag">
        <PlayerAvatar player={player} size={14} />
        <strong>{name}</strong>
        {you ? <em>you</em> : friend ? <Users size={10} aria-label="friend" /> : null}
      </span>
    </div>
  );
}

/** Someone's profile, from the Hub: say hi, wave, cheer or add them. */
function HubProfile({ player, friend, requested, onClose, onSay, onWave }: {
  player: Player;
  friend: api.Friend | null;
  requested: boolean;
  onClose: () => void;
  onSay: (id: string) => void;
  onWave: () => void;
}) {
  const { friends } = usePlayground();
  const [note, setNote] = useState<string | null>(null);
  const add = async () => {
    try {
      const added = await api.addFriend({ handle: player.handle });
      setNote(added.outcome === "friends" ? "You're friends now!" : "Friend request sent.");
      void refresh();
    } catch (e) {
      setNote(String(e));
    }
  };
  const cheer = async () => {
    try {
      await api.cheer(player.userId);
      if (friends) setFriends({ ...friends, friends: friends.friends.map((f) => (f.player.userId === player.userId ? { ...f, cheered: true } : f)) });
      setNote(`You cheered ${displayName(player)} on!`);
    } catch (e) {
      setNote(String(e));
    }
  };
  return (
    <Modal title={displayName(player)} onClose={onClose} width={420} className="pg-modal">
      <div className="pg-card hub-profile" style={{ "--glow": glowOf(player) } as CSSProperties}>
        <div className="pg-card-stage">
          <span className="pg-spot" aria-hidden="true" />
          <Duo player={player} size={110} placement="side" lemmaSize={96} alive mood="happy" />
        </div>
        <h3>{displayName(player)}</h3>
        <p className="pg-card-sub">@{player.handle} · <strong>{lemmaName(player)}</strong>, {player.lemma.personality}</p>
        <div className="pg-card-badges">
          {friend && <span>Friend</span>}
          {player.perks.firstLight && <span>First Light</span>}
          {player.perks.admin && <span>Admin</span>}
        </div>
        <div className="hub-profile-actions">
          <button className="pg-enter" onClick={() => { onSay("hi"); setNote(`You said hi to ${lemmaName(player)}.`); }}><MessageCircle size={14} /> Say hi</button>
          <button className="pg-enter is-soft" onClick={() => { onWave(); setNote("👋"); }}>👋 Wave</button>
          {friend ? (
            <button className="pg-enter is-soft" disabled={friend.cheered} onClick={() => void cheer()}><Zap size={14} /> {friend.cheered ? "Cheered" : "Cheer"}</button>
          ) : requested ? (
            <span className="pg-note">Request sent</span>
          ) : (
            <button className="pg-enter is-soft" onClick={() => void add()}><UserPlus size={14} /> Add friend</button>
          )}
        </div>
        <div className="hub-profile-phrases">
          {PHRASES.filter((p) => ["streak", "luck", "got_this", "gg", "reading", "friends"].includes(p.id)).map((p) => (
            <button key={p.id} onClick={() => { onSay(p.id); setNote(`You said “${p.text}”`); }}>{p.text}</button>
          ))}
        </div>
        {note && <p className="pg-note" role="status">{note}</p>}
      </div>
    </Modal>
  );
}

/** Outside: a look in (who's where), and the way in. */
function Outside({ entering, notice, onEnter, hasHandle }: { entering: boolean; notice: string | null; onEnter: (room: RoomId) => void; hasHandle: boolean }) {
  const lemma = useAssistantName();
  const [peek, setPeek] = useState<HubPeek | null>(null);
  useEffect(() => {
    if (!hasHandle) return;
    let live = true;
    const load = () => peekHub().then((p) => live && setPeek(p), () => {});
    void load();
    const every = window.setInterval(load, 10_000);
    return () => { live = false; window.clearInterval(every); };
  }, [hasHandle]);
  return (
    <div className="hub-outside">
      <div className="hub-outside-crowd" aria-hidden="true">
        {(peek?.plaza ?? []).slice(0, 10).map((p, i) => (
          <span key={p.player.userId} className="hub-peek-ai" style={{ left: `${4 + ((i * 0.37 + p.x * 0.5) % 1) * 88}%`, bottom: `${3 + (1 - p.y) * 7}%`, animationDelay: `${-i * 0.6}s` }}>
            <PeerLemma player={p.player} size={54} />
          </span>
        ))}
      </div>
      <div className="hub-card">
        <span className="pg-kicker"><Sparkles size={12} /> Live now</span>
        <h2>The Hub</h2>
        <p>Walk {lemma} through the Plaza, the Library, the Focus Lab, the Garden Terrace and the Arcade, and meet whoever's there right now.</p>
        {!hasHandle ? (
          <HandleForm />
        ) : (
          <>
            <div className="hub-outside-me">
              <Face mood="happy" size={92} interactive />
              <div>
                <strong className="hub-outside-online"><i /> {peek ? peek.online : "…"} online</strong>
                <ul>{(peek?.rooms ?? []).map((r) => <li key={r.id}><button onClick={() => onEnter(r.id)} disabled={entering}>{ROOMS[r.id].name.replace("The ", "")} <b>{r.count}</b></button></li>)}</ul>
              </div>
            </div>
            <button className="pg-enter hub-enter" onClick={() => onEnter("plaza")} disabled={entering}>{entering ? "Entering…" : "Enter the Hub"}</button>
            <small className="hub-privacy">While you're in, everyone in the Hub can see your name, picture and AI. Close the Hub and you're gone. People talk with emotes and set phrases only.</small>
          </>
        )}
        {notice && <p className="pg-note" role="status">{notice}</p>}
      </div>
    </div>
  );
}
