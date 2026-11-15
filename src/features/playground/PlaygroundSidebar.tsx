// The Playground's sidebar: friends (the same as the top bar's pop-out), and
// a way in to the boards for those not on them yet.
import { Trophy } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { FriendsPanel } from "./FriendsPanel";
import { useAssistantName } from "../lemma/persona";
import { usePlayground } from "./store";

export function PlaygroundSidebar({ onOpen }: AreaSidebarProps) {
  const { me } = usePlayground();
  const lemma = useAssistantName();
  return (
    <div className="pg-sidebar">
      {me && !me.inPlayground && (
        <button className="pg-side-cta" onClick={onOpen}>
          <Trophy size={16} />
          <span><strong>Enter the Playground</strong><small>Compete with your friends and show off {lemma}.</small></span>
        </button>
      )}
      <FriendsPanel garden={180} />
    </div>
  );
}
