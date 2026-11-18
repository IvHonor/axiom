// Which of Lemma's views its page shows: the chats, achievements or settings
// (and which part of settings). Shared, so the sidebar can switch the page.
import { useSyncExternalStore } from "react";

export type LemmaPage = "chat" | "achievements" | "settings";
export type SettingsTab = "privacy" | "desktop";

let state: { page: LemmaPage; tab: SettingsTab } = { page: "chat", tab: "privacy" };
const listeners = new Set<() => void>();

/** Shows one of Lemma's views; for settings, which tab (or the one last open). */
export function showLemma(page: LemmaPage, tab: SettingsTab = state.tab) {
  if (page === state.page && tab === state.tab) return;
  state = { page, tab };
  listeners.forEach((l) => l());
}

export function useLemmaPage() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}
