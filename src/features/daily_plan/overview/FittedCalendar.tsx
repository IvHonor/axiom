import type { CSSProperties } from "react";
import type { DayPlan } from "../api";
import { colorOf } from "../palette";
import { clock } from "../time";
import { itemTime, lanes, timeRange, type Item, type Preferences } from "./model";

interface Props {
  items: Item[];
  plan: DayPlan;
  prefs: Preferences;
  minute: number;
  height: number;
  open: (item?: Item) => void;
  horizontal?: boolean;
}

export function FittedCalendar({ items, plan, prefs, minute, height, open, horizontal = false }: Props) {
  const [start, end] = timeRange(items, plan, prefs.hours);
  const span = end - start;
  const allDay = items.filter((item) => item.allDay);
  const timed = items.filter((item) => !item.allDay);
  const canvasHeight = Math.max(40, height - 24 - (allDay.length ? 26 : 0));
  const minimumDuration = horizontal ? span * 0.007 : 20 / canvasHeight * span;
  // Keep even a five-minute event at midnight fully inside the canvas. Allocate
  // lanes from these rendered bounds, not just its shorter real duration.
  const visualItems = timed.map((item) => {
    const visualStart = Math.min(item.start, end - minimumDuration);
    return { ...item, start: visualStart, end: Math.max(item.end, visualStart + minimumDuration) };
  });
  const layout = lanes(visualItems);
  const laneCount = Math.max(1, ...Array.from(layout.values(), (lane) => lane.count));
  const step = horizontal ? Math.max(60, Math.ceil(span / 60 / 6) * 60) : Math.max(60, Math.ceil(span / 60 / Math.max(1, canvasHeight / 30)) * 60);
  const ticks: number[] = [];
  for (let tick = start; tick < end; tick += step) ticks.push(tick);
  const position = (value: number) => (value - start) / span * 100;
  const nowVisible = minute >= start && minute < end;
  return <div className={`dp-ov-calendar ${horizontal ? "is-horizontal" : ""}`}>
    <div className="dp-ov-calendar-caption"><span>{clock(start)}–{clock(end)}</span><span>{nowVisible ? "Now" : "Current time"} {clock(minute)}</span></div>
    {allDay.length > 0 && <button className="dp-ov-all-day" onClick={() => open(allDay[0])} title={allDay.map((item) => item.title).join(" · ")}>All day · {allDay[0].title}{allDay.length > 1 ? ` +${allDay.length - 1}` : ""}</button>}
    <div className="dp-ov-calendar-canvas" style={{ height: canvasHeight }} aria-label="Day schedule">
      {ticks.map((tick) => <div className="dp-ov-tick" key={tick} style={horizontal ? { left: `${position(tick)}%` } : { top: `${position(tick)}%` }}><time>{clock(tick)}</time></div>)}
      <div className="dp-ov-calendar-events">
        {timed.map((item, index) => {
          const lane = layout.get(item.id)!;
          const visual = visualItems[index];
          const length = (visual.end - visual.start) / span * 100;
          const style = horizontal ? {
            left: `${position(visual.start)}%`, width: `${length}%`,
            top: `${lane.lane / laneCount * 100}%`, height: `${100 / laneCount}%`,
          } : {
            top: `${position(visual.start)}%`, height: `${length}%`,
            left: `${lane.lane / lane.count * 100}%`, width: `${100 / lane.count}%`,
          };
          return <button key={item.id} className={`dp-ov-calendar-event ${item.task?.doneAt ? "is-done" : ""}`} style={{ ...style, "--block": colorOf(item.color) } as CSSProperties}
            aria-label={`${item.title}, ${itemTime(item)}`} title={`${item.title} · ${itemTime(item)}`} onClick={() => open(item)}>
            <strong>{item.title}</strong>{!horizontal && (item.end - item.start) / span * canvasHeight >= 40 && <span>{itemTime(item)}</span>}
          </button>;
        })}
        {nowVisible && <div className="dp-ov-now" style={horizontal ? { left: `${position(minute)}%` } : { top: `${position(minute)}%` }} aria-label={`Now ${clock(minute)}`} />}
      </div>
      {timed.length === 0 && <span className="dp-ov-calendar-clear">No timed events</span>}
    </div>
  </div>;
}
