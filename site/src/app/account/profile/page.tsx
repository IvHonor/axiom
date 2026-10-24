import { Suspense } from "react";
import { SkeletonBlock } from "@/components/account/Avatar";
import { ProfileForm } from "@/components/account/ProfileForm";
import { CONTACT_EMAIL } from "@/lib/site";
import { requireAccount } from "@/lib/session";
import s from "@/components/account/account.module.css";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <header className={s.pageHead}>
        <h1>Profile</h1>
        <p>How you appear on shared boards and in the app.</p>
      </header>
      <Suspense fallback={<SkeletonBlock height={320} />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  const account = await requireAccount("/account/profile");
  return (
    <>
      <ProfileForm email={account.email} name={account.display_name} avatar={account.avatar} />
      <section className={s.panel}>
        <div>
          <span className={s.tileLabel}>EMAIL ADDRESS</span>
          <h2>{account.email}</h2>
          <p>To change the address you sign in with, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from it.</p>
        </div>
      </section>
    </>
  );
}
