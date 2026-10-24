// The PIN lock, wrapping src-tauri/src/app_lock/commands.rs. Every call
// shares its answer, so the lock screen and the Account panel stay in step.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/** Mirrors `LockStatus`. */
export interface LockStatus {
  enabled: boolean;
  locked: boolean;
  /** Locks again after this long idle; 0 only when Axiom opens. */
  idleMinutes: number;
  /** Too many wrong PINs: only an emailed code opens it now. */
  needsCode: boolean;
}

/** The idle times on offer, in minutes (0: only when Axiom opens). */
export const IDLE_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Only when Axiom opens" },
  { minutes: 1, label: "After 1 minute idle" },
  { minutes: 5, label: "After 5 minutes idle" },
  { minutes: 15, label: "After 15 minutes idle" },
  { minutes: 30, label: "After 30 minutes idle" },
  { minutes: 60, label: "After an hour idle" },
];

let current: LockStatus | null = null;
const listeners = new Set<(status: LockStatus) => void>();

function share(status: LockStatus): LockStatus {
  current = status;
  listeners.forEach((listener) => listener(status));
  return status;
}

export const lockStatus = () => invoke<LockStatus>("app_lock_status").then(share);
/** Turns the lock on, or changes its PIN (`pin`) or idle time. While it's on, `current` must be the PIN. */
export const setLock = (current: string | null, pin: string | null, idleMinutes: number) =>
  invoke<LockStatus>("app_lock_set", { current, pin, idleMinutes }).then(share);
export const turnOffLock = (current: string) => invoke<LockStatus>("app_lock_turn_off", { current }).then(share);
export const unlockApp = (pin: string) => invoke<LockStatus>("app_lock_unlock", { pin }).then(share);
export const lockApp = () => invoke<LockStatus>("app_lock_lock").then(share);
/** Emails a code to the account, for a forgotten PIN. */
export const sendLockCode = () => invoke<void>("app_lock_send_code");
/** With the emailed code, the lock turns off so a new PIN can be chosen. */
export const resetLock = (code: string) => invoke<LockStatus>("app_lock_reset", { code }).then(share);

export function useLockStatus(): LockStatus | null {
  const [status, setStatus] = useState(current);
  useEffect(() => {
    listeners.add(setStatus);
    if (!current) void lockStatus().catch(() => {});
    return () => void listeners.delete(setStatus);
  }, []);
  return status;
}
