import { useCallback, useEffect, useState } from "react";
import { Clock, Search, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import {
  adminAccounts,
  adminSettings,
  approveAccount,
  declineAccount,
  PERMISSIONS,
  revokeAccount,
  saveAdminSettings,
  updateAccount,
  type AdminAccount,
  type AdminSettings,
  type Permission,
} from "../../lib/account";
import { ErrorNote, useAction } from "../account/fields";
import { ago } from "../format";
import { Avatar } from "../ui/Avatar";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Panel } from "../ui/Panel";
import { Switch } from "../ui/Switch";
import { useNow } from "../useSync";

type Tab = "people" | "waiting" | "settings";

/** The admin panel: everyone with an account, their roles and permissions,
 * who's waiting to be let in, and the server's settings. */
export function AdminView({ email, admin }: { email: string | null; admin: boolean }) {
  const [tab, setTab] = useState<Tab>("people");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const { busy, error, run } = useAction();

  const load = useCallback(() => {
    void run(async () => {
      const [list, saved] = await Promise.all([adminAccounts(), adminSettings()]);
      setAccounts(list);
      setSettings(saved);
    });
    // `run` is recreated each render; loading once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  if (!admin) {
    return (
      <div className="page">
        <Panel>
          <p className="dim">The admin panel is for the server's admins. Sign in with an admin account to use it.</p>
        </Panel>
      </div>
    );
  }

  const waiting = accounts?.filter((a) => !a.approvedAt) ?? [];
  const people = accounts?.filter((a) => a.approvedAt) ?? [];
  const admins = people.filter((a) => a.role !== "member").length;
  /** Runs a change, then puts the changed account in the list. */
  const change = (work: () => Promise<AdminAccount | void>) =>
    run(async () => {
      const changed = await work();
      if (changed) setAccounts((all) => all?.map((a) => (a.id === changed.id ? changed : a)) ?? null);
      else setAccounts(await adminAccounts());
    });

  return (
    <div className="page admin">
      <Panel>
        <div className="admin-hero">
          <span className="admin-hero-icon">
            <ShieldCheck size={22} strokeWidth={1.75} />
          </span>
          <div className="admin-hero-text">
            <h1>Admin</h1>
            <p className="dim">Everyone with an Axiom account on this server: what they can use, who runs things, and who's waiting to be let in.</p>
          </div>
        </div>
        <div className="admin-stats">
          <Stat icon={UsersRound} value={people.length} label="people" />
          <Stat icon={Clock} value={waiting.length} label="waiting" highlight={waiting.length > 0} />
          <Stat icon={ShieldCheck} value={admins} label={admins === 1 ? "admin" : "admins"} />
        </div>
      </Panel>

      <nav className="admin-tabs" aria-label="Admin">
        {(
          [
            ["people", "People"],
            ["waiting", "Waiting list"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`pb-tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>
            {label}
            {id === "waiting" && waiting.length > 0 && <span className="admin-count">{waiting.length}</span>}
          </button>
        ))}
      </nav>
      <ErrorNote error={error} />

      {!accounts || !settings ? (
        <p className="dim">{busy ? "Loading…" : "Couldn't load the admin panel."}</p>
      ) : tab === "people" ? (
        <People people={people} me={email} busy={busy} onChange={change} />
      ) : tab === "waiting" ? (
        <Waiting waiting={waiting} waitlist={settings.waitlist} busy={busy} onChange={change} onSettings={() => setTab("settings")} />
      ) : (
        <ServerSettings settings={settings} busy={busy} onSave={(next) => run(async () => setSettings(await saveAdminSettings(next)))} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label, highlight }: { icon: typeof Clock; value: number; label: string; highlight?: boolean }) {
  return (
    <div className={`admin-stat${highlight ? " is-highlight" : ""}`}>
      <Icon size={15} strokeWidth={1.75} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

type Change = (work: () => Promise<AdminAccount | void>) => Promise<unknown>;

function People({ people, me, busy, onChange }: { people: AdminAccount[]; me: string | null; busy: boolean; onChange: Change }) {
  const now = useNow();
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = people
    .filter((a) => words.every((w) => `${a.email} ${a.displayName ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email));

  const toggle = (a: AdminAccount, permission: Permission, on: boolean) => {
    const permissions = on ? [...a.permissions, permission] : a.permissions.filter((p) => p !== permission);
    void onChange(() => updateAccount(a.id, { permissions }));
  };

  return (
    <Panel
      title="People"
      meta={`${people.length} with access`}
      actions={
        <label className="admin-search">
          <Search size={14} strokeWidth={1.75} />
          <input value={query} placeholder="Search by name or email" aria-label="Search people" onChange={(e) => setQuery(e.currentTarget.value)} />
        </label>
      }
    >
      <div className="admin-table" role="table" aria-label="People">
        <div className="admin-row admin-row-head" role="row">
          <span role="columnheader">Person</span>
          <span role="columnheader">Role</span>
          {PERMISSIONS.map((p) => (
            <span key={p.id} role="columnheader" className="admin-perm" title={p.hint}>
              {p.label}
            </span>
          ))}
          <span role="columnheader" />
        </div>
        {shown.map((a) => {
          const owner = a.role === "owner";
          const self = a.email === me;
          return (
            <div key={a.id} className="admin-row" role="row">
              <span className="admin-person" role="cell">
                <Avatar email={a.email} profile={{ displayName: a.displayName, avatar: null }} size={30} />
                <span className="admin-person-text">
                  <span className="admin-person-name">
                    {a.displayName || a.email.split("@")[0]}
                    {self && <span className="admin-you">you</span>}
                  </span>
                  <span className="admin-person-meta" title={a.email}>
                    {a.email} · {a.lastActiveAt ? `active ${ago(a.lastActiveAt, now)}` : `joined ${ago(a.createdAt, now)}`}
                  </span>
                </span>
              </span>
              <span role="cell">
                {owner ? (
                  <span className="admin-role is-owner" title="Set on the server (ADMIN_EMAILS)">
                    Owner
                  </span>
                ) : (
                  <select
                    className="admin-role-select"
                    value={a.role}
                    disabled={busy || self}
                    title={self ? "You can't change your own role" : "Admins run this panel"}
                    aria-label={`Role of ${a.email}`}
                    onChange={(e) => {
                      const role = e.currentTarget.value as "member" | "admin";
                      void onChange(() => updateAccount(a.id, { role }));
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </span>
              {PERMISSIONS.map((p) => (
                <span key={p.id} role="cell" className="admin-perm">
                  <Switch
                    on={a.permissions.includes(p.id)}
                    disabled={busy || owner}
                    label={`${p.label} for ${a.email}`}
                    title={owner ? "Owners can use everything" : p.hint}
                    onChange={(on) => toggle(a, p.id, on)}
                  />
                </span>
              ))}
              <span role="cell" className="admin-actions">
                {!owner && a.role !== "admin" && !self && (
                  <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Sign them out?" onConfirm={() => void onChange(() => revokeAccount(a.id))}>
                    Remove access
                  </ConfirmButton>
                )}
              </span>
            </div>
          );
        })}
        {shown.length === 0 && <p className="dim admin-none">{query ? `Nobody matches “${query}”.` : "Nobody has access yet."}</p>}
      </div>
    </Panel>
  );
}

/** Owners, then admins, then everyone else. */
const rank = (a: AdminAccount) => ({ owner: 0, admin: 1, member: 2 })[a.role];

function Waiting({
  waiting,
  waitlist,
  busy,
  onChange,
  onSettings,
}: {
  waiting: AdminAccount[];
  waitlist: boolean;
  busy: boolean;
  onChange: Change;
  onSettings: () => void;
}) {
  const now = useNow();
  return (
    <Panel title="Waiting list" meta={waitlist ? "New accounts wait here until you let them in" : "Switched off: new accounts sign straight in"}>
      {waiting.length === 0 ? (
        <div className="admin-empty">
          <UserCheck size={22} strokeWidth={1.5} />
          <p>Nobody's waiting.</p>
          <p className="dim">
            {waitlist ? "New sign-ups show up here, and you're emailed about each one." : "The waiting list is off, so there's nothing to approve."}{" "}
            <button className="link" onClick={onSettings}>
              Settings
            </button>
          </p>
        </div>
      ) : (
        <ul className="admin-waiting">
          {waiting.map((a) => (
            <li key={a.id}>
              <Avatar email={a.email} profile={null} size={30} />
              <span className="admin-person-text">
                <span className="admin-person-name">{a.email}</span>
                <span className="admin-person-meta">Asked {ago(a.createdAt, now)}</span>
              </span>
              <span className="admin-actions">
                <button className="btn btn-sm" disabled={busy} onClick={() => void onChange(() => approveAccount(a.id))}>
                  Approve
                </button>
                <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Turn down?" onConfirm={() => void onChange(() => declineAccount(a.id))}>
                  Turn down
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ServerSettings({ settings, busy, onSave }: { settings: AdminSettings; busy: boolean; onSave: (next: AdminSettings) => void }) {
  const toggle = (permission: Permission, on: boolean) =>
    onSave({ ...settings, defaultPermissions: on ? [...settings.defaultPermissions, permission] : settings.defaultPermissions.filter((p) => p !== permission) });
  return (
    <>
      <Panel title="Waiting list">
        <div className="admin-setting">
          <span>
            <span className="admin-setting-label">New accounts wait for approval</span>
            <span className="admin-setting-hint">
              {settings.waitlist
                ? "Someone who signs up can't sign in until an admin approves them. Admins are emailed about each one."
                : "Anyone can make an account and start syncing straight away."}
            </span>
          </span>
          <Switch on={settings.waitlist} disabled={busy} label="Waiting list" onChange={(waitlist) => onSave({ ...settings, waitlist })} />
        </div>
      </Panel>
      <Panel title="New accounts" meta="What someone can use when they first get access. Change it per person under People.">
        {PERMISSIONS.map((p) => (
          <div key={p.id} className="admin-setting">
            <span>
              <span className="admin-setting-label">{p.label}</span>
              <span className="admin-setting-hint">{p.hint}</span>
            </span>
            <Switch on={settings.defaultPermissions.includes(p.id)} disabled={busy} label={`${p.label} for new accounts`} onChange={(on) => toggle(p.id, on)} />
          </div>
        ))}
      </Panel>
    </>
  );
}
