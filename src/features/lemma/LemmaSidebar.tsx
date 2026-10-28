import { useState } from "react";
import { MessageSquare, Palette } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { AssistantSettings } from "../../shell/AssistantSettings";
import { Customise } from "./Customise";
import { Face, moodOf } from "./Face";
import { useLemmaAreas } from "./parts";
import { useLemma } from "./state";
import { useAssistantName } from "./persona";

/** Lemma's sidebar: open the chats, and choose what it may see and which AI keys it uses. */
export function LemmaSidebar({ onOpen }: AreaSidebarProps) {
  const [customising, setCustomising] = useState(false);
  const state = useLemma();
  const me = useAssistantName();
  return (
    <div className="assistant-sidebar">
      <button className="lemma-sidebar-face" onClick={() => setCustomising(true)} title={`Customise ${me}`}>
        <Face mood={moodOf(state)} size={150} level={state.level} />
      </button>
      <p className="field-hint">{me}, Axiom Intelligence, plans your day, keeps track of birthdays and more. It shows you every change before it makes it.</p>
      <button className="btn assistant-open" onClick={onOpen}>
        <MessageSquare size={14} strokeWidth={1.75} /> Open {me}
      </button>
      <button className="btn btn-ghost assistant-open" onClick={() => setCustomising(true)}>
        <Palette size={14} strokeWidth={1.75} /> Customise {me}
      </button>
      {customising && <Customise onClose={() => setCustomising(false)} />}
      <AssistantSettings areas={useLemmaAreas()} />
    </div>
  );
}
