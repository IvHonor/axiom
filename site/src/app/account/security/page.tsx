import { Suspense } from "react";
import { KeyRound } from "lucide-react";
import { SkeletonBlock } from "@/components/account/Avatar";
import { DangerZone, DeviceList } from "@/components/account/Security";
import { call, type Device } from "@/lib/axiom";
import { requireAccount } from "@/lib/session";
import s from "@/components/account/account.module.css";

export const metadata = { title: "Devices & security" };

export default function SecurityPage() {
  return (
    <>
      <header className={s.pageHead}>
        <h1>Devices &amp; security</h1>
        <p>Where you&apos;re signed in, and what you can do about it.</p>
      </header>
      <Suspense fallback={<SkeletonBlock height={260} />}>
        <Devices />
      </Suspense>
      <section className={s.panel}>
        <div>
          <span className={s.tileLabel}><KeyRound size={14} /> PASSWORD</span>
          <h2>Change your password in the app.</h2>
          <p>Your password also locks your encryption key, so it&apos;s changed on a computer that can unlock it: <b>Account → Password</b> in Axiom. Every other device is signed out when you do.</p>
        </div>
      </section>
      <Suspense>
        <Danger />
      </Suspense>
    </>
  );
}

async function Danger() {
  const account = await requireAccount("/account/security");
  return <DangerZone email={account.email} />;
}

async function Devices() {
  const account = await requireAccount("/account/security");
  const devices = await call<Device[]>("GET", "/v1/account/devices", { token: account.token });
  if (!devices.ok) return <p className={s.error}>{devices.message}</p>;
  const sorted = [...devices.data].sort((a, b) => Number(b.current) - Number(a.current) || b.last_active_at.localeCompare(a.last_active_at));
  return <DeviceList devices={sorted} />;
}
