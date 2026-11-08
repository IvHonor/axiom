import type { ExtensionManifest } from "../extensions/types";
import { Switch } from "./ui/Switch";
import { useAssistantAreas } from "./useAssistantAreas";
import { useAssistantName } from "../features/lemma/persona";
import { DeskSettings } from "./desk/DeskSettings";

/** Lemma's settings: which areas it may see, and whether it comes onto the desktop. */
export function AssistantSettings({ areas }: { areas: ExtensionManifest[] }) {
  const { areas: allowed, setAllowed } = useAssistantAreas();
  const me = useAssistantName();
  return (
    <div className="assistant-settings">
      <section className="assistant-group">
        <h3 className="assistant-heading">What {me} can see</h3>
        <p className="field-hint">
          Only the areas you switch on are sent to the AI (Groq), and only when you ask something. What&apos;s sent isn&apos;t used to train AI
          models. Lemma only writes in Journal and Notes when you ask, and only ever adds to them.
        </p>
        <ul className="assistant-areas">
          {areas.map((ext) => (
            <li key={ext.id}>
              <span className="assistant-area-name">
                {ext.name}
                {ext.id === "journal" && (
                  <small className="field-hint">
                    Entries can include sensitive things, like your health. Switching this on is your consent for {me} to send what it reads in them to the AI.
                  </small>
                )}
              </span>
              <Switch on={allowed.includes(ext.id)} onChange={(on) => setAllowed(ext.id, on)} label={`Let ${me} use ${ext.name}`} />
            </li>
          ))}
        </ul>
      </section>
      <section className="assistant-group">
        <h3 className="assistant-heading">On your desktop</h3>
        <DeskSettings />
      </section>
    </div>
  );
}
