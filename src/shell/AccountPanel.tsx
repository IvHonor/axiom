import { useEffect, useState, type ReactNode } from "react";
import { Bell, HardDriveDownload, KeyRound, LockKeyhole, LogOut, MonitorSmartphone, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { signOut, type AccountStatus } from "../lib/account";
import { getAutoSync, linkData, setAutoSync, syncNow, type LinkChoice, type SyncStatus } from "../lib/sync";
import { ChangePassword } from "./account/ChangePassword";
import { DeleteAccount } from "./account/DeleteAccount";
import { DeviceList } from "./account/DeviceList";
import { ExportData } from "./account/ExportData";
import { Encryption } from "./account/Encryption";
import { ErrorNote } from "./account/fields";
import { ProfileHeader } from "./account/ProfileHeader";
import { SignInForm } from "./account/SignInForm";
import { NotificationSettings } from "./notifications/NotificationSettings";
import { syncDetail, syncDot } from "./format";
import { ConfirmButton } from "./ui/ConfirmButton";
import { Modal } from "./ui/Modal";
import { Logo } from "./ui/Logo";
import { Switch } from "./ui/Switch";
import { useNow } from "./useSync";

interface AccountPanelProps {
  status: AccountStatus | null;
  sync: SyncStatus;
  onChange: (status: AccountStatus) => void;
  /** Installed extensions, for their notification settings. */
  extensions: string[];
}

/** Sidebar for the account: signing in, sync, devices, password, data, and signing out. */
export function AccountPanel({ status, sync, onChange, extensions }: AccountPanelProps) {
  return (
    <aside className="sidebar">
      <header className="sidebar-head">Account</header>
      <div className="sidebar-body">
        {status?.state === "signed_in" ? (
          <SignedIn email={status.email} admin={status.admin} sync={sync} onChange={onChange} extensions={extensions} />
        ) : (
          status && (
            <>
              <div className="account-brand"><Logo variant="lockup" size={96} /></div>
              <SignInForm onDone={onChange} />
            </>
          )
        )}
      </div>
    </aside>
  );
}

/** One part of the Account panel: an icon and title over its contents. */
function Card({ icon: Icon, title, danger, children }: { icon: LucideIcon; title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={`account-section${danger ? " is-danger" : ""}`}>
      <h3 className="account-section-head">
        <Icon size={14} strokeWidth={1.75} />
        {title}
      </h3>
      <div className="account-section-body">{children}</div>
    </section>
  );
}

function SignedIn({ email, admin, sync, onChange, extensions }: { email: string; admin: boolean; sync: SyncStatus; onChange: (status: AccountStatus) => void; extensions: string[] }) {
  const now = useNow();
  const [auto, setAuto] = useState(true);
  useEffect(() => void getAutoSync().then(setAuto, () => {}), []);
  const changeAuto = (on: boolean) => {
    setAuto(on);
    setAutoSync(on).catch((e) => setError(String(e)));
  };
  const [signingOut, setSigningOut] = useState(false);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = (how: LinkChoice) => linkData(how).catch((e) => setError(String(e)));
  const leave = (keepData: boolean) => signOut(keepData).then(onChange);

  return (
    <div className="account">
      <ProfileHeader email={email} admin={admin} />

      <Card icon={RefreshCw} title="Sync">
        {sync.state === "needs_choice" ? (
          <div className="account-choice">
            <p>This computer has {localItems(sync)} that {isOne(sync) ? "isn't" : "aren't"} in your account yet.</p>
            <button className="btn btn-sm" onClick={() => link("merge")}>
              Upload to my account
            </button>
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              onConfirm={() => link("replace")}
              confirmText="Click again to delete them"
            >
              Replace with my account's data
            </ConfirmButton>
            <p className="ext-meta account-note">Replacing deletes them from this computer.</p>
          </div>
        ) : (
          <div className="account-sync-row">
            <p className={`account-sync is-${sync.state}`}>
              <span className={`dot ${syncDot(sync)}`} />
              {syncDetail(sync, now)}
            </p>
            <div className="account-toggle">
              <span>
                <span className="account-toggle-label">Sync automatically</span>
                <span className="account-toggle-hint">{auto ? "After every change, and every minute." : "Only when you click Sync now."}</span>
              </span>
              <Switch on={auto} onChange={changeAuto} label="Sync automatically" />
            </div>
            {!auto && (
              <button className="btn btn-sm" onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
                {sync.state === "syncing" ? "Syncing…" : "Sync now"}
              </button>
            )}
          </div>
        )}
        <ErrorNote error={error} />
      </Card>

      <Card icon={Bell} title="Notifications">
        <p className="field-hint account-card-hint">Reminders and summaries from your extensions: in the app, on the desktop and by email. Each extension's side panel has its own too.</p>
        <button className="btn btn-sm" onClick={() => setManaging(true)}>
          Manage notifications
        </button>
      </Card>
      {managing && (
        <Modal title="Notifications" icon={<Bell size={16} strokeWidth={1.75} />} onClose={() => setManaging(false)}>
          <p className="dim modal-intro">Choose what each extension tells you about, and where. Emails are off until you switch them on. Extensions you&apos;ve switched off don&apos;t send any.</p>
          <NotificationSettings extensions={extensions} signedIn />
        </Modal>
      )}

      <Card icon={LockKeyhole} title="Encryption">
        <Encryption />
      </Card>

      <Card icon={MonitorSmartphone} title="Devices">
        <DeviceList />
      </Card>

      <Card icon={KeyRound} title="Password">
        <ChangePassword />
      </Card>

      <Card icon={HardDriveDownload} title="Your data">
        <ExportData />
      </Card>

      {signingOut ? (
        <div className="account-choice">
          <p>Keep your boards on this computer after signing out? They stay in your account either way.</p>
          <button className="btn btn-sm" onClick={() => leave(true)}>
            Keep and sign out
          </button>
          <ConfirmButton className="btn btn-sm btn-ghost is-danger" onConfirm={() => leave(false)} confirmText="Click again to remove and sign out">
            Remove from this computer and sign out
          </ConfirmButton>
          <button className="link" onClick={() => setSigningOut(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost account-signout" onClick={() => setSigningOut(true)}>
          <LogOut size={14} strokeWidth={1.75} /> Sign out
        </button>
      )}

      <Card icon={TriangleAlert} title="Danger zone" danger>
        <DeleteAccount onDeleted={onChange} />
      </Card>
    </div>
  );
}

type LocalCounts = { projects: number; planTasks: number; books: number; modules: number };

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
