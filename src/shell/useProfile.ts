// The signed-in account's name and picture, shared by the Account panel and
// the activity bar. Kept on this computer so they show at once (and offline),
// and read from the server once each time the app opens.
import { useEffect, useSyncExternalStore } from "react";
import { getProfile, type Profile } from "../lib/account";

const KEY = "axiom.profile";

/** Profiles by email, so switching accounts never shows someone else's picture. */
let profiles: Record<string, Profile> = load();
const fetched = new Set<string>();
const listeners = new Set<() => void>();

function load(): Record<string, Profile> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberProfile(email: string, profile: Profile) {
  profiles = { ...profiles, [email]: profile };
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles));
  } catch {
    // Too big or not allowed: it's read from the server next time instead.
  }
  listeners.forEach((listener) => listener());
}

/** The profile for `email` (when signed in), or null until it's known. */
export function useProfile(email: string | undefined): Profile | null {
  const all = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => profiles,
  );
  useEffect(() => {
    if (!email || fetched.has(email)) return;
    fetched.add(email);
    getProfile().then(
      (profile) => rememberProfile(email, profile),
      () => fetched.delete(email),
    );
  }, [email]);
  return email ? (all[email] ?? null) : null;
}

/** What to call someone: their name, or the part of their email before the @. */
export function shownName(email: string, profile: Profile | null): string {
  return profile?.displayName || email.split("@")[0];
}
