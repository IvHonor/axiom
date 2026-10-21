// Typed wrappers for the account commands in src-tauri/src/account/commands.rs.
// Each rejects with a message that's ready to show.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `AccountStatus` in src-tauri/src/account/mod.rs. */
export type AccountStatus = { state: "signed_out" } | { state: "signed_in"; email: string };

export const getAccountStatus = () => invoke<AccountStatus>("account_status");
export const signUp = (email: string, password: string) => invoke<AccountStatus>("account_sign_up", { email, password });
export const signIn = (email: string, password: string) => invoke<AccountStatus>("account_sign_in", { email, password });
/** Mirrors `DeviceView` in src-tauri/src/account/mod.rs. Times are ISO strings. */
export interface Device {
  id: string;
  name: string;
  signedInAt: string;
  lastActiveAt: string;
  /** This computer. */
  current: boolean;
}

/** Emails a reset code if the account exists (the server doesn't say whether it does). */
export const requestReset = (email: string) => invoke<void>("account_request_reset", { email });
/** Sets a new password with the emailed code, then signs in. */
export const resetPassword = (email: string, code: string, password: string) =>
  invoke<AccountStatus>("account_reset_password", { email, code, password });
/** Other devices are signed out; this one stays in. */
export const changePassword = (current: string, next: string) => invoke<void>("account_change_password", { current, new: next });
export const listDevices = () => invoke<Device[]>("account_devices");
export const signOutDevice = (id: string) => invoke<void>("account_sign_out_device", { id });
/** Deletes the account and everything synced to it. Local data stays. */
export const deleteAccount = (password: string) => invoke<AccountStatus>("account_delete", { password });

/** With `keepData` false, also deletes the synced data from this computer (it stays in the account). */
export const signOut = (keepData: boolean) => invoke<AccountStatus>("account_sign_out", { keepData });
