// The Playground on the web (not Nexus, which is desktop only): the server calls go through the website's
// /api/terminal/account (see OPS there), and `playground_days` mirrors
// src-tauri/src/playground.rs over the synced rows the browser can read.
// Journal and Goals are encrypted (locked here), so the web leaves them out
// and never sends `active`, which would undercount the desktop's.
import { dayKey } from "../../features/playground/stats";
import { DEMO, rowsOf, snapshot } from "../runtime";
import { account } from "./account";
import { readingDays } from "./readingDays";
import type { Handlers } from "./types";

type Days = Record<string, number>;
const add = (days: Days, day: unknown, n: number) => {
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.slice(0, 10)) && n > 0) days[day.slice(0, 10)] = (days[day.slice(0, 10)] ?? 0) + n;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const localDay = (iso: unknown) => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? dayKey(new Date(iso)) : null);

async function days(): Promise<Record<string, Days>> {
  if (DEMO) return {};
  const { records } = await snapshot();
  const out: Record<string, Days> = {};
  const metric = (id: string) => (out[id] ??= {});

  Object.assign(out, readingDays({ books: rowsOf(records, "reading_books"), sessions: rowsOf(records, "reading_sessions"), notes: rowsOf(records, "reading_notes"), reads: rowsOf(records, "reading_reads") }));
  for (const s of rowsOf(records, "learning_sessions")) add(metric("learning.minutes"), s.data.day, num(s.data.minutes));
  for (const u of rowsOf(records, "learning_units")) add(metric("learning.units"), u.data.done_on, 1);
  for (const l of rowsOf(records, "uni_lectures")) add(metric("uni.caught_up"), l.data.caught_up_on, 1);
  for (const t of rowsOf(records, "project_board_tasks")) add(metric("project_board.done"), localDay(t.data.completed_at), 1);

  const top: Record<string, [number, number]> = {};
  for (const t of rowsOf(records, "daily_plan_tasks")) {
    const day = t.data.day;
    if (typeof day !== "string") continue;
    add(metric("daily_plan.focus"), day, num(t.data.actual_minutes));
    if (t.data.done_at) add(metric("daily_plan.done"), day, 1);
    if (t.data.focus_rank !== null && t.data.focus_rank !== undefined) {
      const slot = (top[day] ??= [0, 0]);
      slot[0] += 1;
      slot[1] += t.data.done_at ? 1 : 0;
    }
  }
  // For achievements alone, as on the desktop; an empty one still counts, as 0.
  const planned = metric("daily_plan.planned"), shutdown = metric("daily_plan.shutdown"), routines = metric("daily_plan.routines");
  for (const d of rowsOf(records, "daily_plan_days")) {
    const [count, done] = top[d.id] ?? [0, 0];
    if (d.data.planned_at && d.data.shutdown_at && count > 0 && count === done) add(metric("daily_plan.perfect"), d.id, 1);
    if (d.data.planned_at) add(planned, d.id, 1);
    if (d.data.shutdown_at) add(shutdown, d.id, 1);
  }
  for (const r of rowsOf(records, "daily_plan_routines")) add(routines, localDay(r.data.created_at), 1);
  return out;
}

const NOT_IN_DEMO = "The Playground needs an account.";
const call = <T>(op: string, args: Record<string, unknown> = {}) => (DEMO ? Promise.reject(NOT_IN_DEMO) : account<T>(op, args));

export const playground: Handlers = {
  playground_days: days,
  playground_me: () => (DEMO ? null : account("playground_me")),
  playground_save: ({ playground, handle, global, shared, lemma }) => call("playground_save", { playground, handle, global, shared, lemma }),
  playground_leave: () => call("playground_leave"),
  playground_new_code: () => call("playground_new_code"),
  playground_publish: ({ today, stats }) => call("playground_publish", { today, stats }),
  playground_board: ({ metric, period, scope, today }) => call("playground_board", { metric, period, scope, today }),
  playground_friends: () => call("playground_friends"),
  playground_add_friend: ({ handle, code }) => call("playground_add_friend", { handle, code }),
  playground_accept: ({ userId }) => call("playground_accept", { userId }),
  playground_remove: ({ userId }) => call("playground_remove", { userId }),
  playground_cheer: ({ userId }) => call("playground_cheer", { userId }),
  playground_block: ({ userId }) => call("playground_block", { userId }),
  playground_unblock: ({ userId }) => call("playground_unblock", { userId }),
  playground_avatar: ({ userId }) => call("playground_avatar", { userId }),
};
