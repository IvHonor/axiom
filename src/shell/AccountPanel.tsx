import { useState, type ReactNode } from "react";
import { signOut, type AccountStatus } from "../lib/account";
import { linkData, syncNow, type LinkChoice, type SyncStatus } from "../lib/sync";
import { ChangePassword } from "./account/ChangePassword";
import { DeleteAccount } from "./account/DeleteAccount";
import { DeviceList } from "./account/DeviceList";
import { ExportData } from "./account/ExportData";
import { ErrorNote } from "./account/fields";
import { SignInForm } from "./account/SignInForm";
import { syncDetail, syncDot } from "./format";
import { ConfirmButton } from "./ui/ConfirmButton";
import { useNow } from "./useSync";

interface AccountPanelProps {
  status: AccountStatus | null;
  sync: SyncStatus;
  onChange: (status: AccountStatus) => void;
}

/** Sidebar for the account: signing in, sync, devices, password, data, and signing out. */
export function AccountPanel({ status, sync, onChange }: AccountPanelProps) {
  return (
    <aside className="sidebar">
      <header className="sidebar-head">Account</header>
      <div className="sidebar-body">
        {status?.state === "signed_in" ? (
          <SignedIn email={status.email} sync={sync} onChange={onChange} />
        ) : (
          status && (
            <>
              <SignInForm onDone={onChange} />
              <div className="account">
                <Block title="Your data">
                  <ExportData />
                </Block>
              </div>
            </>
          )
        )}
      </div>
    </aside>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="account-block">
      <h3 className="account-heading">{title}</h3>
      {children}
    </section>
  );
}

function SignedIn({ email, sync, onChange }: { email: string; sync: SyncStatus; onChange: (status: AccountStatus) => void }) {
  const now = useNow();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = (how: LinkChoice) => linkData(how).catch((e) => setError(String(e)));
  const leave = (keepData: boolean) => signOut(keepData).then(onChange);

  return (
    <div className="account">
      <div className="account-card">
        <span className="account-avatar" aria-hidden>
          {email[0]?.toUpperCase()}
        </span>
        <span className="account-who">
          <span className="account-email" title={email}>
            {email}
          </span>
          <span className="ext-meta">Signed in on this computer</span>
        </span>
      </div>

      <Block title="Sync">
        {sync.state === "needs_choice" ? (
          <div className="account-choice">
            <p>
              This computer has {sync.projects === 1 ? "1 project" : `${sync.projects} projects`} that{" "}
              {sync.projects === 1 ? "isn't" : "aren't"} in your account yet.
            </p>
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
            <p className="ext-meta account-note">Replacing deletes the projects on this computer.</p>
          </div>
        ) : (
          <>
            <p className={`account-sync is-${sync.state}`}>
              <span className={`dot ${syncDot(sync)}`} />
              {syncDetail(sync, now)}
            </p>
            <button className="btn btn-sm btn-ghost" onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
              {sync.state === "syncing" ? "Syncing…" : "Sync now"}
            </button>
          </>
        )}
        <ErrorNote error={error} />
      </Block>

      <Block title="Devices">
        <DeviceList />
      </Block>

      <Block title="Password">
        <ChangePassword />
      </Block>

      <Block title="Your data">
        <ExportData />
      </Block>

      <Block title="Sign out">
        {signingOut ? (
          <div className="account-choice">
            <p>Keep your boards on this computer after signing out? They stay in your account either way.</p>
            <button className="btn btn-sm" onClick={() => leave(true)}>
              Keep and sign out
            </button>
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              onConfirm={() => leave(false)}
              confirmText="Click again to remove and sign out"
            >
              Remove from this computer and sign out
            </ConfirmButton>
            <button className="link" onClick={() => setSigningOut(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => setSigningOut(true)}>
            Sign out
          </button>
        )}
      </Block>

      <Block title="Delete account">
        <DeleteAccount onDeleted={onChange} />
      </Block>
    </div>
  );
}
