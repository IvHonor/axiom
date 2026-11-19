import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AssistantView } from "../src/shell/views/AssistantView";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// Lemma's page with a few weeks of made-up activity, for the Achievements
// view. `?empty` starts from nothing. Nothing leaves the page.
const empty = new URLSearchParams(location.search).has("empty");
// `?interview`: a certain book has been finished.
const interview = new URLSearchParams(location.search).has("interview");
const key = (d: Date) => d.toISOString().slice(0, 10);
/** `n` days ending today, each worth `each`. */
const run = (n: number, each: number, gap = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [key(new Date(Date.now() - (i + gap) * 864e5)), each]));
const days = empty ? {} : {
  active: run(40, 1),
  "journal.days": run(12, 1),
  "reading.pages": run(20, 45),
  "reading.books": { [key(new Date())]: 3 },
  "learning.minutes": run(9, 50),
  "daily_plan.done": run(30, 4),
  "daily_plan.perfect": run(4, 1),
  "daily_plan.focus": run(25, 90),
  "project_board.done": run(5, 2),
  ...(interview ? { "reading.quiet_started": run(1, 1, 9), "reading.quiet_finished": run(1, 1) } : {}),
};

mockWindows("main");
mockIPC((command) => {
  switch (command) {
    case "account_status": return { state: "signed_out" };
    case "assistant_chats": return [];
    case "playground_days": return days;
  }
}, { shouldMockEvents: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider installed={EXTENSIONS}>
      <div style={{ height: "100vh" }}><AssistantView areas={[]} name={null} /></div>
    </ThemeProvider>
  </StrictMode>,
);
