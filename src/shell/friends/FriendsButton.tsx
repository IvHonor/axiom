// Friends, in the top bar beside notifications: for everyone signed in,
// whether or not they're on the Playground's boards. The count is friend
// requests waiting for an answer.
import { useEffect, useRef, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { FriendsPanel } from "../../features/playground/FriendsPanel";
import { refresh, usePlayground } from "../../features/playground/store";

/** How often the request count is checked while Axiom is open. */
const EVERY = 5 * 60 * 1000;

/** `onOpenPlayground` switches the Playground on if it's off: entering it means having it. */
export function FriendsButton({ playgroundOn, onOpenPlayground }: { playgroundOn: boolean; onOpenPlayground: () => void }) {
  const { me, friends, signedIn } = usePlayground();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const waiting = friends?.incoming.length ?? me?.requests ?? 0;

  useEffect(() => {
    if (!signedIn) return;
    const every = window.setInterval(() => void refresh(), EVERY);
    return () => window.clearInterval(every);
  }, [signedIn]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    // A window opened from it (the garden, bigger) is its own: clicks there aren't "away".
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".modal-backdrop") && setOpen(false);
    // Escape closes the garden window first, then the pop-out.
    const escape = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".gd-modal") && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="bell friends" ref={root}>
      <button
        className={`bell-button${open ? " is-open" : ""}`}
        aria-label={waiting ? `Friends, ${waiting} waiting for your answer` : "Friends"}
        title="Friends"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Users size={16} strokeWidth={1.75} />
        {waiting > 0 && <span className="bell-count">{waiting > 9 ? "9+" : waiting}</span>}
      </button>
      {open && (
        <section className="bell-panel friends-panel" role="dialog" aria-label="Friends">
          <header className="bell-head">
            <h2>Friends</h2>
            {me && (
              <button className="btn btn-sm btn-ghost" onClick={() => { setOpen(false); onOpenPlayground(); }} title={playgroundOn ? undefined : "Switches the Playground on"}>
                <Trophy size={13} /> {me.inPlayground && playgroundOn ? "Playground" : "Compete"}
              </button>
            )}
          </header>
          <div className="friends-body">
            <FriendsPanel garden={230} />
          </div>
        </section>
      )}
    </div>
  );
}
