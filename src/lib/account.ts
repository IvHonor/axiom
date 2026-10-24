// Typed wrappers for the account commands in src-tauri/src/account/commands.rs.
// Each rejects with a message that's ready to show.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `AccountStatus` in src-tauri/src/account/mod.rs. `admin`: runs the server's waiting list. */
export type AccountStatus = { state: "signed_out" } | { state: "signed_in"; email: string; admin: boolean };

/**
 * Mirrors `SignInOutcome`: signed in, waiting for an admin to approve the account,
 * or waiting for the code emailed to confirm the address.
 */
export type SignInOutcome =
  | Extract<AccountStatus, { state: "signed_in" }>
  | { state: "waitlisted"; email: string }
  | { state: "confirm_email"; email: string };

export const getAccountStatus = () => invoke<AccountStatus>("account_status");
/** `acceptedTerms`: they ticked the box agreeing to the terms of use. */
export const signUp = (email: string, password: string, acceptedTerms: boolean) =>
  invoke<SignInOutcome>("account_sign_up", { email, password, acceptedTerms });
export const signIn = (email: string, password: string) => invoke<SignInOutcome>("account_sign_in", { email, password });
/** Confirms the address with the emailed code, then signs in with the password. */
export const confirmEmail = (email: string, code: string, password: string) =>
  invoke<SignInOutcome>("account_confirm_email", { email, code, password });
/** Emails a new confirmation code. */
export const sendConfirmation = (email: string) => invoke<void>("account_send_confirmation", { email });
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

export type AccountRole = "member" | "admin" | "owner";
export type Permission = "sync" | "share" | "email";

export const PERMISSIONS: { id: Permission; label: string; hint: string }[] = [
  { id: "sync", label: "Sync", hint: "Copy their data to the cloud and their other computers" },
  { id: "share", label: "Share boards", hint: "Share Project Board boards with other people" },
  { id: "email", label: "Emails", hint: "Get notification emails" },
];

/** Mirrors `AdminAccountView` in src-tauri/src/account/mod.rs. Times are ISO strings. */
export interface AdminAccount {
  id: string;
  email: string;
  displayName: string | null;
  /** When they signed up. */
  createdAt: string;
  /** Null while on the waiting list. */
  approvedAt: string | null;
  role: AccountRole;
  permissions: Permission[];
  lastActiveAt: string | null;
}

/** Mirrors `AdminSettingsView`. */
export interface AdminSettings {
  /** New accounts wait for an admin to approve them. */
  waitlist: boolean;
  /** What new accounts may use. */
  defaultPermissions: Permission[];
}

// The waiting list. The server refuses these unless you're one of its admins.
export const adminAccounts = () => invoke<AdminAccount[]>("account_admin_accounts");
/** Lets them in; the server emails them. */
export const approveAccount = (id: string) => invoke<void>("account_admin_approve", { id });
/** Turns down a waiting account, deleting it. */
export const declineAccount = (id: string) => invoke<void>("account_admin_decline", { id });
/** Puts an approved account back on the waiting list and signs it out everywhere. */
export const revokeAccount = (id: string) => invoke<void>("account_admin_revoke", { id });
/** Changes someone's role or permissions (owners can't be changed). */
export const updateAccount = (id: string, change: { role?: AccountRole; permissions?: Permission[] }) =>
  invoke<AdminAccount>("account_admin_update", { id, role: change.role ?? null, permissions: change.permissions ?? null });
export const adminSettings = () => invoke<AdminSettings>("account_admin_settings");
export const saveAdminSettings = (settings: AdminSettings) => invoke<AdminSettings>("account_admin_save_settings", { settings });

/** Mirrors `ProfileView`: the name and picture the account shows. */
export interface Profile {
  /** Null shows the email instead. */
  displayName: string | null;
  /** A small square `data:image/...` URL. */
  avatar: string | null;
}

export const getProfile = () => invoke<Profile>("account_profile");
/** An empty name shows the email instead. */
export const updateProfile = (displayName: string | null, avatar: string | null) =>
  invoke<Profile>("account_update_profile", { displayName, avatar });
