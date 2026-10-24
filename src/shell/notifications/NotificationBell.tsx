import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { findExtension } from "../../extensions";
import { dismiss, extensionOf, markRead, useNotifications, type AppNotification } from "../../lib/notifications";
import { ago } from "../format";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { useNow } from "../useSync";

/** The bell in the top bar: a count of unread notifications, and the list. */
export function NotificationBell({ onOpen }: { onOpen: (extension: string) => void }) {
  const { notifications, unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const now = useNow();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const choose = (n: AppNotification) => {
    void markRead(n.id);
    setOpen(false);
    onOpen(extensionOf(n.kind));
  };

  return (
    <div className="bell" ref={root}>
      <button
        className={`bell-button${open ? " is-open" : ""}`}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={16} strokeWidth={1.75} />
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <section className="bell-panel" role="dialog" aria-label="Notifications">
          <header className="bell-head">
            <h2>Notifications</h2>
            {unread > 0 && (
              <button className="icon-btn" title="Mark all as read" aria-label="Mark all as read" onClick={() => void markRead()}>
                <CheckCheck size={15} strokeWidth={1.75} />
              </button>
            )}
            {notifications.length > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={() => void dismiss()}>
                Clear all
              </button>
            )}
          </header>
          {notifications.length === 0 ? (
            <div className="bell-empty">
              <Bell size={22} strokeWidth={1.25} />
              <p>You're all caught up.</p>
              <p className="dim">Reminders and summaries from your extensions show up here. Choose which ones on each extension's page.</p>
            </div>
          ) : (
            <ul className="bell-list">
              {notifications.map((n) => {
                const ext = findExtension(extensionOf(n.kind));
                return (
                  <li key={n.id} className={`bell-item${n.readAt ? "" : " is-unread"}`}>
                    <button className="bell-item-main" onClick={() => choose(n)}>
                      {ext ? <ExtensionIcon ext={ext} size={16} /> : <Bell size={16} />}
                      <span className="bell-item-text">
                        <span className="bell-item-title">{n.title}</span>
                        {n.body && <span className="bell-item-body">{n.body}</span>}
                        <span className="bell-item-meta">
                          {ext?.name ?? "Axiom"} · {ago(n.createdAt, now)}
                        </span>
                      </span>
                    </button>
                    <button className="icon-btn bell-item-dismiss" aria-label="Dismiss" title="Dismiss" onClick={() => void dismiss(n.id)}>
                      <X size={13} strokeWidth={1.75} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
