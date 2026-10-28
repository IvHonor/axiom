// Real Lemma overview tile in a real resizable tile; every area's summary is an in-memory fixture.
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { api as birthdays, type Person } from "../src/features/birthdays/api";
import { api as plan, type PlanTask, type TodaySummary } from "../src/features/daily_plan/api";
import { addDays, today } from "../src/features/daily_plan/time";
import { api as goals } from "../src/features/goals/api";
import { api as learning, type LearningSummary } from "../src/features/learning/api";
import { api as reading, type BookCard, type ReadingSummary } from "../src/features/reading/api";
import { api as uni, type LectureHit, type UniSummary } from "../src/features/uni/api";
import { LemmaSummary } from "../src/features/lemma/LemmaSummary";
import { setPersona, type Personality } from "../src/features/lemma/persona";
import { Panel } from "../src/shell/ui/Panel";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/lemma/lemma.css";

const query = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![query.get("theme") === "light" ? 1 : 0]);
// ?quiet: every area answers with nothing to say; ?long: very long names; ?none: no areas at all.
const quiet = query.has("quiet"), long = query.has("long");
const name = (n: string) => (long ? `${n} — ${"AnExtraordinarilyLongUnbrokenName".repeat(3)}` : n);
if (query.has("none")) localStorage.setItem("axiom.disabled", JSON.stringify(["daily_plan", "uni", "learning", "reading", "birthdays", "goals", "finance", "journal", "notes", "project_board"]));
else localStorage.removeItem("axiom.disabled");
setPersona({ name: query.get("name") ?? "", personality: (query.get("personality") as Personality) ?? "standard" });

mockWindows("main");
mockIPC((command) => {
  if (command === "account_status") return { state: "signed_out" };
}, { shouldMockEvents: true });

const task = (id: string, title: string, rank: number | null, done = false): PlanTask => ({
  id, title: name(title), notes: "", day: today(), position: 0, estimateMinutes: 30, focusRank: rank, doneAt: done ? new Date().toISOString() : null,
  boardTaskId: null, createdAt: "", updatedAt: "", actualMinutes: 0, timerStartedAt: null, dueDate: null,
});
const planSummary: TodaySummary = quiet
  ? { total: 0, done: 0, focus: [], nextBlock: null, plannedMinutes: 0, availableMinutes: 480, running: null }
  : { total: 7, done: 3, focus: [task("t1", "Finish the econometrics problem set", 1), task("t2", "Email the society about Friday", 2), task("t3", "Gym", 3, true)],
      nextBlock: { startMinute: 14 * 60 + 30, durationMinutes: 60, title: name("Deep work: dissertation chapter two"), inProgress: false }, plannedMinutes: 300, availableMinutes: 480, running: null };

const hit = (i: number, days: number, title: string): LectureHit => ({
  id: `l${i}`, moduleId: "m1", title: name(title), kind: "lecture", week: 5, day: addDays(today(), days), topics: "", recorded: true,
  attendedOn: null, caughtUpOn: null, reviewedOn: null, confidence: null, notes: "", position: i, moduleCode: "EC5001", moduleName: "Econometrics", moduleColor: "blue", days: Math.abs(days),
});
const uniSummary: UniSummary = {
  terms: [], current: null, modules: [{ id: "m1" } as UniSummary["modules"][number]],
  behind: quiet ? [] : [hit(1, -6, "Instrumental variables"), hit(2, -3, "Panel data"), hit(3, -1, "Difference in differences")],
  upcoming: quiet ? [] : [hit(4, 0, "Regression discontinuity"), hit(5, 1, "Time series I")],
};

const learningSummary: LearningSummary = {
  skills: [{ id: "s1", name: name("Spanish"), icon: "🇪🇸", color: "orange", why: "", archived: false, position: 0,
    tally: { done: 12, total: 40, percent: 30, reviews: 4, weekMinutes: 90, totalMinutes: 600 }, sources: [] }],
  reviews: quiet ? [] : Array.from({ length: 4 }, (_, i) => ({ id: `u${i}`, sourceId: "c1", title: `Unit ${i}`, level: 0, minutes: 10, page: null, doneOn: null, reviewStage: 1, reviewOn: today(), notes: "",
    position: i, sourceTitle: "Duolingo", skillName: name("Spanish"), skillIcon: "🇪🇸", skillColor: "orange" })),
  days: [], streak: quiet ? 0 : 12, todayMinutes: 0, weekMinutes: 90, weekUnits: 3, recent: [],
};

const book = { id: "b1", title: name("The Left Hand of Darkness"), percent: 45 } as BookCard;
const readingSummary: ReadingSummary = {
  reading: quiet ? [] : [book], goal: { year: 2026, books: 20, finished: quiet ? 16 : 12, expected: 16.4 }, streak: 3, pagesToday: 0,
  shelves: { want: quiet ? 0 : 6, reading: quiet ? 0 : 1, finished: 12, dnf: 0 },
};

const person = (id: string, n: string, days: number, turning: number | null): Person => ({
  id, name: name(n), occasion: "birthday", month: 1, day: 1, year: null, relation: "friend", notes: "", remindDays: 7, next: addDays(today(), days), days, age: null, turning, ideas: 0, createdAt: "", updatedAt: "",
});

plan.summary = async () => structuredClone(planSummary);
uni.summary = async () => structuredClone(uniSummary);
learning.summary = async () => structuredClone(learningSummary);
reading.summary = async () => structuredClone(readingSummary);
birthdays.list = async () => (quiet ? [person("p9", "Sam", 80, null)] : [person("p1", "Maya", 2, 21), person("p2", "Jonah", 30, null)]);
goals.summary = async () => ({ active: 4, onTrack: quiet ? 4 : 3, behind: quiet ? 0 : 1, doneThisYear: 2 });
// Finance, Journal, Notes and the board have nothing to say here; their tiles aren't on this page.

function Fixture() {
  const [size, setSize] = useState({ w: Number(query.get("w") ?? 4), h: Number(query.get("h") ?? 4) });
  const [opened, setOpened] = useState("none");
  return <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16, fontSize: 12 }}>
      <label>Width <input aria-label="Grid width" type="number" min="2" max="12" value={size.w} onChange={(e) => setSize({ ...size, w: +e.target.value })} style={{ width: 48, background: "var(--panel)" }} /></label>
      <label>Height <input aria-label="Grid height" type="number" min="2" max="16" value={size.h} onChange={(e) => setSize({ ...size, h: +e.target.value })} style={{ width: 48, background: "var(--panel)" }} /></label>
      <output data-testid="opened">{opened}</output>
    </div>
    <TileGrid><ResizableTile size={size} onResize={setSize} label="Lemma">
      <Panel className="tile tile-fitted" style={{ "--extension-accent": "var(--accent)" } as CSSProperties} title="Lemma">
        <LemmaSummary onOpen={() => setOpened("lemma")} onOpenArea={setOpened} />
      </Panel>
    </ResizableTile></TileGrid>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
