// Isolated UI fixture: all planner commands use in-memory data, never the user's database.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PlanSummary } from "../src/features/daily_plan/PlanSummary";
import { PlanSummaryTitle } from "../src/features/daily_plan/overview/OverviewMenu";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { Panel } from "../src/shell/ui/Panel";
import { api, type DayPlan } from "../src/features/daily_plan/api";
import { addDays, today } from "../src/features/daily_plan/time";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/daily_plan/plan.css";

const query = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![query.get("theme") === "light" ? 1 : 0]);
const day = today();
const tasks = Array.from({ length: 18 }, (_, i) => ({ id: `t${i}`, title: ["Prepare seminar notes", "Read chapter four", "Write project proposal"][i] ?? `Task ${i + 1}: finish the remaining work`, notes: "", day, position: i, estimateMinutes: 25 + i * 5, focusRank: i < 3 ? i + 1 : null, doneAt: i === 17 ? "2026-10-22T08:00:00Z" : null, boardTaskId: null, createdAt: "", updatedAt: "", actualMinutes: 0, timerStartedAt: null }));
const plan: DayPlan = {
  day, tasks, earlier: [], inbox: [], running: null, pace: null, cards: [], suggestions: [],
  settings: { dayStartMinute: 480, dayEndMinute: 1080, bufferPercent: 20 },
  info: { intention: "", wentWell: "", doBetter: "", plannedAt: null, shutdownAt: null },
  blocks: [{ id: "b1", day, startMinute: 600, durationMinutes: 50, title: "Study", color: "green", taskId: "t0", routineId: null }],
  events: [
    { id: "e1", title: "EC4051 · Seminar", startMinute: 840, durationMinutes: 90, allDay: false, color: "blue" },
    { id: "e2", title: "Design review", startMinute: 870, durationMinutes: 30, allDay: false, color: "purple" },
    { id: "e3", title: "Project deadline", startMinute: 0, durationMinutes: 1440, allDay: true, color: "orange" },
    { id: "e4", title: "Morning lecture", startMinute: 540, durationMinutes: 60, allDay: false, color: "purple" },
  ].map((event) => ({ ...event, calendarId: "test", day, busy: true, startAt: null, endAt: null, location: "", description: "", link: null, recurring: false, editable: false })),
};
if (query.get("empty") === "true") { plan.tasks = []; plan.events = []; plan.blocks = []; }
if (query.get("edge") === "true") {
  plan.events.push(...Array.from({ length: 12 }, (_, i) => ({ ...plan.events[0], id: `short${i}`, title: `Overlapping ${i}`, startMinute: 1430 + i % 5, durationMinutes: 5 })));
}
api.getDay = async () => structuredClone(plan);
api.setDone = async (id, done) => { const task = plan.tasks.find((t) => t.id === id)!; task.doneAt = done ? new Date().toISOString() : null; };
api.range = async (from, to) => {
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) days.push({ day: date, tasks: plan.tasks, blocks: plan.blocks, events: plan.events, plannedMinutes: 230, planned: false });
  return { days, settings: plan.settings, pace: null, inbox: [] };
};

function Fixture() {
  const [size, setSize] = useState({ w: Number(query.get("w") ?? 4), h: Number(query.get("h") ?? 4) });
  const [opened, setOpened] = useState(0);
  return <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
    <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
      <label>Width <input aria-label="Grid width" type="number" value={size.w} onChange={(e) => setSize({ ...size, w: +e.target.value })} style={{ width: 60, background: "var(--panel)" }} /></label>
      <label>Height <input aria-label="Grid height" type="number" value={size.h} onChange={(e) => setSize({ ...size, h: +e.target.value })} style={{ width: 60, background: "var(--panel)" }} /></label>
      <span data-testid="opened">Opened {opened}</span>
    </div>
    <TileGrid><ResizableTile size={size} onResize={setSize} label="Daily Plan">
      <Panel className="tile tile-fitted" title={<PlanSummaryTitle onOpen={() => setOpened(opened + 1)} />} actions={<button onClick={() => setOpened(opened + 1)}>↗</button>}>
        <PlanSummary onOpen={() => setOpened(opened + 1)} />
      </Panel>
    </ResizableTile></TileGrid>
  </div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
