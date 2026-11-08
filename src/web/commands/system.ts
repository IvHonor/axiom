// The app itself on the web: status, the profile (settings that sync),
// notification settings, the PIN lock and encryption status, data export.
import pkg from "../../../package.json";
import { DEMO, currentAccount, rowsOf, save, snapshot } from "../runtime";
import type { Handlers } from "./types";

/** Mirrors `KINDS` in src-tauri/src/notifications/kinds.rs. */
const KINDS = [
  { id: "project_board.deadlines", extension: "project_board", label: "Deadlines", description: "Cards that are overdue, due today or due tomorrow. Every morning at 8.", email: true },
  { id: "daily_plan.agenda", extension: "daily_plan", label: "Morning agenda", description: "Your blocks, meetings and top priorities for the day. Every morning at 7.", email: true },
  { id: "daily_plan.deadlines", extension: "daily_plan", label: "Deadlines", description: "Tasks that are overdue, due today or due tomorrow. Every morning at 8.", email: true },
  { id: "uni.today", extension: "uni", label: "Today's lectures", description: "The lectures on today, and how many you've still to catch up on. Every morning at 7.", email: true },
  { id: "uni.weekly", extension: "uni", label: "Weekly summary", description: "Each module's progress and what's left to catch up on. Sundays at 6pm.", email: true },
  { id: "reading.streak", extension: "reading", label: "Streak reminder", description: "A nudge at 8pm when you've a streak going and haven't read yet today.", email: false },
  { id: "reading.weekly", extension: "reading", label: "Weekly recap", description: "Pages read, books finished and how your goal's going. Sundays at 7pm.", email: true },
  { id: "journal.reminder", extension: "journal", label: "Evening reminder", description: "A nudge at 9pm if you haven't written today, with a prompt to start you off. Emails never include what you've written.", email: true },
  { id: "finance.bills", extension: "finance", label: "Bills to confirm", description: "Recurring bills and income that have come round, so you can tick them off. Every morning at 9.", email: false },
  { id: "finance.month", extension: "finance", label: "Monthly summary", description: "What you spent and earned last month, and any budgets you went over. On the 1st at 9.", email: false },
  { id: "birthdays.upcoming", extension: "birthdays", label: "Birthday reminders", description: "On the day, and as many days ahead as you chose for each person. Every morning at 9. Emails include their names and ages.", email: true },
  { id: "goals.weekly", extension: "goals", label: "Weekly check-in", description: "How each goal's going against its pace, and which need a push. Sundays at 5pm. Emails include your goals' names.", email: true },
  { id: "learning.review", extension: "learning", label: "Due for review", description: "Chapters and lessons that are due for another look today. Every morning at 9.", email: false },
  { id: "learning.weekly", extension: "learning", label: "Weekly summary", description: "Time studied, chapters and lessons done, and your streak. Sundays at 6pm.", email: false },
];

async function notificationSettings() {
  const saved = rowsOf((await snapshot()).records, "notification_settings");
  return KINDS.map((kind) => {
    const row = saved.find((s) => s.id === kind.id)?.data;
    return row
      ? { kind: kind.id, inApp: row.in_app !== false, desktop: row.desktop !== false, email: row.email === true && kind.email }
      : { kind: kind.id, inApp: true, desktop: true, email: false };
  });
}

const LOCK_OFF = { enabled: false, locked: false, idleMinutes: 0, needsCode: false };
const LOCK_WEB = "The PIN lock keeps the desktop app private on a shared computer. On the web, your website sign-in protects your account: sign out when you're done on a shared computer.";

/** Saves a file to the browser's downloads. */
export function download(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const system: Handlers = {
  app_status: () => ({ version: pkg.version, db: { state: "connected" }, privacyUrl: "/privacy", termsUrl: "/terms" }),

  async data_export() {
    const { records } = await snapshot();
    const tables: Record<string, unknown[]> = {};
    for (const row of records) (tables[row.table] ??= []).push(row.data);
    const name = `axiom-export-${new Date().toISOString().slice(0, 10)}.json`;
    const note = "Exported from Axiom on the web. End-to-end encrypted areas (Finance, Notes, Journal, Goals, Birthdays, Lemma's chats) are exported by the desktop app.";
    download(name, JSON.stringify({ app: "axiom", version: pkg.version, exportedAt: new Date().toISOString(), account: currentAccount()?.email, note, tables }, null, 2), "application/json");
    return `Downloads/${name}`;
  },

  async profile_settings() {
    const settings: Record<string, unknown> = {};
    for (const row of rowsOf((await snapshot()).records, "profile_settings")) {
      try {
        settings[row.id] = JSON.parse(String(row.data.value));
      } catch {
        // A value this version can't read is left for the app's defaults.
      }
    }
    return settings;
  },

  async profile_set({ name, value }) {
    const json = JSON.stringify(value ?? null);
    if (json.length > 32 * 1024) throw "That setting is too big to save.";
    const row = (await snapshot()).allRecords.find((r) => r.table === "profile_settings" && r.id === name);
    // Saving what's already there changes nothing, so it isn't synced again.
    if (row && row.data.value === json && !row.data.deleted_at) return;
    await save([{ table: "profile_settings", id: String(name), fields: { value: json, deleted_at: null } }]);
  },

  notifications_kinds: () => KINDS,
  notifications_settings: notificationSettings,
  async notifications_set({ kind, channel, on }) {
    const found = KINDS.find((k) => k.id === kind);
    if (!found) throw `Unknown notification: ${kind}`;
    if (channel === "email" && on && !found.email) throw `${found.label} isn't sent by email.`;
    const current = (await notificationSettings()).find((s) => s.kind === kind)!;
    const next = { ...current, [channel === "in_app" ? "inApp" : String(channel)]: !!on };
    await save([{ table: "notification_settings", id: String(kind), fields: { in_app: next.inApp, desktop: next.desktop, email: next.email, deleted_at: null } }]);
    return next;
  },
  notifications_set_off: () => undefined,
  // Notifications are made by the desktop app's scheduler; the web lists none yet.
  notifications_list: () => [],
  notifications_read: () => undefined,
  notifications_dismiss: () => undefined,

  app_lock_status: () => LOCK_OFF,
  app_lock_lock: () => LOCK_OFF,
  app_lock_set: () => Promise.reject(LOCK_WEB),
  app_lock_turn_off: () => LOCK_OFF,
  app_lock_unlock: () => LOCK_OFF,
  app_lock_send_code: () => Promise.reject(LOCK_WEB),
  app_lock_reset: () => LOCK_OFF,

  // Encrypted areas open on the web once the browser can unlock the account's
  // key (the desktop's Argon2id + XChaCha20-Poly1305 format). Until then
  // their banner says they aren't syncing here.
  vault_status: () => (DEMO ? "unlocked" : "needs_password"),
  vault_unlock: () => Promise.reject(ENCRYPTED_SOON),
  vault_recover: () => Promise.reject(ENCRYPTED_SOON),
  vault_start_over: () => Promise.reject(ENCRYPTED_SOON),
  vault_recovery_code: () => Promise.reject("Your recovery code is shown in the desktop app: Account → Encryption → Show recovery code."),
};

export const ENCRYPTED_SOON =
  "Finance, Notes, Journal, Goals and Birthdays are end-to-end encrypted, and unlocking them in the browser isn't ready yet. They're safe, and they keep syncing between your desktop devices.";
