"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { signOut } from "@/app/account/actions";
import s from "./account.module.css";

const LINKS = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/security", label: "Devices & security", icon: ShieldCheck },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav className={s.nav} aria-label="Account">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><Icon size={15} strokeWidth={1.6} />{label}</Link>
      ))}
      <form action={signOut}>
        <button><LogOut size={15} strokeWidth={1.6} />Sign out</button>
      </form>
    </nav>
  );
}
