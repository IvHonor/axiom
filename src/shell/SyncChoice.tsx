import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getBackup, linkData, restoreBackup, type LinkChoice, type SyncBackup, type SyncChoice, type SyncStatus } from "../lib/sync";
import { ErrorNote } from "./account/fields";
import { ago } from "./format";
import { ConfirmButton } from "./ui/ConfirmButton";
import { Modal } from "./ui/Modal";

/**
 * What to do when this computer and the account disagree: on first linking
 * them, or on signing back in with changes made while signed out. Nothing
 * syncs until one is picked, and a copy of this computer's data is saved first.
 */
export function SyncChoicePanel({ choice }: { choice: SyncChoice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = (how: LinkChoice) => {
    setBusy(true);
    setError(null);
    linkData(how)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
  const fresh = choice.reason === "new_computer";

  return (
    <div className="account-choice">
      <p>{summary(choice)}</p>
      <button className="btn btn-sm" disabled={busy} onClick={() => pick("merge")}>
        Merge (recommended)
      </button>
      <p className="ext-meta account-note">Keeps both. Where both changed the same thing, the newer edit wins.</p>
      <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => pick("keep_local")}>
        Use this computer&apos;s data
      </button>
      <p className="ext-meta account-note">Keeps both. Where both changed the same thing, this computer&apos;s version wins.</p>
      <ConfirmButton className="btn btn-sm btn-ghost is-danger" onConfirm={() => pick("replace")} confirmText="Click again to use your account's data">
        Use my account&apos;s data
      </ConfirmButton>
      <p className="ext-meta account-note">
        {fresh ? "Removes this computer's data and downloads your account's." : "Drops what you changed here while signed out."}
      </p>
      <p className="ext-meta account-note">Whichever you pick, a copy of this computer&apos;s data is saved first. You can bring it back from the Account panel for a week.</p>
      <ErrorNote error={error} />
    </div>
  );
}

/**
 * Pops the choice up over the app when sync starts waiting for one. "Decide
 * later" leaves it in the Account panel (the status bar says "Action needed").
 */
export function SyncChoicePrompt({ sync }: { sync: SyncStatus }) {
  const [later, setLater] = useState(false);
  const waiting = sync.state === "needs_choice";
  useEffect(() => {
    if (!waiting) setLater(false);
  }, [waiting]);
  if (sync.state !== "needs_choice" || later) return null;
  return (
    <Modal title="Before syncing" icon={<RefreshCw size={16} strokeWidth={1.75} />} onClose={() => setLater(true)} width={440}>
      <SyncChoicePanel choice={sync} />
      <button className="link" onClick={() => setLater(true)}>
        Decide later
      </button>
    </Modal>
  );
}

/** Brings back the copy saved at the last choice, while it's kept (a week). */
export function RestoreBackup({ sync, now }: { sync: SyncStatus; now: number }) {
  const [backup, setBackup] = useState<SyncBackup | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A choice was just made: look for its copy.
  useEffect(() => void getBackup().then(setBackup, () => {}), [sync.state]);
  if (!backup) return null;

  const restore = () =>
    restoreBackup().then(
      (n) => setDone(`Brought back ${n} item${n === 1 ? "" : "s"}. They'll sync to your account.`),
      (e) => setError(String(e)),
    );
  return (
    <div className="account-choice">
      <p className="ext-meta account-note">
        A copy of this computer&apos;s data was saved {ago(backup.at, now)}, before you chose what to sync. Bringing it back puts its items back as they were; anything made since stays.
      </p>
      <ConfirmButton className="btn btn-sm btn-ghost" onConfirm={() => void restore()} confirmText="Click again to bring it back">
        Bring back that copy
      </ConfirmButton>
      {done && <p className="ext-meta account-note">{done}</p>}
      <ErrorNote error={error} />
    </div>
  );
}

function summary(choice: SyncChoice): string {
  if (choice.reason === "new_computer") {
    return `This computer has ${localItems(choice)} that ${isOne(choice) ? "isn't" : "aren't"} in your account yet.`;
  }
  const items = choice.changes === 1 ? "1 item" : `${choice.changes} items`;
  const since = choice.since ? ` since ${new Date(choice.since).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "";
  return `You changed ${items} on this computer while signed out${since}. Your account may have changed too.`;
}

type LocalCounts = Pick<SyncChoice, "projects" | "planTasks" | "books" | "modules">;

const COUNTED: [keyof LocalCounts, string, string][] = [
  ["projects", "project", "projects"],
  ["planTasks", "planner task", "planner tasks"],
  ["books", "book", "books"],
  ["modules", "University module", "University modules"],
];

/** "2 projects, 5 planner tasks and 1 book", leaving out whatever is zero. */
function localItems(counts: LocalCounts): string {
  const parts = COUNTED.filter(([key]) => counts[key] > 0).map(([key, one, many]) => (counts[key] === 1 ? `1 ${one}` : `${counts[key]} ${many}`));
  if (parts.length === 0) return "data";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const isOne = (counts: LocalCounts) => COUNTED.reduce((n, [key]) => n + counts[key], 0) === 1;
