"use client";

import { useRef, useState, type PointerEvent } from "react";
import { GripHorizontal, GripVertical } from "lucide-react";
import { localDay, monthDays, planCapacity, planSettings, shiftDay, timelineLanes, type PlanTask } from "@/lib/terminal/planner";
import type { CalendarEvent } from "@/lib/terminal/calendar";
import type { SyncRecord } from "@/lib/terminal/protocol";
import { clockTime } from "./PlannerExtras";
import s from "./terminal.module.css";

export const blockColors: Record<string, string> = { purple: "#b7a0df", green: "#83bf96", blue: "#86ade8", orange: "#efa56f", pink: "#e39ab2", teal: "#78c5bd", yellow: "#d5bd73", red: "#df8285", sky: "#86bdcd", gray: "#aaa", lime: "#b0c65e" };
export const colourOf = (colour: unknown) => blockColors[String(colour)] ?? (/^#[a-f\d]{3,8}$/i.test(String(colour)) ? String(colour) : "#86ade8");
const PX = 1;
const snap = (minute: number) => Math.round(minute / 15) * 15;
type Move = { block: SyncRecord; resize: boolean; y: number; scroll: number; start: number; duration: number; day: string };
interface Props {
  days: string[]; records: SyncRecord[]; tasks: PlanTask[]; events: CalendarEvent[]; disabled: boolean;
  onEdit: (block: SyncRecord) => void; onEvent: (event: CalendarEvent) => void; onDay: (day: string) => void;
  onCreate: (day: string, start: number, duration?: number) => void;
  onPlace: (block: SyncRecord, day: string, start: number, duration: number) => void;
  onTaskDrop: (id: string, day: string, start?: number) => void;
}

/** Pointer and keyboard actions use the same placement callback and validation. */
export function PlannerTimeline({ days, records, tasks, events, disabled, onEdit, onEvent, onDay, onCreate, onPlace, onTaskDrop }: Props) {
  const [drag, setDrag] = useState<Move | null>(null), [full, setFull] = useState(false);
  const gesture = useRef<Move | null>(null), scroller = useRef<HTMLDivElement>(null);
  const latest = useRef<Move | null>(null);
  const creating = useRef<{ day: string; anchor: number; start: number; duration: number } | null>(null);
  const [ghost, setGhost] = useState<{ day: string; start: number; duration: number } | null>(null);
  const settings = planSettings(records), blocks = records.filter(row => row.table === "daily_plan_blocks" && days.includes(String(row.data.day)));
  const timed = [...blocks.map(block => ({ start: Number(block.data.start_minute), end: Number(block.data.start_minute) + Number(block.data.duration_minutes) })), ...events.filter(event => days.includes(event.day) && !event.allDay).map(event => ({ start: event.start, end: event.start + event.duration }))];
  const start = full ? 0 : Math.max(0, Math.floor(Math.min(settings.start, ...timed.map(item => item.start)) / 60) * 60);
  const end = full ? 1440 : Math.min(1440, Math.ceil(Math.max(settings.end, ...timed.map(item => item.end)) / 60) * 60);
  const minuteAt = (y: number, column: HTMLElement) => Math.max(0, Math.min(1439, snap(start + (y - column.getBoundingClientRect().top) / PX)));
  function begin(event: PointerEvent<HTMLButtonElement>, block: SyncRecord, resize: boolean) {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { block, resize, y: event.clientY, scroll: scroller.current?.scrollTop ?? 0, start: Number(block.data.start_minute), duration: Number(block.data.duration_minutes), day: String(block.data.day) };
    latest.current = gesture.current;
    setDrag(gesture.current);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const initial = gesture.current; if (!initial) return;
    const delta = snap((event.clientY - initial.y + (scroller.current?.scrollTop ?? 0) - initial.scroll) / PX);
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-plan-day]");
    latest.current = { ...initial, day: !initial.resize && column ? column.dataset.planDay! : initial.day, start: initial.resize ? initial.start : Math.max(0, Math.min(1440 - initial.duration, initial.start + delta)), duration: initial.resize ? Math.max(5, Math.min(1440 - initial.start, initial.duration + delta)) : initial.duration };
    setDrag(latest.current);
    const rect = scroller.current?.getBoundingClientRect();
    if (rect && (event.clientY < rect.top + 40 || event.clientY > rect.bottom - 40)) scroller.current!.scrollTop += event.clientY < rect.top + 40 ? -15 : 15;
    if (rect && days.length > 1 && (event.clientX < rect.left + 40 || event.clientX > rect.right - 40)) scroller.current!.scrollLeft += event.clientX < rect.left + 40 ? -15 : 15;
  }
  function finish() {
    const value = latest.current;
    if (value && gesture.current && (value.start !== gesture.current.start || value.duration !== gesture.current.duration || value.day !== gesture.current.day)) onPlace(value.block, value.day, value.start, value.duration);
    gesture.current = null; latest.current = null; setDrag(null);
  }
  return <section className={s.panel}><div className={s.heading}><div><h2>{days.length === 1 ? "Your time" : "Your week"}</h2><p className={s.muted}>Drag tasks onto the calendar. Drag a block’s handle to move it, or its bottom edge to resize.</p></div><button className={s.button} aria-pressed={full} onClick={() => setFull(value => !value)}>{full ? "Working hours" : "Full day"}</button></div>
    <div className={s.timelineScroll} ref={scroller}><div className={s.timeline} style={{ gridTemplateColumns: `46px repeat(${days.length}, minmax(${days.length === 1 ? 160 : 130}px, 1fr))` }}>
      <div className={s.timeHeader} />{days.map(day => <div className={s.timeHeader} key={day}><button className={s.taskTitle} aria-current={day === localDay() ? "date" : undefined} onClick={() => onDay(day)}>{new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</button>{events.filter(event => event.day === day && event.allDay).map(event => <button key={event.id} className={s.allDay} onClick={() => onEvent(event)} style={{ borderColor: colourOf(event.color) }}>{event.title}</button>)}</div>)}
      <div className={s.timeRuler} style={{ height: (end - start) * PX }}>{Array.from({ length: Math.ceil((end - start) / 60) }, (_, hour) => <time key={hour} style={{ top: hour * 60 * PX }}>{clockTime(start + hour * 60)}</time>)}</div>
      {days.map(day => {
        // Keep the captured handle mounted in its original column until release.
        const items = [...blocks.filter(block => block.data.day === day).map(block => ({ id: `b-${block.id}`, start: drag?.block.id === block.id ? drag.start : Number(block.data.start_minute), duration: drag?.block.id === block.id ? drag.duration : Number(block.data.duration_minutes), block })), ...events.filter(event => event.day === day && !event.allDay).map(event => ({ id: `e-${event.id}`, start: event.start, duration: event.duration, event }))];
        const lanes = timelineLanes(items, 42), current = new Date(), minute = current.getHours() * 60 + current.getMinutes();
        return <div key={day} className={s.timeColumn} data-plan-day={day} style={{ height: (end - start) * PX, backgroundSize: `100% ${60 * PX}px` }} onPointerDown={event => {
          if (disabled || event.target !== event.currentTarget || event.button !== 0 || event.pointerType === "touch") return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          const anchor = Math.min(1425, minuteAt(event.clientY, event.currentTarget)); creating.current = { day, anchor, start: anchor, duration: 30 }; setGhost(creating.current);
        }} onPointerMove={event => {
          const initial = creating.current; if (!initial) return;
          const minute = minuteAt(event.clientY, event.currentTarget), at = Math.min(initial.anchor, minute), end = Math.min(1440, Math.max(initial.anchor + 15, minute));
          creating.current = { ...initial, start: at, duration: Math.max(15, end - at) }; setGhost(creating.current);
        }} onPointerUp={() => { const value = creating.current; if (value) { creating.current = null; setGhost(null); onCreate(value.day, value.start, value.duration); } }} onPointerCancel={() => { creating.current = null; setGhost(null); }} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-axiom-task")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-axiom-task"); if (id && !disabled) onTaskDrop(id, day, minuteAt(event.clientY, event.currentTarget)); }}>
          <div className={s.nonWorking} style={{ top: 0, height: Math.max(0, settings.start - start) * PX }} /><div className={s.nonWorking} style={{ top: Math.max(0, settings.end - start) * PX, bottom: 0 }} />
          {day === localDay() && minute >= start && minute <= end && <div className={s.nowLine} style={{ top: (minute - start) * PX }} aria-label={`Current time ${clockTime(minute)}`} />}
          {ghost?.day === day && <div className={s.timeGhost} style={{ top: (ghost.start - start) * PX, height: ghost.duration * PX }}>{clockTime(ghost.start)} · {ghost.duration} min</div>}
          {items.map(item => {
            const lane = lanes.get(item.id)!, block = "block" in item ? item.block : null, event = "event" in item ? item.event : null;
            const title = block ? tasks.find(task => task.id === block.data.task_id)?.title ?? String(block.data.title || "Time block") : event!.title;
            return <div key={item.id} className={s.timeItem} data-preview={block?.seq === -1} style={{ top: (item.start - start) * PX, minHeight: 40, height: item.duration * PX - 2, left: `calc(${lane.lane / lane.count * 100}% + 3px)`, width: `calc(${100 / lane.count}% - 6px)`, borderColor: colourOf(block?.data.color ?? event?.color) }}>
              {block && <button className={s.timeGrip} aria-label={`Move ${title}`} title="Drag to move. Arrow keys move 15 minutes; Alt+Left/Right changes day." disabled={disabled} onPointerDown={event => begin(event, block, false)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDrag(null); }} onKeyDown={event => {
                let target = day, at = item.start;
                if (event.key === "ArrowUp") at = Math.max(0, at - 15); else if (event.key === "ArrowDown") at = Math.min(1440 - item.duration, at + 15); else if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) target = shiftDay(day, event.key === "ArrowLeft" ? -1 : 1); else return;
                event.preventDefault(); onPlace(block, target, at, item.duration);
              }}><GripVertical size={12} /></button>}
              <button className={s.timeTitle} aria-label={block ? `Edit time block ${title}` : `View event ${title}`} onClick={() => block ? onEdit(block) : onEvent(event!)}><strong>{title}</strong><small>{clockTime(item.start)}–{clockTime(item.start + item.duration)}{block?.data.routine_id ? " · Routine" : event ? " · Calendar" : ""}</small></button>
              {block && <button className={s.timeResize} aria-label={`Resize ${title}`} title="Drag to resize. Arrow keys change duration by 15 minutes." disabled={disabled} onPointerDown={event => begin(event, block, true)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDrag(null); }} onKeyDown={event => { if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); onPlace(block, day, item.start, Math.max(5, Math.min(1440 - item.start, item.duration + (event.key === "ArrowDown" ? 15 : -15)))); }}><GripHorizontal size={12} /></button>}
            </div>;
          })}
        </div>;
      })}
    </div></div><p className={s.muted}>Click or drag empty time to add a block. Move and resize handles also work with arrow keys; use Edit for exact times or touch screens.</p>
  </section>;
}

export function PlannerMonth({ day, records, tasks, events, onDay, onTaskDrop, compact = false }: { day: string; records: SyncRecord[]; tasks: PlanTask[]; events: CalendarEvent[]; onDay: (day: string) => void; onTaskDrop?: (id: string, day: string) => void; compact?: boolean }) {
  const days = monthDays(day), settings = planSettings(records);
  return <div className={`${s.month} ${compact ? s.compactMonth : ""}`}><div className={s.monthGrid}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label => <span className={s.monthLabel} key={label}>{compact ? label[0] : label}</span>)}{days.map(date => {
    const rows = tasks.filter(task => task.day === date), due = tasks.filter(task => task.due_date === date && task.day !== date && !task.done_at), count = events.filter(event => event.day === date).length, capacity = planCapacity(tasks, records, date, settings, events);
    return <button className={s.monthDay} key={date} data-outside={date.slice(0, 7) !== day.slice(0, 7)} aria-current={date === localDay() ? "date" : undefined} aria-label={`${date}: ${rows.filter(task => task.done_at).length} of ${rows.length} tasks complete, ${count} events${due.length ? `, ${due.length} deadlines` : ""}`} onClick={() => onDay(date)} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-axiom-task")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-axiom-task"); if (id) onTaskDrop?.(id, date); }}><strong>{Number(date.slice(8))}</strong>{!compact && <><small>{rows.length ? `${rows.filter(task => task.done_at).length}/${rows.length} tasks` : ""}{count ? ` · ${count} events` : ""}</small>{rows.filter(task => !task.done_at).slice(0, 2).map(task => <span className={s.calendarTask} key={task.id}>{task.focus_rank ? "★ " : ""}{task.title}</span>)}{due.length > 0 && <small className={s.due}>{due.length} due</small>}</>}{(rows.length > 0 || count > 0 || capacity.planned > 0) && <span className={s.progress}><i style={{ width: `${Math.min(100, Math.max(5, capacity.planned / Math.max(1, capacity.available) * 100))}%`, background: capacity.remaining < 0 ? "#df8285" : undefined }} /></span>}</button>;
  })}</div></div>;
}
