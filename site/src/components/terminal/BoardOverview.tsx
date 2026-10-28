"use client";
import { ArrowUpRight, SquareKanban } from "lucide-react";
import { ordered, rows, text } from "@/lib/terminal/board";
import { localDay, shiftDay } from "@/lib/terminal/planner";
import type { Workspace } from "./useWorkspace";
import { colourOf } from "./PlannerCalendar";
import s from "./terminal.module.css";

export function BoardOverview({ workspace, onOpen }: { workspace: Workspace; onOpen: (projectId?: string) => void }) {
  const projects = ordered(rows(workspace.records, "projects")), ids = new Set(projects.map(row => row.id));
  const tasks = rows(workspace.records, "tasks").filter(row => ids.has(text(row.data.project_id)) && !row.data.archived), done = tasks.filter(row => row.data.completed_at).length;
  const due = tasks.filter(row => !row.data.completed_at && row.data.due_date && text(row.data.due_date) <= shiftDay(localDay(), 7)).sort((a, b) => text(a.data.due_date).localeCompare(text(b.data.due_date))).slice(0, 5);
  return <section className={s.panel}><h2><SquareKanban size={18} /> Project Board</h2><strong className={s.stat}>{done}<small style={{ color: "var(--dim)", fontSize: 17 }}> / {tasks.length}</small></strong><p>Cards complete across {projects.length} personal project{projects.length === 1 ? "" : "s"}</p><span className={s.progress}><i style={{ width: `${tasks.length ? done / tasks.length * 100 : 0}%` }} /></span>{due.map(task => <div className={s.task} key={task.id}><div><button className={s.taskTitle} onClick={() => onOpen(text(task.data.project_id))}>{text(task.data.title)}</button><small className={text(task.data.due_date) < localDay() ? s.due : undefined}>Due {text(task.data.due_date)} · {text(projects.find(row => row.id === task.data.project_id)?.data.name)}</small></div></div>)}<div className={s.row} style={{ marginTop: 16 }}>{projects.slice(0, 4).map(project => <button className={s.button} style={{ borderColor: colourOf(project.data.color) }} key={project.id} onClick={() => onOpen(project.id)}>{text(project.data.name)}</button>)}</div><button className={`${s.button} ${s.primary}`} onClick={() => onOpen()}>Open Project Board <ArrowUpRight size={13} /></button></section>;
}
