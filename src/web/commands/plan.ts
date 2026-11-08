// Daily Plan on the web: the planner's commands, answered from the synced
// rows by the web planner (site/src/lib/terminal/desktopPlanner.ts), which
// keeps the desktop's rules for routines, carry-over, timers, linked board
// cards and calendar files. Direct Google/Outlook/CalDAV sign-in stays on
// the desktop (its sign-ins are encrypted on each device).
import { createDesktopPlanner } from "../../../site/src/lib/terminal/desktopPlanner";
import { currentAccount, DEMO, ready, rowsOf, save, snapshot } from "../runtime";
import type { Handlers } from "./types";

async function feed(url: string) {
  if (DEMO) throw new Error("Calendar links can't be fetched in demo mode.");
  const accountId = currentAccount()!.id;
  const response = await fetch("/api/terminal/calendar-feed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, url }),
    cache: "no-store",
    signal: AbortSignal.timeout(65_000),
  });
  const answer = await response.json();
  if (!response.ok || answer.accountId !== accountId) throw new Error(answer.message ?? "The calendar feed could not be read.");
  return String(answer.source);
}

const planner = createDesktopPlanner({ read: snapshot, save, feed });

/** Every plan_* command the planner answers (the rest are the desktop's own calendar sign-ins). */
const COMMANDS = [
  "plan_get_day", "plan_range", "plan_summary", "plan_card", "plan_quick_add", "plan_create_task", "plan_update_task", "plan_delete_task",
  "plan_set_done", "plan_set_due", "plan_set_focus", "plan_move_task", "plan_take_off", "plan_carry_over", "plan_start_timer", "plan_stop_timer",
  "plan_create_block", "plan_update_block", "plan_delete_block", "plan_fit_into_day", "plan_replan", "plan_update_day", "plan_update_settings",
  "plan_list_routines", "plan_create_routine", "plan_update_routine", "plan_delete_routine", "plan_insights", "plan_calendar_setup",
  "plan_add_calendar", "plan_remove_calendar", "plan_show_calendar", "plan_refresh_calendars", "plan_cancel_calendar_sign_in",
  "plan_connect_calendar", "plan_connect_caldav", "plan_create_plan_calendar", "plan_publish_to", "plan_update_event", "plan_delete_event",
  "plan_remove_calendar_account",
];

export const plan: Handlers = Object.fromEntries(COMMANDS.map((command) => [command, (args) => planner(command, args)]));

// Subscribed calendar links refresh every 15 minutes while Axiom's open (the
// last good copy stays when a feed can't be reached).
const FEED_EVERY = 15 * 60_000;
void ready.then(() => {
  if (DEMO) return;
  const refresh = async () => {
    if (document.hidden || !navigator.onLine) return;
    const stale = rowsOf((await snapshot()).records, "web_plan_calendars").some(
      (row) => row.data.feed_url && row.data.shown !== false && Date.now() - (Date.parse(String(row.data.refreshed_at)) || 0) > FEED_EVERY,
    );
    if (stale) await planner("plan_refresh_calendars", { force: true }).catch(() => {});
  };
  void refresh();
  window.setInterval(() => void refresh(), 60_000);
});
