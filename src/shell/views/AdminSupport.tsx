import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Inbox, Mail, RotateCcw, Check } from "lucide-react";
import { kindLabel, setTicketSolved, type Ticket } from "../../lib/support";
import { ago } from "../format";
import { Panel } from "../ui/Panel";
import { useNow } from "../useSync";

/** A reply in the admin's mail app, addressed and with the subject filled in. */
function replyUrl(t: Ticket): string {
  return `mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject} [${t.reference}]`)}`;
}

/** The admin panel's Support tab: messages from the app, answered by email. */
export function AdminSupport({
  tickets,
  busy,
  onChange,
}: {
  tickets: Ticket[];
  busy: boolean;
  onChange: (work: () => Promise<Ticket>) => void;
}) {
  const now = useNow();
  const [showing, setShowing] = useState<"open" | "solved">("open");
  const open = tickets.filter((t) => !t.solvedAt);
  const shown = showing === "open" ? open : tickets.filter((t) => t.solvedAt);

  return (
    <Panel
      title="Support"
      meta={`${open.length} open`}
      actions={
        <div className="admin-filter">
          {(["open", "solved"] as const).map((id) => (
            <button key={id} className={`pb-tab${showing === id ? " is-active" : ""}`} onClick={() => setShowing(id)}>
              {id === "open" ? "Open" : "Solved"}
            </button>
          ))}
        </div>
      }
    >
      {shown.length === 0 ? (
        <div className="admin-empty">
          <Inbox size={22} strokeWidth={1.5} />
          <p>{showing === "open" ? "Nothing waiting for an answer." : "Nothing solved yet."}</p>
          <p className="dim">Messages from Axiom's support button show up here, and each is emailed to your support address.</p>
        </div>
      ) : (
        <ul className="admin-tickets">
          {shown.map((t) => (
            <li key={t.id}>
              <div className="ticket-head">
                <span className={`ticket-kind is-${t.kind}`}>{kindLabel(t.kind)}</span>
                <b className="ticket-subject">{t.subject}</b>
                <span className="dim ticket-ref">{t.reference}</span>
              </div>
              <div className="admin-person-meta">
                {t.email}
                {!t.signedIn && <span title="Sent without signing in, so this address isn't confirmed"> (not confirmed)</span>} · Axiom {t.appVersion} ·{" "}
                {ago(t.createdAt, now)}
                {t.solvedAt && ` · solved ${ago(t.solvedAt, now)}`}
              </div>
              <p className="ticket-message">{t.message}</p>
              <div className="row">
                <button className="btn btn-sm" onClick={() => void openUrl(replyUrl(t))}>
                  <Mail size={13} strokeWidth={1.75} /> Reply by email
                </button>
                {t.solvedAt ? (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onChange(() => setTicketSolved(t.id, false))}>
                    <RotateCcw size={13} strokeWidth={1.75} /> Reopen
                  </button>
                ) : (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onChange(() => setTicketSolved(t.id, true))}>
                    <Check size={13} strokeWidth={1.75} /> Mark solved
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
