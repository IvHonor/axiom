// Someone's profile card in Nexus: who they are and their AI, and the ways to
// reach them (say hi, wave, a set phrase, cheer them on or add them).
import { useState, type CSSProperties } from "react";
import { MessageCircle, UserPlus, Zap } from "lucide-react";
import { Modal } from "../../../shell/ui/Modal";
import * as api from "../api";
import { displayName, type Player } from "../api";
import { Duo } from "../Duo";
import { glowOf, lemmaName } from "../PeerLemma";
import { refresh, setFriends, usePlayground } from "../store";
import { PHRASES } from "./api";
import "./hub.css";

/** Someone's profile, from Nexus: say hi, wave, cheer or add them. */
export function HubProfile({ player, friend, requested, onClose, onSay, onWave }: {
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
