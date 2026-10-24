"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Laptop, Trash2 } from "lucide-react";
import { deleteAccount, signOutDevice } from "@/app/account/actions";
import type { Device } from "@/lib/axiom";
import { loginKey } from "@/lib/login-key";
import s from "./account.module.css";

const when = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `Active ${minutes} minutes ago`;
  if (minutes < 48 * 60) return `Active ${Math.round(minutes / 60)} hours ago`;
  return `Active ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
};

export function DeviceList({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const signOut = (id: string) =>
    start(async () => {
      const result = await signOutDevice(id);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  return (
    <section className={s.panelList}>
      <span className={s.tileLabel}>SIGNED IN ({devices.length})</span>
      <ul className={s.devices}>
        {devices.map((device) => (
          <li key={device.id}>
            {device.name.endsWith("(web)") ? <Globe2 size={18} strokeWidth={1.5} /> : <Laptop size={18} strokeWidth={1.5} />}
            <div>
              <b>{device.name}{device.current && <span className={s.badge}>This browser</span>}</b>
              <small>{when(device.last_active_at)} · signed in {new Date(device.signed_in_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>
            </div>
            {!device.current && <button type="button" className={s.textButton} disabled={pending} onClick={() => signOut(device.id)}>Sign out</button>}
          </li>
        ))}
      </ul>
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  );
}

/** Deleting the account: the password is turned into its login key here, like signing in. */
export function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const key = await loginKey(email, String(form.get("password") ?? ""));
      const result = await deleteAccount(key);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <section className={`${s.panel} ${s.danger}`}>
      <div>
        <span className={s.tileLabel}><Trash2 size={14} /> DANGER ZONE</span>
        <h2>Delete your account</h2>
        <p>Deletes your account and everything synced to it, for good. The data on your computers stays in the app.</p>
        {open && (
          <form className={s.form} onSubmit={submit}>
            <input type="hidden" name="username" value={email} autoComplete="username" />
            <label className={s.field}>
              <span>Password, to confirm</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && <p className={s.error} role="alert">{error}</p>}
            <div className={s.row}>
              <button className={`button button-md ${s.dangerButton}`} disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</button>
              <button type="button" className={s.textButton} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
      {!open && <button type="button" className={`button button-md ${s.dangerButton}`} onClick={() => setOpen(true)}>Delete account…</button>}
    </section>
  );
}
