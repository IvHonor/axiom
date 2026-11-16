import { useEffect } from "react";
import { Modal } from "../../shell/ui/Modal";
import { FriendsPanel } from "./FriendsPanel";
import { refresh } from "./store";

/** The full friends area is mounted only when requested, above the sidebar. */
export function FriendsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    void refresh();
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".pg-friends-dialog")!;
    dialog.setAttribute("aria-modal", "true");
    dialog.querySelector<HTMLElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", trap);
    return () => { dialog.removeEventListener("keydown", trap); previous?.focus(); };
  }, []);
  return <Modal title="Friends" onClose={onClose} width={560} className="pg-modal pg-friends-dialog">
    <FriendsPanel garden={210} expandGarden={false} />
  </Modal>;
}
