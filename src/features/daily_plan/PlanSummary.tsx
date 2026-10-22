import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { api, errorMessage, type DayPlan, type PlanTask } from "./api";
import { duration, mediumDay, nowMinute, today } from "./time";
import { planChanged, setPlanUi, showToday, usePlanUi } from "./planUi";
import { FittedCalendar } from "./overview/FittedCalendar";
import { EventRow, PagedList, TaskRow } from "./overview/OverviewLists";
import { RangeOverview } from "./overview/RangeOverview";
import { resolveView, rowHeight, scheduleItems, sortedTasks, VIEWS, type Item } from "./overview/model";
import { useOverviewPreferences } from "./overview/preferences";
import "./overview/overview.css";

/** A dashboard that fits the measured content area, without nested scroll regions. */
export function PlanSummary({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs } = useOverviewPreferences(size);
  const view = resolveView(prefs, width, height);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [minute, setMinute] = useState(nowMinute);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const request = useRef(0);
  const revision = usePlanUi().revision;
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const day = today();
      const result = await api.getDay(day, day);
      if (id === request.current) { setPlan(result); setMinute(nowMinute()); setError(null); }
    } catch (e) { if (id === request.current) setError(errorMessage(e)); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { window.clearInterval(timer); request.current++; };
  }, [load, revision]);
  useDataChanged(load);

  const toggle = async (task: PlanTask) => {
    if (pendingRef.current.has(task.id)) return;
    pendingRef.current.add(task.id); setPending(new Set(pendingRef.current));
    try { await api.setDone(task.id, !task.doneAt); planChanged(); }
    catch (e) { setError(errorMessage(e)); }
    finally { pendingRef.current.delete(task.id); setPending(new Set(pendingRef.current)); }
  };
  const open = (item?: Item) => {
    showToday();
    setPlanUi({ event: item?.eventId ?? null });
    onOpen();
  };

  if (error) return <div className="dp-ov-status" role="alert"><span>{error}</span><button className="btn btn-ghost" onClick={load}>Retry</button></div>;
  if (!plan) return <p className="dp-ov-empty">Loading today's plan…</p>;
  const allItems = scheduleItems(plan);
  const items = allItems.filter((item) => prefs.completed || !item.task?.doneAt);
  const remaining = sortedTasks(plan.tasks.filter((task) => !task.doneAt));
  const tasks = sortedTasks(plan.tasks.filter((task) => prefs.completed || !task.doneAt));
  const done = plan.tasks.filter((task) => task.doneAt).length;
  const scheduledIds = new Set(plan.blocks.map((block) => block.taskId).filter(Boolean));
  const unscheduled = tasks.filter((task) => !scheduledIds.has(task.id));
  const current = items.filter((item) => !item.allDay && item.start <= minute && item.end > minute);
  const future = items.filter((item) => !item.allDay && item.start > minute);
  const allDay = items.filter((item) => item.allDay);
  const past = items.filter((item) => !item.allDay && item.end <= minute);
  const ordered = [...current, ...future, ...allDay, ...(prefs.earlier ? past : [])];
  const next = current[0] ?? future[0] ?? allDay[0];
  const row = rowHeight(prefs.density, height);
  const tiny = height < 130;
  const contentHeight = Math.max(0, height - (tiny ? 0 : 52));
  const taskRows = (list: PlanTask[]) => list.map((task) => ({ id: task.id, node: <TaskRow task={task} toggle={toggle} pending={pending} /> }));
  const list = (listTasks: PlanTask[], availableHeight: number, label = "tasks", empty = "No tasks for today. Open Daily Plan to add one.") =>
    <PagedList key={`${view}-${prefs.completed}-${prefs.density}`} rows={taskRows(listTasks)} height={availableHeight} row={row} label={label} empty={empty} />;

  const renderContent = () => {
    if (view === "glance") return <div className="dp-ov-glance">
      <button onClick={() => open(next)} title={next?.title ?? remaining[0]?.title ?? "Open today's plan"}>
        <small>{current.length ? "Now" : next ? "Next" : remaining.length ? "Next task" : "Today"}</small>
        <strong>{next?.title ?? remaining[0]?.title ?? "Your day is clear"}</strong>
      </button>
      <button className="dp-ov-glance-count" onClick={() => open()} title={`${remaining.length} tasks left`}>{remaining.length}<small>tasks left</small></button>
    </div>;

    if (view === "focus") {
      const rows = [];
      if (next) rows.push({ id: next.id, node: <EventRow item={next} minute={minute} open={open} /> });
      if (remaining[0]) rows.push({ id: remaining[0].id, node: <TaskRow task={remaining[0]} toggle={toggle} pending={pending} /> });
      const following = ordered.find((item) => item.id !== next?.id);
      if (following) rows.push({ id: following.id, node: <EventRow item={following} minute={minute} open={open} /> });
      return <PagedList rows={rows} height={contentHeight} row={row} empty="Nothing else planned today." label="now and next" />;
    }

    if (view === "tasks") return list(tasks, contentHeight, "tasks", plan.tasks.length ? "All today's tasks are complete." : "No tasks yet. Open Daily Plan to add one.");
    if (view === "priorities") return list(tasks.filter((task) => task.focusRank !== null), contentHeight, "priorities", "No open priorities. Star up to three tasks in Daily Plan.");

    if (view === "agenda") {
      // Interleave unscheduled work with events so tasks do not disappear behind a busy calendar.
      const rows = [];
      for (let i = 0; i < Math.max(ordered.length, unscheduled.length); i++) {
        if (ordered[i]) rows.push({ id: ordered[i].id, node: <EventRow item={ordered[i]} minute={minute} open={open} /> });
        if (unscheduled[i]) rows.push({ id: unscheduled[i].id, node: <TaskRow task={unscheduled[i]} toggle={toggle} pending={pending} /> });
      }
      const missed = tasks.filter((task) => !task.doneAt && scheduledIds.has(task.id) && !ordered.some((item) => item.task?.id === task.id));
      rows.push(...taskRows(missed));
      return <PagedList key={`agenda-${prefs.earlier}-${prefs.completed}`} rows={rows} height={contentHeight} row={row} label="agenda" empty={past.length ? "No more events today. Past events are available in display options." : "Your day is clear. Open Daily Plan to add tasks or events."} />;
    }

    if (view === "progress") {
      const percent = plan.tasks.length ? Math.round(done / plan.tasks.length * 100) : 0;
      const planned = allItems.filter((item) => !item.allDay).reduce((sum, item) => sum + item.end - item.start, 0);
      return <div className="dp-ov-progress">
        <div className="dp-ov-progress-stats"><strong>{percent}<small>%</small></strong><span>{done}/{plan.tasks.length} tasks done<small>{duration(planned)} scheduled</small></span></div>
        <div className="dp-ov-progress-track" role="progressbar" aria-label="Today's task completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
        {contentHeight >= 100 && <div className="dp-ov-progress-next">{remaining[0] ? <TaskRow task={remaining[0]} toggle={toggle} pending={pending} /> : <span className="dim">{plan.tasks.length ? "All tasks complete." : "No tasks planned yet."}</span>}</div>}
      </div>;
    }

    if (view === "week" || view === "month") return <RangeOverview view={view} day={plan.day} onOpen={onOpen} />;

    if (view === "strip") {
      const calendarHeight = Math.min(110, Math.max(80, contentHeight * 0.55));
      return <div className="dp-ov-strip">
        <FittedCalendar items={items} plan={plan} prefs={prefs} minute={minute} height={calendarHeight} open={open} horizontal />
        {list(tasks, contentHeight - calendarHeight - 6, "tasks", "No tasks planned today.")}
      </div>;
    }

    if (view === "split") return <div className="dp-ov-split">
      <FittedCalendar items={items} plan={plan} prefs={prefs} minute={minute} height={contentHeight} open={open} />
      <div className="dp-ov-split-tasks"><div className="dp-ov-section-label">Today's tasks <span>{unscheduled.length} unscheduled</span></div>{list(tasks, contentHeight - 25)}</div>
    </div>;

    return <div className="dp-ov-timeline">
      <FittedCalendar items={items} plan={plan} prefs={prefs} minute={minute} height={contentHeight - 38} open={open} />
      <div className="dp-ov-timeline-task">{remaining[0] ? <TaskRow task={remaining[0]} toggle={toggle} pending={pending} /> : <span className="dim">{plan.tasks.length ? "All tasks complete" : "No tasks planned"}</span>}</div>
    </div>;
  };

  return <section className={`dp-ov-root ${tiny ? "is-tiny" : ""}`} data-view={view} aria-label={`Daily Plan: ${VIEWS.find((option) => option.id === view)!.label}`}>
    {!tiny && <div className="dp-ov-heading"><strong>Today</strong><span title={VIEWS.find((option) => option.id === view)!.label}>{width >= 260 ? mediumDay(plan.day) : VIEWS.find((option) => option.id === view)!.label}</span></div>}
    <div className="dp-ov-content" key={view}>{renderContent()}</div>
    {!tiny && <button className="dp-ov-footer" onClick={() => open()} title={`${remaining.length} tasks left · ${unscheduled.length} unscheduled · ${past.length} past events`}>
      <span>{remaining.length} tasks left{width >= 270 && ` · ${unscheduled.length} unscheduled`}</span><span>Open day ↗</span>
    </button>}
  </section>;
}
