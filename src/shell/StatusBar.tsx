import type { SyncStatus } from "../lib/sync";
import { dbDetail, dbLabel, syncDetail, syncDot, syncLabel } from "./format";
import { useLabels } from "./theme/ThemeProvider";
import type { ShellStatus } from "./useAppStatus";
import { useNow } from "./useSync";

interface StatusBarProps {
  status: ShellStatus;
  sync: SyncStatus;
  /** Opens the Account sidebar, where sync lives. */
  onOpenSync: () => void;
}

export function StatusBar({ status, sync, onOpenSync }: StatusBarProps) {
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
      <span className="status-item">
        Axiom <span className="dim">{sep}</span> {status.version ?? "—"}
      </span>
    </footer>
  );
}
