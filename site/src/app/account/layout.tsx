import type { Metadata } from "next";
import { AccountNav } from "@/components/account/AccountNav";
import s from "@/components/account/account.module.css";

export const metadata: Metadata = { title: { default: "Your account", template: "%s · Your account · Axiom" }, robots: { index: false } };

/** The signed-in area. Each page reads the sign-in itself, behind its own Suspense boundary. */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className={`${s.shell} wrap`}>
      <aside className={s.side}>
        <span className="eyebrow">YOUR ACCOUNT</span>
        <AccountNav />
      </aside>
      <div className={s.content}>{children}</div>
    </div>
  );
}
