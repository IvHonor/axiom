"use client";
import dynamic from "next/dynamic";
import type { Workspace } from "./useWorkspace";
export { localDay, planTasks } from "@/lib/terminal/planner";
const Planner = dynamic(() => import("./DesktopPlanner").then(module => module.DesktopPlanner), { ssr: false });
export const DailyPlanSidebar = dynamic(() => import("./DesktopPlanner").then(module => module.DesktopPlannerSidebar), { ssr: false });
export function DailyPlan({ workspace, initialDay, theme = "dark" }: { workspace: Workspace; initialDay?: string; theme?: "dark" | "light" | "ember" }) {
  return workspace.ready ? <Planner workspace={workspace} initialDay={initialDay} theme={theme} /> : <p style={{ padding: 24 }}>Opening your planner…</p>;
}
