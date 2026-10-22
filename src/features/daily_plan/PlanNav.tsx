import { useEffect, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, CalendarPlus, CalendarRange, Repeat, Sun } from "lucide-react";
import type { AreaNavProps } from "../../extensions/types";
import { api, type CalendarSetup } from "./api";
import { setPlanUi, showToday, usePlanUi, type PlanView } from "./planUi";

/** The Daily Plan's items in the sidebar: its views, routines and calendars. */
export function PlanNav({ active, onOpen }: AreaNavProps) {
  const { view, dialog } = usePlanUi();
  const [setup, setSetup] = useState<CalendarSetup | null>(null);

  // Re-read whenever a dialog closes, so "Connect calendar" turns into the count.
  useEffect(() => {
    if (dialog) return;
    api.calendarSetup().then(setSetup, () => setSetup(null));
  }, [dialog]);

  const go = (next: PlanView) => {
    if (next === "day") showToday();
    else setPlanUi({ view: next });
    onOpen();
  };
  const open = (kind: "routines" | "calendars") => {
    setPlanUi({ dialog: { kind } });
    onOpen();
  };

  const connected = setup ? setup.accounts.length + setup.calendars.filter((c) => !c.accountId).length : 0;
  const problem = setup?.accounts.find((a) => a.problem)?.problem ?? setup?.calendars.find((c) => c.problem)?.problem;
  const item = (on: boolean) => `nav-item nav-sub${on ? " is-current" : ""}`;

  return (
    <div className="nav-group" role="group" aria-label="Daily Plan">
      <button className={item(active && view === "day")} onClick={() => go("day")}>
        <Sun size={14} strokeWidth={1.5} /> Today
      </button>
      <button className={item(active && view === "week")} onClick={() => go("week")}>
        <CalendarRange size={14} strokeWidth={1.5} /> Week
      </button>
      <button className={item(active && view === "insights")} onClick={() => go("insights")}>
        <BarChart3 size={14} strokeWidth={1.5} /> Insights
      </button>
      <button className={item(false)} onClick={() => open("routines")}>
        <Repeat size={14} strokeWidth={1.5} /> Routines
      </button>
      <button className={item(false)} onClick={() => open("calendars")} title={problem ?? undefined}>
        {connected ? <CalendarDays size={14} strokeWidth={1.5} /> : <CalendarPlus size={14} strokeWidth={1.5} />}
        {connected ? "Calendars" : "Connect calendar"}
        {problem ? (
          <AlertCircle size={13} strokeWidth={2} className="nav-warn" aria-label="Needs attention" />
        ) : (
          connected > 0 && <span className="nav-meta">{connected}</span>
        )}
      </button>
    </div>
  );
}
