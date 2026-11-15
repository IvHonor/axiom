// Someone and their Lemma: their profile picture is who they are, and their
// Lemma floats beside them like the assistant it is. "side" (the podium,
// profile cards) puts a bigger Lemma at their shoulder; "corner" (lists)
// tucks a small one against the picture.
import { useEffect, useState, type CSSProperties } from "react";
import type { Mood } from "../lemma/Face";
import * as api from "./api";
import { displayName, type Player } from "./api";
import { PeerLemma, glowOf, lemmaName } from "./PeerLemma";

// Pictures are fetched once per version and kept for the session.
const loaded = new Map<string, string | null>();
const loading = new Map<string, Promise<string | null>>();
const keyOf = (p: Player) => `${p.userId}:${p.avatar}`;

function usePicture(player: Player): string | null {
  const key = player.avatar ? keyOf(player) : null;
  const [picture, setPicture] = useState<string | null>(() => (key ? loaded.get(key) ?? null : null));
  useEffect(() => {
    if (!key) return setPicture(null);
    if (loaded.has(key)) return setPicture(loaded.get(key)!);
    let live = true;
    let pending = loading.get(key);
    if (!pending) {
      pending = api.getAvatar(player.userId).catch(() => null).then((avatar) => {
        // Only pictures the server checked are shown (see `check_avatar`).
        const safe = avatar && /^data:image\/(png|jpeg|webp);base64,/.test(avatar) ? avatar : null;
        loaded.set(key, safe);
        loading.delete(key);
        return safe;
      });
      loading.set(key, pending);
    }
    void pending.then((p) => live && setPicture(p));
    return () => { live = false; };
  }, [key, player.userId]);
  return picture;
}

/** Their picture, or their initial on their Lemma's colour. */
export function PlayerAvatar({ player, size }: { player: Player; size: number }) {
  const picture = usePicture(player);
  const letter = (player.name?.trim() || player.handle)[0]?.toUpperCase() ?? "?";
  return (
    <span className="pg-avatar" style={{ width: size, height: size, "--glow": glowOf(player), fontSize: size * 0.42 } as CSSProperties} role="img" aria-label={displayName(player)}>
      {picture ? <img src={picture} alt="" draggable={false} /> : <span aria-hidden="true">{letter}</span>}
    </span>
  );
}

interface DuoProps {
  player: Player;
  /** The picture's size; the Lemma is drawn in proportion. */
  size: number;
  placement?: "side" | "corner";
  /** The live 3D Lemma (podium and cards only: each costs a WebGL context). */
  alive?: boolean;
  mood?: Mood;
  lemmaSize?: number;
}

export function Duo({ player, size, placement = "corner", alive = false, mood = "idle", lemmaSize }: DuoProps) {
  const lemma = lemmaSize ?? Math.round(size * (placement === "side" ? 0.72 : 0.62));
  return (
    <span className="pg-duo" data-placement={placement} style={{ "--duo": `${size}px`, "--duo-lemma": `${lemma}px` } as CSSProperties} title={`${displayName(player)} with ${lemmaName(player)}`}>
      <PlayerAvatar player={player} size={size} />
      <span className="pg-duo-lemma"><PeerLemma player={player} size={lemma} alive={alive} mood={mood} /></span>
    </span>
  );
}
