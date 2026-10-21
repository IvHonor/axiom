import type { SyncStatus } from "../lib/sync";
import { dbDetail, dbLabel, syncDetail, syncDot, syncLabel } from "./format";
import { useLabels } from "./theme/ThemeProvider";
import type { ShellStatus } from "./useAppStatus";
import type { UpdaterState } from "./useUpdater";
import { useNow } from "./useSync";

interface StatusBarProps {
  status: ShellStatus;
  sync: SyncStatus;
  /** Opens the Account sidebar, where sync lives. */
  onOpenSync: () => void;
  updater: UpdaterState;
  onCheckUpdates: () => void;
}

export function StatusBar({ status, sync, onOpenSync, updater, onCheckUpdates }: StatusBarProps) {
  const { label, sep } = useLabels();
  const now = useNow();
  const { db } = status;

  return (
    <footer className="statusbar">
      <span className={`status-item is-${db.state}`} title={dbDetail(db)}>
        <span className={`dot is-${db.state}`} />
        {label(dbLabel(db))}
      </span>
      {sync.state !== "off" && (
        <button
          className={`status-item status-button${sync.state === "error" ? " is-error" : ""}`}
          title={syncDetail(sync, now)}
          onClick={onOpenSync}
        >
          <span className={`dot ${syncDot(sync)}`} />
          Sync <span className="dim">{sep}</span> {label(syncLabel(sync, now))}
        </button>
      )}
      <span className="status-fill" />
      <button className="status-item status-button" title={updateTitle(updater)} onClick={onCheckUpdates}>
        {updater.state === "checking"
          ? label("Checking for updates")
          : updater.state === "current"
            ? label("Up to date")
            : updater.state === "available"
              ? label("Update available")
              : updater.state === "error" && !updater.update
                ? label("Couldn't check for updates")
                : <>Axiom <span className="dim">{sep}</span> {status.version ?? "—"}</>}
      </button>
    </footer>
  );
}

function updateTitle(updater: UpdaterState): string {
  if (updater.state === "error") return updater.message;
  if (updater.state === "available") return `Axiom ${updater.update.version} is ready to install.`;
  return "Check for updates";
}
