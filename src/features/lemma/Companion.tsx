import { askToTalk } from "./talk";
import { useState } from "react";
import { MessageSquare, Minus, Palette } from "lucide-react";
import { usePersistentState } from "../../shell/usePersistentState";
import { Face, moodOf } from "./Face";
import { Customise } from "./Customise";
import { doing, toolOf } from "./parts";
import { useLemma } from "./state";
import { useAssistantName } from "./persona";
import { useCompanionPrefs } from "./preferences";

/** A companion beside your other areas, with a remembered compact mode. */
export function Companion({ onOpen }: { onOpen: () => void }) {
  const state = useLemma();
  const me = useAssistantName();
  const [compact, setCompact] = usePersistentState("axiom.lemma.compact", (saved) => saved === true);
  const [customising, setCustomising] = useState(false);
  const prefs = useCompanionPrefs();
  if (!prefs.follow && !customising) return null;
  const position = { left: prefs.corner.endsWith("left") ? 18 : "auto", right: prefs.corner.endsWith("right") ? 18 : "auto", top: prefs.corner.startsWith("top") ? 54 : "auto", bottom: prefs.corner.startsWith("bottom") ? 38 : "auto" };
  return <>
    {!prefs.follow ? null : compact ? <button className="lemma-companion-peek" style={position} onClick={() => setCompact(false)} aria-label={`Show ${me} companion`} title={`Show ${me} companion`}>
      <Face mood={moodOf(state)} size={38} alive={false} /> {me}
    </button> : <aside className="lemma-companion-dock" style={{ ...position, width: prefs.size + 4 }} aria-label={`${me} companion`}>
      <button className="icon-btn" onClick={() => setCompact(true)} title={`Minimise ${me}`} aria-label={`Minimise ${me}`}><Minus size={13} /></button>
      <Face mood={moodOf(state)} level={state.level} tool={toolOf(state)} size={prefs.size} interactive onTalk={() => { onOpen(); askToTalk(); }} />
      <p aria-live="polite">{doing(state) ?? "Right here with you."}</p>
      <div className="lemma-companion-actions">
        <button className="btn btn-sm btn-ghost" onClick={onOpen}><MessageSquare size={12} /> Chat</button>
        <button className="icon-btn" onClick={() => setCustomising(true)} title={`Customise ${me}`} aria-label={`Customise ${me}`}><Palette size={14} /></button>
      </div>
    </aside>}
    {customising && <Customise onClose={() => setCustomising(false)} />}
  </>;
}
