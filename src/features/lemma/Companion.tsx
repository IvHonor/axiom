import { askToTalk } from "./talk";
import { useState, type PointerEvent } from "react";
import { GripHorizontal, MessageSquare, Minus, Palette } from "lucide-react";
import { usePersistentState } from "../../shell/usePersistentState";
import { usePhone, useShortScreen } from "../../shell/usePhone";
import { Face, moodOf } from "./Face";
import { Customise } from "./Customise";
import { doing, toolOf } from "./parts";
import { useLemma } from "./state";
import { useAssistantName } from "./persona";
import { useCompanionPrefs } from "./preferences";
import { useCompanionPlace } from "./companionPlace";

/**
 * A companion beside your other areas, with a remembered compact mode. Drag
 * it (the pill anywhere, the card by its frame) or use the arrow keys to put
 * it where you like; the place syncs to your other devices. On a phone it
 * stays a pill, and tapping it opens Lemma.
 */
export function Companion({ onOpen }: { onOpen: () => void }) {
  const state = useLemma();
  const me = useAssistantName();
  const [savedCompact, setCompact] = usePersistentState("axiom.lemma.compact", (saved) => saved === true);
  const [customising, setCustomising] = useState(false);
  const prefs = useCompanionPrefs();
  const phone = usePhone();
  // A phone, or one held sideways, has no room for the full card.
  const short = useShortScreen();
  const compact = savedCompact || phone || short;
  const tapPill = () => (phone || short ? onOpen() : setCompact(false));
  const pill = useCompanionPlace<HTMLButtonElement>(prefs, tapPill);
  const card = useCompanionPlace<HTMLElement>(prefs);
  if (!prefs.follow && !customising) return null;

  // The card moves by its frame: its face turns when dragged, and its buttons are buttons.
  const fromFrame = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest(".lemma-face, button:not(.lemma-companion-grip), select, a, input")) return;
    card.handle.onPointerDown(e);
  };

  return <>
    {!prefs.follow ? null : compact ? (
      <button
        ref={pill.ref}
        className={`lemma-companion-peek${pill.dragging ? " is-dragging" : ""}`}
        style={pill.style}
        {...pill.handle}
        onKeyDown={pill.onArrow}
        onClick={tapPill}
        aria-label={phone || short ? `Open ${me}` : `Show ${me} companion`}
        aria-description="Drag, or use the arrow keys, to move it."
        title={phone || short ? `Open ${me}` : `Show ${me} companion (drag to move)`}
      >
        <Face mood={moodOf(state)} size={38} alive={false} /> {me}
      </button>
    ) : (
      <aside
        ref={card.ref}
        className={`lemma-companion-dock${card.dragging ? " is-dragging" : ""}`}
        style={{ ...card.style, width: prefs.size + 4 }}
        aria-label={`${me} companion`}
        {...card.handle}
        onPointerDown={fromFrame}
      >
        <button className="icon-btn lemma-companion-grip" title={`Move ${me} (drag, or arrow keys)`} aria-label={`Move ${me}: drag, or use the arrow keys`} onKeyDown={card.onArrow}>
          <GripHorizontal size={13} />
        </button>
        <button className="icon-btn lemma-companion-min" onClick={() => setCompact(true)} title={`Minimise ${me}`} aria-label={`Minimise ${me}`}><Minus size={13} /></button>
        <Face mood={moodOf(state)} level={state.level} tool={toolOf(state)} size={prefs.size} interactive onTalk={() => { onOpen(); askToTalk(); }} />
        <p aria-live="polite">{doing(state) ?? "Right here with you."}</p>
        <div className="lemma-companion-actions">
          <button className="btn btn-sm btn-ghost" onClick={onOpen}><MessageSquare size={12} /> Chat</button>
          <button className="icon-btn" onClick={() => setCustomising(true)} title={`Customise ${me}`} aria-label={`Customise ${me}`}><Palette size={14} /></button>
        </div>
      </aside>
    )}
    {customising && <Customise onClose={() => setCustomising(false)} />}
  </>;
}
