// What isn't on the web yet, answered the way a locked desktop would: the
// end-to-end encrypted areas (Finance, Notes, Journal, Goals, Birthdays) show
// empty, under the desktop's own "not syncing on this computer yet" banner,
// and refuse changes with a message saying why; Lemma's chat needs its tools
// ported; Lemma on the desktop needs a desktop.
import { localDay } from "../../../site/src/lib/terminal/planner";
import { ENCRYPTED_SOON } from "./system";
import type { Handler, Handlers } from "./types";

const refuse = (message: string): Handler => () => Promise.reject(message);
const locked = refuse(ENCRYPTED_SOON);
const value = (v: unknown): Handler => () => (typeof v === "function" ? v() : structuredClone(v));
const analyticsSoon = (area: string) => refuse(`${area} analytics aren't on the web yet.`);

const LEMMA_SOON =
  "Lemma's chat isn't on the web yet: it answers by working in your areas, and those tools are still being brought to the browser. Ask Lemma in the desktop app meanwhile.";
const DESK = "Lemma on your desktop lives in the Axiom desktop app.";

function emptyMonth({ month }: { month?: string }) {
  return {
    month: month ?? localDay().slice(0, 7), homeCurrency: "GBP", income: 0, spending: 0, budgeted: null, spendingByCategory: [], incomeByCategory: [],
    uncategorised: 0, unconverted: 0, due: [], trend: [], netWorth: null,
  };
}

const PROMPTS = [
  "What's on your mind today?",
  "What went well today, and why?",
  "What's one thing you'd like to remember about today?",
  "What are you looking forward to?",
  "What drained your energy today, and what gave you some back?",
];

export const pending: Handlers = {
  // Finance
  finance_state: value({ settings: null, accounts: [], categories: [], recurring: [] }),
  finance_transactions: value([]),
  finance_month: (args) => emptyMonth(args),
  finance_convert: value(0),
  ...Object.fromEntries(
    ["finance_setup", "finance_set_home_currency", "finance_add_account", "finance_update_account", "finance_archive_account", "finance_delete_account",
      "finance_add_category", "finance_update_category", "finance_delete_category", "finance_add_transaction", "finance_update_transaction",
      "finance_set_category", "finance_delete_transaction", "finance_quick", "finance_add_recurring", "finance_update_recurring", "finance_delete_recurring",
      "finance_confirm", "finance_skip", "finance_import_preview", "finance_import_commit"].map((c) => [c, locked]),
  ),
  finance_analytics: locked,

  // Notes
  notes_state: value({ folders: [], tags: [], notes: 0, stickies: 0, unfiled: 0, trash: 0 }),
  notes_list: value([]),
  notes_titles: value([]),
  ...Object.fromEntries(
    ["notes_get", "notes_create", "notes_change", "notes_save", "notes_compact", "notes_trash", "notes_restore", "notes_delete", "notes_empty_trash",
      "notes_folder_create", "notes_folder_rename", "notes_folder_move", "notes_folder_delete", "notes_export"].map((c) => [c, locked]),
  ),
  notes_analytics: locked,

  // Journal
  journal_list: value([]),
  journal_on_day: value([]),
  journal_stats: value({ streak: 0, longestStreak: 0, writtenToday: false, entries: 0, words: 0, calendar: [], onThisDay: [], averageMood: null, averageEnergy: null, tags: [] }),
  journal_prompts: ({ today }) => [PROMPTS, PROMPTS[new Date(`${today ?? localDay()}T12:00:00`).getDate() % PROMPTS.length]],
  ...Object.fromEntries(["journal_get", "journal_create", "journal_update", "journal_save", "journal_compact", "journal_delete", "journal_export"].map((c) => [c, locked])),
  journal_analytics: locked,

  // Goals
  goals_list: value([]),
  goals_summary: value({ active: 0, onTrack: 0, behind: 0, doneThisYear: 0 }),
  goals_sources: value({ accounts: [], projects: [], modules: [], learning: [] }),
  ...Object.fromEntries(
    ["goals_get", "goals_create", "goals_update", "goals_set_status", "goals_move", "goals_delete", "goals_log", "goals_log_delete", "goals_milestone_add",
      "goals_milestone_update", "goals_milestone_tick", "goals_milestone_delete"].map((c) => [c, locked]),
  ),
  goals_analytics: locked,

  // Birthdays
  birthdays_list: value([]),
  ...Object.fromEntries(
    ["birthdays_get", "birthdays_create", "birthdays_update", "birthdays_delete", "birthdays_gift_add", "birthdays_gift_update", "birthdays_gift_delete",
      "birthdays_import", "birthdays_export"].map((c) => [c, locked]),
  ),
  birthdays_analytics: locked,

  // Lemma
  assistant_chats: value([]),
  assistant_wake: value(undefined),
  ...Object.fromEntries(
    ["assistant_chat", "assistant_send", "assistant_stop", "assistant_confirm", "assistant_discard", "assistant_confirm_all", "assistant_undo",
      "assistant_rename_chat", "assistant_delete_chat", "assistant_quick", "assistant_act", "assistant_quick_undo", "ai_transcribe"].map((c) => [c, refuse(LEMMA_SOON)]),
  ),
  assistant_analytics: refuse(LEMMA_SOON),

  // Lemma on the desktop: nothing to show it on.
  desk_state: value({ idleSeconds: 0, fullScreen: false, call: false, active: null }),
  desk_show: refuse(DESK),
  desk_settle: value(null),
  desk_resize: value(null),
  desk_weather: value(null),
  desk_notify: ({ title, body }) => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(String(title), { body: String(body) });
  },
  ...Object.fromEntries(["desk_place", "desk_hotkey", "desk_hide", "desk_open_main", "desk_timer_keys", "desk_chime", "desk_background", "desk_quit"].map((c) => [c, value(undefined)])),

  // Analytics still to come for the plaintext areas.
  plan_analytics: analyticsSoon("Daily Plan"),
  board_analytics: analyticsSoon("Project Board"),
};
