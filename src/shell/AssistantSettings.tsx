import type { ExtensionManifest } from "../extensions/types";
import { Switch } from "./ui/Switch";
import { useAssistantAreas } from "./useAssistantAreas";
import { useAssistantName } from "../features/lemma/persona";

/**
 * Which areas Lemma may see. `compact` (the sidebar) leaves out the
 * explanation, but never the consent asked for before Journal is switched on.
 */
export function AssistantPrivacy({ areas, compact = false }: { areas: ExtensionManifest[]; compact?: boolean }) {
  const { areas: allowed, setAllowed } = useAssistantAreas();
  const me = useAssistantName();
  return (
    <div className="assistant-group">
      {!compact && (
        <p className="field-hint">
          Only the areas you switch on are sent to the AI (Groq), and only when you ask something. What&apos;s sent isn&apos;t used to train AI
          models. {me} only writes in Journal and Notes when you ask, and only ever adds to them.
        </p>
      )}
      <ul className="assistant-areas">
        {areas.map((ext) => (
          <li key={ext.id}>
            <span className="assistant-area-name">
              {ext.name}
              {ext.id === "journal" && (
                <small className="field-hint">
                  {compact
                    ? `Can be sensitive: switching it on is your consent for ${me} to send entries to the AI.`
                    : `Entries can include sensitive things, like your health. Switching this on is your consent for ${me} to send what it reads in them to the AI.`}
                </small>
              )}
            </span>
            <Switch on={allowed.includes(ext.id)} onChange={(on) => setAllowed(ext.id, on)} label={`Let ${me} use ${ext.name}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
