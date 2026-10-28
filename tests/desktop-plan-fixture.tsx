// Actual desktop components and unmodified styles, with an isolated in-memory store.
import { createRoot } from "react-dom/client";
import { DailyPlanView } from "../src/features/daily_plan/DailyPlanView";
import { PlanSidebar } from "../src/features/daily_plan/PlanSidebar";
import { setPlanTransport } from "../src/features/daily_plan/api";
import { setPlanUi } from "../src/features/daily_plan/planUi";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import { emberThemes } from "../src/themes/ember_themes";
import { createDesktopPlanner } from "../site/src/lib/terminal/desktopPlanner";
import { visibleRecords, type SyncRecord } from "../site/src/lib/terminal/protocol";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/project_board/board.css";
import "../src/features/daily_plan/plan.css";

const root = createRoot(document.getElementById("root")!);
let rows: SyncRecord[] = [];
setPlanTransport(createDesktopPlanner({
  read: async () => ({ records: rows.filter(row => !row.data.deleted_at), allRecords: rows }),
  save: async edits => { rows = visibleRecords(rows, edits.map((edit, index) => ({ ...edit, operation: String(index), changed_at: Date.now() + index })), true); },
}));
Object.assign(window, { selectPlannerView: (view: "day" | "week" | "month" | "year" | "insights") => setPlanUi({ view }), mountPlanner: ({ records, theme, day, sidebar }: { records: SyncRecord[]; theme: string; day: string; sidebar: boolean }) => {
  rows = records;
  const selected = theme === "ember" ? emberThemes.themes![0] : modernThemes.themes!.find(item => item.type === theme)!;
  applyTheme(selected);
  setPlanUi({ view: "day", dialog: null });
  root.render(sidebar ? <aside className="sidebar" style={{ height: "100%" }}><header className="sidebar-head">Daily Plan</header><div className="sidebar-body"><PlanSidebar active onOpen={() => {}} /></div></aside> : <DailyPlanView key={theme} initialDay={day} />);
} });
