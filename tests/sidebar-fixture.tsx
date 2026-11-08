// The whole app (its sidebar, activity bar, tabs) against a pretend Axiom:
// no desktop database, nothing sent anywhere. Every area answers as if
// empty, except what the sidebar's badges look at.
//   ?reviews: Learning has 3 reviews due (a badge on its icon).
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../src/App";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

const params = new URLSearchParams(location.search);
const calls: string[] = [];
Object.assign(window, { calls, isTauri: true });

mockWindows("main");
mockIPC(
  (command) => {
    calls.push(command);
    switch (command) {
      case "app_status":
        return { version: "0.7.0", dbPath: "", saved: true };
      case "app_lock_status":
        return { enabled: false, locked: false, idleMinutes: 0, needsCode: false };
      case "account_status":
        return { state: "signed_out" };
      case "learning_summary":
        return { skills: [], reviews: params.has("reviews") ? [1, 2, 3].map((i) => ({ id: `u${i}`, title: `Unit ${i}`, skillName: "Rust" })) : [], days: [], streak: 0, todayMinutes: 0, weekMinutes: 0, weekUnits: 0, recent: [] };
      case "plan_summary":
        return { total: 0, done: 0, focus: [], plannedMinutes: 0, availableMinutes: 0, running: null, nextBlock: null };
      case "birthdays_list":
      case "notifications_list":
        return [];
      default:
        // Everything else: as if there's nothing there (or it's not there).
        throw new Error(`not in this test: ${command}`);
    }
  },
  { shouldMockEvents: true },
);

createRoot(document.getElementById("root")!).render(<App />);
