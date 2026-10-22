import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Check, Repeat } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { useDataChanged } from "../../lib/sync";
import { Section } from "../../shell/ui/Section";
import { api, type CalendarAccount, type CalendarSetup, type Routine, type TodaySummary } from "./api";
import { VIEWS } from "./DailyPlanView";
import { colorOf } from "./palette";
import { setPlanUi, showToday, usePlanUi, type PlanView } from "./planUi";
import { ProviderButton, weekdayText } from "./Setup";
import { clock, duration, nowMinute, today as todayNow } from "./time";

/** The Daily Plan's sidebar: its views, today at a glance, calendars and routines. */
export function PlanSidebar({ active, onOpen }: AreaSidebarProps) {
  const { view, dialog, revision } = usePlanUi();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [setup, setSetup] = useState<CalendarSetup | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);

  const load = useCallback(() => {
    api.summary(todayNow(), nowMinute()).then(setSummary, () => setSummary(null));
    api.calendarSetup().then(setSetup, () => setSetup(null));
    api.listRoutines().then(setRoutines, () => setRoutines(null));
  }, []);

  // Again when the plan changes, a dialog closes, or another device syncs; and each minute for "next".
  useEffect(() => {
    if (!dialog) load();
  }, [load, dialog, revision]);
  useDataChanged(load);
  useEffect(() => {
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const go = (next: PlanView) => {
    if (next === "day") showToday();
    else setPlanUi({ view: next });
    onOpen();
  };
  const openDialog = (kind: "routines" | "calendars", start?: "google" | "microsoft" | "caldav") => {
    setPlanUi({ dialog: kind === "calendars" ? { kind, start } : { kind } });
    onOpen();
  };
  const viewItem = ({ id, label, icon: Icon }: (typeof VIEWS)[number]) => (
    <button key={id} className={active && view === id ? "nav-item is-active" : "nav-item"} onClick={() => go(id)}>
      <Icon size={16} strokeWidth={1.5} />
      {id === "day" ? "Today" : label}
    </button>
  );

  const links = setup?.calendars.filter((c) => !c.accountId) ?? [];
  const connected = (setup?.accounts.length ?? 0) + links.length;

  return (
    <>
      <Section title="Views">
        {VIEWS.map(viewItem)}
      </Section>

      <Section title="Today">
        {summary ? (
          <div className="ps-block">
            <div className="ps-progress">
              <span>
                <b>{summary.done}</b> of {summary.total} done
              </span>
              <span className="dim">
                {duration(summary.plannedMinutes)} / {duration(summary.availableMinutes)}
              </span>
            </div>
            <div className="ps-bar" aria-hidden="true">
              <span style={{ width: `${summary.total ? (summary.done / summary.total) * 100 : 0}%` }} />
            </div>
            {summary.nextBlock && (
              <p className="ps-next">
                <span className="dim">{summary.nextBlock.inProgress ? "Now" : "Next"}</span> {clock(summary.nextBlock.startMinute)}{" "}
                {summary.nextBlock.title || "Focus time"}
              </p>
            )}
            {summary.focus.length > 0 ? (
              <ol className="ps-focus">
                {summary.focus.map((t) => (
                  <li key={t.id} className={t.doneAt ? "is-done" : undefined}>
                    {t.doneAt ? <Check size={12} strokeWidth={2.5} /> : <span className="ps-rank">{t.focusRank}</span>}
                    <span>{t.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dim ps-note">No top priorities picked yet.</p>
            )}
          </div>
        ) : (
          <p className="dim ps-block">Loading…</p>
        )}
      </Section>

      <Section title="Calendars" count={connected || undefined}>
        <div className="ps-block">
          {setup && connected === 0 && (
            <>
              <p className="dim ps-note">Show your meetings here and your plan in your calendar.</p>
              <div className="ps-providers">
                <ProviderButton name="Google" available={setup.available.google} disabled={false} onClick={() => openDialog("calendars", "google")} />
                <ProviderButton name="Outlook" available={setup.available.microsoft} disabled={false} onClick={() => openDialog("calendars", "microsoft")} />
                <ProviderButton name="iCloud" available disabled={false} onClick={() => openDialog("calendars", "caldav")} />
              </div>
            </>
          )}
          {setup?.accounts.map((account) => <AccountLine key={account.id} account={account} />)}
          {links.map((c) => (
            <div key={c.id} className="ps-line" title={c.problem ?? undefined}>
              <i className="dp-setup-dot" style={{ background: colorOf(c.color) }} />
              <span className="ps-line-name">{c.name}</span>
              {c.problem && <AlertCircle size={13} strokeWidth={2} className="ps-warn" aria-label="Needs attention" />}
            </div>
          ))}
          {connected > 0 && (
            <button className="btn btn-sm btn-ghost ps-manage" onClick={() => openDialog("calendars")}>
              <CalendarDays size={13} strokeWidth={1.75} /> Manage calendars
            </button>
          )}
        </div>
      </Section>

      <Section title="Routines" count={routines?.length || undefined}>
        <div className="ps-block">
          {routines?.length === 0 && <p className="dim ps-note">Blocks that repeat, like the gym or lunch.</p>}
          {routines?.map((r) => (
            <div key={r.id} className="ps-line" title={weekdayText(r.weekdays)}>
              <i className="dp-setup-dot" style={{ background: colorOf(r.color) }} />
              <span className="ps-line-name">{r.title}</span>
              <span className="dim ps-line-meta">{clock(r.startMinute)}</span>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost ps-manage" onClick={() => openDialog("routines")}>
            <Repeat size={13} strokeWidth={1.75} /> {routines?.length ? "Manage routines" : "Add a routine"}
          </button>
        </div>
      </Section>
    </>
  );
}

function AccountLine({ account }: { account: CalendarAccount }) {
  const provider = account.provider === "google" ? "Google" : account.provider === "microsoft" ? "Outlook" : account.server.includes("icloud.com") ? "iCloud" : "CalDAV";
  return (
    <div className="ps-line" title={account.problem ?? `${provider}: ${account.name}`}>
      <span className="ps-provider">{provider}</span>
      <span className="ps-line-name">{account.name}</span>
      {account.problem && <AlertCircle size={13} strokeWidth={2} className="ps-warn" aria-label="Needs attention" />}
    </div>
  );
}
