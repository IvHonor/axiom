// Reminders asked of Lemma on the desktop ("remind me to stretch in 30
// minutes"). Kept on this computer, in storage both windows share: the main
// window watches the time and brings Lemma out when one's due (useDesk.ts),
// and he says it, with Done and a snooze (Desk.tsx).
import { useEffect, useState } from "react";

export interface Reminder {
  id: string;
  text: string;
  /** When, in ms since 1970. */
  at: number;
  /** Said when you're back at the computer after time away, not at a time. */
  onReturn?: boolean;
}

const LIST_KEY = "axiom.desk.reminders";
/** The reminder being said now, until it's dealt with. */
const RINGING_KEY = "axiom.desk.ringing";
/** The same window hears its own changes through this (storage events only reach the other). */
const CHANGED = "desk-reminders";

function read<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage, reminders last while Axiom's open.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export const reminders = () => read<Reminder[]>(LIST_KEY, []).filter((r) => typeof r.text === "string" && typeof r.at === "number");
export const ringing = () => read<Reminder | null>(RINGING_KEY, null);

export function remind(text: string, at: number, onReturn = false) {
  write(LIST_KEY, [...reminders(), { id: crypto.randomUUID(), text, at, ...(onReturn ? { onReturn } : {}) }].sort((a, b) => a.at - b.at));
}

/** The reminders due now come off the list; the first is said (the rest after it). */
export function ringDue(now = Date.now()): boolean {
  if (ringing()) return false;
  const all = reminders();
  const due = all.find((r) => !r.onReturn);
  const rest = all.filter((r) => r !== due);
  if (!due || due.at > now) return false;
  write(LIST_KEY, rest);
  write(RINGING_KEY, due);
  return true;
}

/** Done with the one being said; `snooze` minutes later, it's said again. */
export function settle(snooze?: number) {
  const now = ringing();
  write(RINGING_KEY, null);
  if (now && snooze) remind(now.text, Date.now() + snooze * 60_000);
}

/** The reminder being said, kept up to date across both windows. */
export function useRinging(): Reminder | null {
  const [now, setNow] = useState(ringing);
  useEffect(() => {
    const read = () => setNow(ringing());
    const onStorage = (e: StorageEvent) => e.key === RINGING_KEY && read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED, read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED, read);
    };
  }, []);
  return now;
}

/** Back at the computer after time away: what was to be said then is due now. */
export function welcomeBack(now = Date.now()) {
  const all = reminders();
  if (!all.some((r) => r.onReturn)) return;
  write(LIST_KEY, all.map((r) => (r.onReturn ? { id: r.id, text: r.text, at: now } : r)).sort((a, b) => a.at - b.at));
}

/** Takes a reminder off the list before it's said. */
export function cancel(id: string) {
  write(LIST_KEY, reminders().filter((r) => r.id !== id));
}

/** The reminders still to come, kept up to date across both windows. */
export function useReminders(): Reminder[] {
  const [list, setList] = useState(reminders);
  useEffect(() => {
    const read = () => setList(reminders());
    const onStorage = (e: StorageEvent) => e.key === LIST_KEY && read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED, read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED, read);
    };
  }, []);
  return list;
}
