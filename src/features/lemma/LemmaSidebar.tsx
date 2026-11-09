import type { AreaSidebarProps } from "../../extensions/types";
import { AssistantSettings } from "../../shell/AssistantSettings";
import { useLemmaAreas } from "./parts";

/**
 * Lemma's sidebar: what it may see. Lemma itself (its face, Customise, the
 * chats) is on its page beside this, so it isn't shown twice.
 */
export function LemmaSidebar(_props: AreaSidebarProps) {
  return (
    <div className="assistant-sidebar">
      <AssistantSettings areas={useLemmaAreas()} />
    </div>
  );
}
