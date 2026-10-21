import { useEffect, useState } from "react";
import { getAccountStatus, type AccountStatus } from "../lib/account";
import { useTauriEvent } from "../lib/sync";

/**
 * The account's status, read once at startup (from this computer, no network),
 * then updated if the server ends the session.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountStatus | null>(null);

  useEffect(() => {
    getAccountStatus()
      .then(setAccount)
      .catch(() => setAccount({ state: "signed_out" }));
  }, []);

  useTauriEvent<AccountStatus>("account-changed", setAccount);
  return [account, setAccount] as const;
}
