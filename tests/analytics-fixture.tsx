// The real Analytics view, with every area's report made up in memory.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { addDays } from "../src/features/daily_plan/time";
import { daysOf, periodOf, type PeriodUnit } from "../src/shell/analytics/period";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AnalyticsView } from "../src/shell/views/AnalyticsView";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

const query = new URLSearchParams(location.search);
const empty = query.has("empty");
if (query.get("theme")) localStorage.setItem("axiom.themePrefs", JSON.stringify({ followSystem: false, fixed: query.get("theme") }));

/** The same made-up numbers for a day every time. */
const noise = (day: string, salt: number) => {
  let h = salt * 2654435761;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 2246822519);
  return ((h >>> 0) % 1000) / 1000;
};
const n = (day: string, salt: number, max: number) => (empty ? 0 : Math.round(noise(day, salt) * max));
const c = (now: number | null, before: number | null) => ({ now: empty ? 0 : now, before: empty ? null : before });
/** A share or average: with nothing to go on, the backend has no number at all. */
const share = (now: number, before: number) => (empty ? { now: null, before: null } : { now, before });
const h = (now: number | null, before: number | null, trend: number[]) => ({ ...c(now, before), trend: empty ? trend.map(() => 0) : [...trend, now] });

function report(command: string, args: { unit: PeriodUnit; day: string; today: string }) {
  const period = periodOf(args.unit, args.day, args.today);
  const past = (d: string) => !empty && d <= args.today;
  const days = daysOf(period);
  const each = <T,>(f: (d: string) => T) => days.map((d) => f(d));
  switch (command) {
    case "plan_analytics":
      return {
        headline: h(18, 15, [12, 16, 9, 14, 17, 20, 15]),
        planned: c(26, 22), completion: share(69, 64), focusMinutes: c(740, 820), priorities: share(80, 60), pace: empty ? null : 1.3,
        days: each((d) => { const planned = n(d, 1, 6); return { day: d, planned, done: past(d) ? Math.min(planned, n(d, 2, 6)) : 0, focusMinutes: past(d) ? n(d, 3, 180) : 0, priorities: past(d) ? 3 : 0, prioritiesDone: past(d) ? n(d, 4, 3) : 0, plannedRitual: past(d) && noise(d, 5) > 0.3, shutdown: past(d) && noise(d, 6) > 0.5 }; }),
      };
    case "board_analytics":
      return {
        headline: h(23, 19, [14, 18, 22, 11, 19, 25, 19]), created: c(17, 21), onTime: share(78, 70), cycleDays: share(2.4, 3.1), open: 31, overdue: 4,
        days: each((d) => ({ day: d, completed: past(d) ? n(d, 7, 6) : 0, created: past(d) ? n(d, 8, 5) : 0 })),
        projects: empty ? [] : [{ id: "p1", name: "Website relaunch", color: "blue", completed: 11 }, { id: "p2", name: "Thesis", color: "purple", completed: 7 }, { id: "p3", name: "A project with a remarkably long name that keeps going", color: "orange", completed: 5 }],
      };
    case "finance_analytics": {
      const prevDays = daysOf(periodOf(args.unit, addDays(period.start, -1), args.today));
      return {
        homeCurrency: "GBP", headline: h(142_000, 98_000, [80_000, -12_000, 64_000, 120_000, 45_000, 99_000, 98_000]),
        income: c(260_000, 240_000), spending: c(118_000, 142_000), savingsRate: share(54.6, 40.8),
        days: each((d) => ({ day: d, income: past(d) && noise(d, 9) > 0.85 ? 130_000 : 0, spending: past(d) ? n(d, 10, 9_000) : 0 })),
        previousSpending: prevDays.map((d) => n(d, 11, 9_000)),
        budgeted: args.unit === "month" && !empty ? 180_000 : null,
        categories: empty ? [] : [
          { id: "g", name: "Groceries", icon: "🛒", color: "green", spent: 42_000, budget: args.unit === "month" ? 40_000 : null },
          { id: "r", name: "Eating out", icon: "🍜", color: "orange", spent: 23_500, budget: args.unit === "month" ? 30_000 : null },
          { id: "t", name: "Transport", icon: "🚆", color: "blue", spent: 12_000, budget: args.unit === "month" ? 15_000 : null },
          { id: null, name: "Uncategorised", icon: "", color: "slate", spent: 4_200, budget: null },
        ],
        unconverted: 2,
      };
    }
    case "reading_analytics":
      return {
        headline: h(412, 380, [220, 310, 450, 290, 360, 400, 380]), minutes: c(540, 600), readingDays: c(5, 4), finished: c(1, 0),
        days: each((d) => ({ day: d, pages: past(d) ? n(d, 12, 90) : 0, minutes: past(d) ? n(d, 13, 60) : 0 })),
        books: empty ? [] : [{ id: "b1", title: "The Left Hand of Darkness", pages: 220, minutes: 180 }, { id: "b2", title: "Invisible Cities", pages: 140, minutes: 0 }, { id: "b3", title: "Project Hail Mary (audiobook)", pages: 0, minutes: 360 }],
        ended: empty ? [] : [{ id: "b2", title: "Invisible Cities", coverUrl: null, day: args.today, outcome: "finished", rating: 9 }],
      };
    case "journal_analytics":
      return {
        headline: h(5, 6, [4, 6, 7, 3, 5, 6, 6]), words: c(2_340, 2_800), mood: share(3.8, 3.4), energy: share(3.1, 3.3),
        days: each((d) => { const wrote = past(d) && noise(d, 14) > 0.3; return { day: d, entries: wrote ? 1 : 0, words: wrote ? n(d, 15, 900) : 0, mood: wrote ? 1 + n(d, 16, 4) : null, energy: wrote ? 1 + n(d, 17, 4) : null }; }),
        tags: empty ? [] : [{ name: "work", count: 4 }, { name: "family", count: 3 }, { name: "running", count: 2 }],
      };
    case "uni_analytics":
      return {
        headline: empty ? { now: null, before: null, trend: [] } : h(71, 83, [90, 85, 80, 76, 88, 70, 83]), due: c(7, 6), attendance: share(86, 100), reviewed: c(3, 5), behind: empty ? 0 : 4,
        days: each((d) => { const dow = new Date(`${d}T00:00`).getDay(); const has = dow > 0 && dow < 6 && !empty; return { day: d, caughtUp: has && past(d) ? n(d, 18, 2) : 0, attended: has && past(d) ? n(d, 19, 1) : 0, behind: has && past(d) ? n(d, 20, 1) : 0, upcoming: has && !past(d) ? 1 + n(d, 21, 1) : 0 }; }),
        modules: empty ? [] : [{ id: "m1", code: "COMP1001", name: "Algorithms", color: "blue", due: 4, caughtUp: 3 }, { id: "m2", code: "MATH1002", name: "Linear algebra", color: "teal", due: 3, caughtUp: 2 }],
        confidence: empty ? [0, 0, 0] : [2, 3, 1],
      };
    case "learning_analytics": {
      const skills = empty ? [] : ["Spanish", "Rust", "Piano", "Drawing", "Statistics", "Chess", "Cooking"].map((name, i) => ({ id: `s${i}`, name, icon: "", color: ["blue", "teal", "green", "amber", "orange", "red", "pink"][i], minutes: 300 - i * 35, unitsDone: 3 - (i % 3) }));
      return {
        headline: h(1_210, 940, [600, 820, 1_100, 700, 900, 1_300, 940]), unitsDone: c(9, 7), studyDays: c(5, 5),
        skills, days: each((d) => ({ day: d, minutes: skills.map((_, i) => (past(d) ? n(d, 22 + i, 50) : 0)), unitsDone: past(d) ? n(d, 30, 3) : 0 })),
      };
    }
    case "goals_analytics":
      return {
        headline: h(6, 9, [4, 5, 8, 6, 7, 9, 9]), checkIns: c(4, 6), milestones: c(2, 3), completed: c(1, 0),
        days: each((d) => ({ day: d, checkIns: past(d) ? n(d, 31, 2) : 0, milestones: past(d) ? n(d, 32, 1) : 0 })),
        goals: empty ? [] : [
          { id: "g1", title: "Save for a trip", icon: "✈️", percent: 62, expected: 55, pace: "ahead", dueDate: "2027-03-01", moves: 2 },
          { id: "g2", title: "Run a half marathon", icon: "🏃", percent: 30, expected: 48, pace: "behind", dueDate: "2027-01-15", moves: 3 },
          { id: "g3", title: "Read 24 books", icon: "📚", percent: 75, expected: 76, pace: "on_track", dueDate: "2026-12-31", moves: 0 },
          { id: "g4", title: "Learn to juggle", icon: "", percent: 10, expected: null, pace: null, dueDate: null, moves: 1 },
        ],
      };
    case "notes_analytics":
      return {
        headline: h(9, 12, [7, 10, 14, 6, 9, 11, 12]), created: c(3, 5), total: empty ? 0 : 148,
        days: each((d) => { const worked = past(d) ? n(d, 33, 4) : 0; return { day: d, workedOn: worked, created: Math.min(worked, n(d, 34, 2)) }; }),
        tags: empty ? [] : [{ name: "ideas", count: 4 }, { name: "work", count: 3 }],
      };
    case "birthdays_analytics":
      return {
        headline: h(3, 2, [1, 0, 2, 4, 1, 2, 2]), ready: c(1, 2),
        occasions: empty ? [] : [
          { personId: "a", name: "Ada", occasion: "birthday", day: days[1], turning: 31, gift: "given" },
          { personId: "b", name: "Grandma Rose", occasion: "birthday", day: days[2], turning: 90, gift: null },
          { personId: "c", name: "Sam & Alex", occasion: "anniversary", day: days[days.length - 1], turning: 5, gift: "idea" },
        ],
      };
    case "assistant_analytics":
      return {
        headline: h(7, 4, [2, 3, 6, 1, 4, 5, 4]), asked: c(22, 18),
        days: each((d) => ({ day: d, asked: past(d) ? n(d, 35, 6) : 0, confirmed: past(d) ? n(d, 36, 2) : 0 })),
        areas: empty ? [] : [{ area: "daily_plan", confirmed: 4, discarded: 1, other: 0 }, { area: "birthdays", confirmed: 2, discarded: 0, other: 1 }, { area: "goals", confirmed: 1, discarded: 2, other: 0 }],
      };
  }
  return undefined;
}

mockWindows("main");
mockIPC((command, args) => {
  if (query.has("fail") && command === "finance_analytics") throw "Set up Finance first.";
  return command.endsWith("_analytics") ? report(command, args as never) : command === "notifications_list" ? [] : undefined;
}, { shouldMockEvents: true });

const areas = EXTENSIONS.filter((ext) => ext.area);
createRoot(document.getElementById("root")!).render(
  <ThemeProvider installed={EXTENSIONS}>
    <div className="app" style={{ height: "100vh" }}>
      <main className="main">
        <AnalyticsView areas={areas} onOpen={(id) => document.body.setAttribute("data-opened", id)} />
      </main>
    </div>
  </ThemeProvider>,
);
