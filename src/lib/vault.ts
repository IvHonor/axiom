// End-to-end encryption, wrapping src-tauri/src/vault/commands.rs.
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "./sync";

/** Mirrors `VaultStatus`. */
export type VaultStatus = "unlocked" | "needs_password" | "needs_recovery";

export const vaultStatus = () => invoke<VaultStatus>("vault_status");
/** With the password: for a computer signed in before encryption. */
export const unlockVault = (password: string) => invoke<VaultStatus>("vault_unlock", { password });
/** With the recovery code, after a password reset. */
export const recoverVault = (code: string, password: string) => invoke<VaultStatus>("vault_recover", { code, password });
/** Replaces the account's encrypted data with this computer's, under a new key. */
export const startOverVault = (password: string) => invoke<VaultStatus>("vault_start_over", { password });
export const recoveryCode = (password: string) => invoke<string>("vault_recovery_code", { password });

export function useVaultStatus(): VaultStatus | null {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const load = useCallback(() => void vaultStatus().then(setStatus, () => setStatus(null)), []);
  useEffect(load, [load]);
  useTauriEvent<VaultStatus>("vault-changed", setStatus);
  return status;
}
