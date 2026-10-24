"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BellRing, Check } from "lucide-react";
import { notifyMe } from "@/app/account/actions";
import s from "./account.module.css";

/** Joins the list for Axiom on the web: an email box, or one button when signed in. */
export function NotifyForm({ email }: { email?: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email ?? String(new FormData(event.currentTarget).get("email") ?? "");
    setError(null);
    start(async () => {
      const result = await notifyMe(address);
      if (result.ok) setDone(result.message ?? "You're on the list.");
      else setError(result.message);
    });
  }

  if (done) return <p className={s.notice} role="status"><Check size={14} /> {done}</p>;
  return (
    <form className={s.notify} onSubmit={submit}>
      {!email && <input name="email" type="email" autoComplete="email" placeholder="you@example.com" aria-label="Your email" required />}
      <button className="button button-primary button-md" disabled={pending}><BellRing size={15} /> {pending ? "Adding you…" : email ? "Email me when it opens" : "Notify me"}</button>
      {error && <p className={s.error} role="alert">{error}</p>}
    </form>
  );
}
