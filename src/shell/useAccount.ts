import { useEffect, useSyncExternalStore } from "react";
import { getAccountStatus, type AccountStatus } from "../lib/account";
import { useTauriEvent } from "../lib/sync";

// One account status for the whole window, so signing in (in the Account
// panel) is seen everywhere straight away: Lemma, for one, sends what it
// was asked while signed out.
let current: AccountStatus | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(status: AccountStatus) {
  current = status;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The account's status, read once at startup (from this computer, no network),
 * then updated when someone signs in or out, or the server ends the session.
 */
export function useAccount() {
  const account = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    loading ??= getAccountStatus().then(set, () => set({ state: "signed_out" }));
  }, []);

  useTauriEvent<AccountStatus>("account-changed", set);
  return [account, set] as const;
}
