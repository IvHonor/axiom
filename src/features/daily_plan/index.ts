import "./plan.css";
import { CalendarClock } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { DailyPlanView } from "./DailyPlanView";
import { PlanSidebar } from "./PlanSidebar";
import { PlanSummary } from "./PlanSummary";

export const dailyPlan: ExtensionManifest = {
  id: "daily_plan",
  name: "Daily Plan",
  description: "Plan the day in time blocks and see whether it all fits.",
  about: [
    "Give every hour a job. Daily Plan lays your day out as a timeline of blocks beside your task list, so you can see at a glance whether everything fits.",
    "Pick the few things that matter most, give tasks a rough length, and drag them into the day. When the day slips, leftovers wait for you tomorrow instead of disappearing.",
  ],
  features: [
    "A timeline you drag to create, move and resize blocks",
    "Up to three top priorities for each day",
    "Time estimates and a capacity bar that warns when you've planned too much",
    "Quick add: type \"Write report 45m 2pm\" and it's planned",
    "Unfinished tasks carry over, and an inbox for things without a day",
    "Routines for the blocks that repeat every week",
    "A week view to spread tasks across the days",
    "Connect Google Calendar, Outlook or iCloud: meetings show as busy time, and your plan shows in your calendar",
    "Insights on focus time, follow-through and how long tasks really take",
    "Syncs between your computers like everything else",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: CalendarClock,
  area: { View: DailyPlanView, Summary: PlanSummary, Sidebar: PlanSidebar },
};
