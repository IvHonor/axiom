// Someone's Lemma, drawn from what they share: a still illustration for
// lists, or the live 3D companion on the podium and in profile cards.
import { useMemo, type CSSProperties } from "react";
import { Face, type Mood } from "../lemma/Face";
import { normaliseLook } from "../lemma/look";
import { nameOf, normalisePersona } from "../lemma/persona";
import type { Player } from "./api";

interface PeerLemmaProps {
  player: Player;
  size: number;
  /** The live 3D Lemma (costs a WebGL context: keep these few). */
  alive?: boolean;
  mood?: Mood;
  interactive?: boolean;
}

export function PeerLemma({ player, size, alive = false, mood = "idle", interactive = false }: PeerLemmaProps) {
  const look = useMemo(() => normaliseLook(player.lemma.look), [player.lemma.look]);
  const persona = normalisePersona({ name: player.lemma.name, personality: player.lemma.personality });
  const peer = useMemo(
    () => ({ personality: persona.personality, name: persona.name, admin: player.perks.admin, firstLight: player.perks.firstLight }),
    [persona.personality, persona.name, player.perks.admin, player.perks.firstLight],
  );
  return (
    <span className="pg-lemma" data-alive={alive || undefined} style={{ width: size, height: size } as CSSProperties}>
      <Face look={look} mood={mood} size={size} alive={alive} peer={peer} interactive={interactive} quiet={!alive} />
    </span>
  );
}

/** "Pixel", or "Lemma" when they kept the name. */
export const lemmaName = (player: Player) => nameOf(normalisePersona({ name: player.lemma.name }));

/** Their Lemma's glow, for spotlights and bars. Theme glows follow the viewer's accent. */
export function glowOf(player: Player): string {
  const glow = normaliseLook(player.lemma.look).glow;
  return glow === "theme" ? "var(--accent)" : glow;
}
