// Typed wrappers for the notification commands in src-tauri/src/notifications/commands.rs,
// and hooks that keep the list and settings current.
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "./sync";

export type Channel = "in_app" | "desktop" | "email";

/** Mirrors `Kind`: one notification an extension sends. */
export interface NotificationKind {
  id: string;
  /** The extension's id. */
  extension: string;
  label: string;
  description: string;
  /** Can be emailed. */
  email: boolean;
}

/** Mirrors `Channels`: where one notification comes. */
export interface NotificationSetting {
  kind: string;
  inApp: boolean;
  desktop: boolean;
  email: boolean;
}

/** Mirrors `note::Model`. */
export interface AppNotification {
  /** "uni.today:2026-10-27". */
  id: string;
  kind: string;
  title: string;
  body: string;
  inApp: boolean;
  createdAt: string;
  readAt: string | null;
}

const CHANGED = "notifications-changed";

export const notificationKinds = () => invoke<NotificationKind[]>("notifications_kinds");
export const notificationSettings = () => invoke<NotificationSetting[]>("notifications_settings");
export const setNotification = (kind: string, channel: Channel, on: boolean) => invoke<NotificationSetting>("notifications_set", { kind, channel, on });
/** Tells Rust which extensions are switched off: they send nothing. */
export const setNotificationsOff = (extensions: string[]) => invoke<void>("notifications_set_off", { extensions });
export const listNotifications = () => invoke<AppNotification[]>("notifications_list");
/** One, or all when no id is given. */
export const markRead = (id?: string) => invoke<void>("notifications_read", { id: id ?? null });
/** Clears one from the list, or all when no id is given. */
export const dismiss = (id?: string) => invoke<void>("notifications_dismiss", { id: id ?? null });

/** The extension a notification is from. */
export const extensionOf = (kind: string) => kind.split(".")[0];

/** The notifications listed in the app, newest first, kept current. */
export function useNotifications(): { notifications: AppNotification[]; unread: number; reload: () => void } {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const reload = useCallback(() => {
    listNotifications().then(setNotifications, () => setNotifications([]));
  }, []);
  useEffect(reload, [reload]);
  useTauriEvent(CHANGED, reload);
  return { notifications, unread: notifications.filter((n) => !n.readAt).length, reload };
}

/** Every notification and where it comes, with a setter that updates in place. */
export function useNotificationSettings() {
  const [kinds, setKinds] = useState<NotificationKind[]>([]);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notificationKinds().then(setKinds, (e) => setError(String(e)));
    notificationSettings().then(setSettings, (e) => setError(String(e)));
  }, []);
  // Another computer may change them (they sync).
  useTauriEvent("data-changed", () => void notificationSettings().then(setSettings, () => {}));

  const set = async (kind: string, channel: Channel, on: boolean) => {
    setError(null);
    try {
      const saved = await setNotification(kind, channel, on);
      setSettings((all) => all.map((s) => (s.kind === kind ? saved : s)));
    } catch (e) {
      setError(String(e));
    }
  };
  return { kinds, settings, set, error };
}
