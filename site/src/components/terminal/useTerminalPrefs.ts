"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { isTab, type TerminalTab } from "./registry";

export interface OverviewPrefs { view: "auto" | "glance" | "focus" | "agenda" | "tasks" | "priorities" | "progress" | "strip" | "timeline" | "split" | "week" | "month"; density: "comfortable" | "compact"; hours: "scheduled" | "working" | "full"; completed: boolean; earlier: boolean }
export interface Preferences { theme: "dark" | "light" | "ember"; tabs: TerminalTab[]; active: TerminalTab; sidebar: boolean; planOverview: OverviewPrefs }
const defaults: Preferences = { theme: "dark", tabs: ["overview"], active: "overview", sidebar: true, planOverview: { view: "auto", density: "comfortable", hours: "working", completed: false, earlier: false } };
const subscribe = (callback: () => void) => { window.addEventListener("storage", callback); window.addEventListener("axiom-terminal-prefs", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("axiom-terminal-prefs", callback); }; };
const server = () => null;

function parse(saved: string | null): Preferences {
  try {
    const value = JSON.parse(saved ?? "null");
    if (!value || typeof value !== "object") return defaults;
    const tabs: TerminalTab[] = ["overview", ...new Set<TerminalTab>(Array.isArray(value.tabs) ? value.tabs.filter((tab: unknown) => isTab(tab) && tab !== "overview") : [])];
    const plan = value.planOverview;
    const planOverview: OverviewPrefs = plan && typeof plan === "object" ? { view: ["auto", "glance", "focus", "agenda", "tasks", "priorities", "progress", "strip", "timeline", "split", "week", "month"].includes(plan.view) ? plan.view : "auto", density: plan.density === "compact" ? "compact" : "comfortable", hours: ["scheduled", "working", "full"].includes(plan.hours) ? plan.hours : "working", completed: plan.completed === true, earlier: plan.earlier === true } : defaults.planOverview;
    return { theme: ["dark", "light", "ember"].includes(value.theme) ? value.theme : "dark", tabs, active: tabs.includes(value.active) ? value.active : "overview", sidebar: typeof value.sidebar === "boolean" ? value.sidebar : true, planOverview };
  } catch { return defaults; }
}

export function useTerminalPrefs(accountId: string) {
  const key = `axiom-terminal-prefs-${accountId}`;
  const snapshot = useCallback(() => { try { return localStorage.getItem(key); } catch { return null; } }, [key]);
  const saved = useSyncExternalStore(subscribe, snapshot, server);
  const prefs = useMemo(() => parse(saved), [saved]);
  const update = useCallback((change: (current: Preferences) => Preferences) => {
    // Read fresh to avoid overwriting another tab's navigation preferences.
    const next = change(parse(snapshot()));
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event("axiom-terminal-prefs")); } catch { /* Workspace storage reports failures separately. */ }
  }, [key, snapshot]);
  return [prefs, update] as const;
}
