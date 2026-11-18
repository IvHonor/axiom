import { Award, MessageSquare, Settings2, type LucideIcon } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { AssistantPrivacy } from "../../shell/AssistantSettings";
import { DeskQuick } from "../../shell/desk/DeskSettings";
import { showLemma, useLemmaPage, type LemmaPage, type SettingsTab } from "./lemmaPage";
import { useLemmaAreas } from "./parts";
import { useAssistantName } from "./persona";

const VIEWS: { id: LemmaPage; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chats", icon: MessageSquare },
  { id: "achievements", label: "Achievements", icon: Award },
  { id: "settings", label: "Settings", icon: Settings2 },
];

/**
 * Lemma's sidebar: its views (switching the page beside it), what it may
 * see, and whether it's on the desktop. The rest is in its Settings view;
 * its face, Customise and the chats are on the page, so they aren't shown twice.
 */
export function LemmaSidebar({ active, onOpen }: AreaSidebarProps) {
  const { page } = useLemmaPage();
  const me = useAssistantName();
  const areas = useLemmaAreas();
  const go = (view: LemmaPage, tab?: SettingsTab) => {
    showLemma(view, tab);
    onOpen();
  };
  return (
    <div className="assistant-sidebar">
      <nav className="lemma-nav" role="tablist" aria-label={`${me}'s views`}>
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={active && page === id} className={active && page === id ? "is-active" : undefined} onClick={() => go(id)}>
            <Icon size={15} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </nav>

      <section className="assistant-group">
        <h3 className="assistant-heading">What {me} can see</h3>
        <AssistantPrivacy areas={areas} compact />
        <button className="link lemma-nav-more" onClick={() => go("settings", "privacy")}>How what&apos;s sent is used</button>
      </section>

      <section className="assistant-group">
        <h3 className="assistant-heading">On your desktop</h3>
        <DeskQuick />
        <button className="link lemma-nav-more" onClick={() => go("settings", "desktop")}>All desktop settings</button>
      </section>
    </div>
  );
}
