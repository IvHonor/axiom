import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Globe2, KeyRound, LockKeyhole, Monitor, ShieldCheck } from "lucide-react";
import { Avatar, SkeletonBlock } from "@/components/account/Avatar";
import { DownloadButton } from "@/components/Download";
import { call, type Device } from "@/lib/axiom";
import { requireAccount } from "@/lib/session";
import s from "@/components/account/account.module.css";

export const metadata = { title: "Overview" };

export default function AccountPage() {
  return (
    <Suspense fallback={<><SkeletonBlock height={92} /><div className={s.grid}><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div></>}>
      <Overview />
    </Suspense>
  );
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

async function Overview() {
  const account = await requireAccount("/account");
  const [devices, key] = await Promise.all([
    call<Device[]>("GET", "/v1/account/devices", { token: account.token }),
    call<{ wrapped: string | null }>("GET", "/v1/account/encryption-key", { token: account.token }),
  ]);
  const deviceCount = devices.ok ? devices.data.length : null;
  const encrypted = key.ok && !!key.data.wrapped;

  return (
    <>
      <header className={s.hello}>
        <Avatar name={account.display_name} email={account.email} avatar={account.avatar} size={64} />
        <div>
          <h1>Hello, {account.display_name || account.email.split("@")[0]}.</h1>
          <p>{account.email}{account.admin && <span className={s.badge}>Admin</span>}</p>
        </div>
      </header>

      <div className={s.grid}>
        <section className={s.tile}>
          <span className={s.tileLabel}><CalendarDays size={14} /> MEMBER SINCE</span>
          <strong>{date(account.created_at)}</strong>
          <p>One account for the app and the website.</p>
          <Link className={s.tileLink} href="/account/profile">Edit your profile <ArrowUpRight size={13} /></Link>
        </section>
        <section className={s.tile}>
          <span className={s.tileLabel}><Monitor size={14} /> SIGNED-IN DEVICES</span>
          <strong>{deviceCount ?? "–"}</strong>
          <p>Computers and browsers signed in to your account.</p>
          <Link className={s.tileLink} href="/account/security">Manage devices <ArrowUpRight size={13} /></Link>
        </section>
        <section className={s.tile}>
          <span className={s.tileLabel}>{encrypted ? <LockKeyhole size={14} /> : <KeyRound size={14} />} END-TO-END ENCRYPTION</span>
          <strong>{encrypted ? "On" : "Not set up yet"}</strong>
          <p>{encrypted ? "Finance, Notes, Journal, Goals and Birthdays are locked before they leave your computer." : "Turn it on in the Axiom app under Account → Encryption, the first time you sync."}</p>
        </section>
        <section className={s.tile}>
          <span className={s.tileLabel}><Globe2 size={14} /> AXIOM ON THE WEB</span>
          <strong>Coming soon</strong>
          <p>Your synced workspace in your browser. We&apos;re building it now.</p>
          <Link className={s.tileLink} href="/web">Take a look <ArrowUpRight size={13} /></Link>
        </section>
      </div>

      <section className={s.panel}>
        <div>
          <span className={s.tileLabel}><ShieldCheck size={14} /> GET THE APP</span>
          <h2>Your workspace lives in the Axiom app.</h2>
          <p>Sign in there with this account to sync between your computers.</p>
        </div>
        <DownloadButton size="md" />
      </section>
    </>
  );
}
