import { Settings2, X } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { AssistantPrivacy } from "../../shell/AssistantSettings";
import { DeskSettings } from "../../shell/desk/DeskSettings";
import { showLemma, useLemmaPage, type SettingsTab } from "./lemmaPage";
import { useAssistantName } from "./persona";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "privacy", label: "Privacy" },
  { id: "desktop", label: "Desktop" },
];

/** Lemma's settings, a view of its page: what it may see, and how it is on the desktop. */
export function LemmaSettings({ areas }: { areas: ExtensionManifest[] }) {
  const { tab } = useLemmaPage();
  const me = useAssistantName();
  return (
    <section className="lemma-main lemma-settings" aria-label={`${me}'s settings`}>
      <header className="lemma-head">
        <Settings2 size={18} strokeWidth={1.75} />
        <h2>{me}&apos;s settings</h2>
        <button className="icon-btn" onClick={() => showLemma("chat")} title="Back to chats" aria-label="Back to chats">
          <X size={15} strokeWidth={1.75} />
        </button>
      </header>
      <div className="lemma-settings-tabs pb-segmented" role="tablist" aria-label="Settings">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : undefined} onClick={() => showLemma("settings", t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="lemma-settings-body" role="tabpanel">
        {tab === "privacy" ? (
          <>
            <h3 className="assistant-heading">What {me} can see</h3>
            <AssistantPrivacy areas={areas} />
          </>
        ) : (
          <DeskSettings />
        )}
      </div>
    </section>
  );
}
