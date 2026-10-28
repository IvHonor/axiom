"use client";
import { useRef, type CSSProperties } from "react";
import { DailyPlanView } from "../../../../src/features/daily_plan/DailyPlanView";
import { PlanSidebar } from "../../../../src/features/daily_plan/PlanSidebar";
import { ModalHostContext } from "../../../../src/shell/ui/Modal";
import { themeVariables } from "../../../../src/shell/theme/applyTheme";
import { modernThemes } from "../../../../src/themes/modern_themes";
import { emberThemes } from "../../../../src/themes/ember_themes";
import type { Workspace } from "./useWorkspace";
import { PlannerCalendars } from "./PlannerCalendars";
import { planTasks } from "@/lib/terminal/planner";
import "./desktop-planner.generated.css";
import "./desktop-planner.css";

type ThemeId = "dark" | "light" | "ember";
function themeFor(id: ThemeId) { return id === "ember" ? emberThemes.themes![0] : modernThemes.themes!.find(theme => theme.type === id)!; }
export function DesktopPlanner({ workspace, initialDay, theme }: { workspace: Workspace; initialDay?: string; theme: ThemeId }) {
  const host = useRef<HTMLDivElement>(null), selected = themeFor(theme);
  const appearance = { "data-buttons": selected.style.buttons, "data-color-scheme": selected.type, "data-hatching": selected.style.hatching ? "on" : "off", "data-brackets": selected.style.brackets ? "on" : "off", style: themeVariables(selected) as CSSProperties };
  return <><div className="desktop-planner desktop-planner-main" data-web-planner-root {...appearance}>
    <ModalHostContext.Provider value={host}><DailyPlanView initialDay={initialDay} calendarExtras={day => <details className="web-calendar-files"><summary>Import / export calendar files</summary><PlannerCalendars workspace={workspace} tasks={planTasks(workspace.records)} day={day} from={day} to={day} /></details>} /></ModalHostContext.Provider>
  </div><div ref={host} className="desktop-planner desktop-planner-portals" {...appearance} /></>;
}
export function DesktopPlannerSidebar({ theme }: { theme: ThemeId }) {
  const selected = themeFor(theme);
  return <div className="desktop-planner desktop-planner-sidebar" data-buttons={selected.style.buttons} data-color-scheme={selected.type} data-brackets={selected.style.brackets ? "on" : "off"} style={themeVariables(selected) as CSSProperties}><header className="sidebar-head">Daily Plan</header><div className="sidebar-body"><PlanSidebar active onOpen={() => {}} /></div></div>;
}
