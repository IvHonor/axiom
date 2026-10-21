import { Download, X } from "lucide-react";
import type { UpdaterState } from "./useUpdater";
import type { Update } from "../lib/updates";

interface UpdatePromptProps {
  status: UpdaterState;
  onInstall: (update: Update) => void;
  onLater: (update: Update) => void;
}

/** A small card above the status bar offering a new version. */
export function UpdatePrompt({ status, onInstall, onLater }: UpdatePromptProps) {
  if (status.state !== "available" && status.state !== "installing" && !(status.state === "error" && status.update)) return null;
  const update = status.update!;
  const notes = update.body?.trim();

  return (
    <aside className="update-prompt" role="status" aria-live="polite">
      <div className="update-head">
        <Download size={16} strokeWidth={1.75} className="update-icon" />
        <span className="update-title">Axiom {update.version} is available</span>
        {status.state === "available" && (
          <button className="icon-btn" aria-label="Remind me later" title="Later" onClick={() => onLater(update)}>
            <X size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {notes && status.state === "available" && <p className="update-notes">{notes}</p>}

      {status.state === "installing" ? (
        <div className="update-progress">
          <div className="update-bar">
            <span style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} className={status.progress === null ? "is-unknown" : undefined} />
          </div>
          <span className="field-hint">
            {status.progress === null ? "Downloading…" : `Downloading… ${Math.round(status.progress * 100)}%`} Axiom will restart when
            it's done.
          </span>
        </div>
      ) : (
        <>
          {status.state === "error" && <p className="account-error">{status.message}</p>}
          <div className="row">
            <button className="btn btn-sm" onClick={() => onInstall(update)}>
              {status.state === "error" ? "Try again" : "Update and restart"}
            </button>
            {status.state === "available" && (
              <button className="btn btn-sm btn-ghost" onClick={() => onLater(update)}>
                Later
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
