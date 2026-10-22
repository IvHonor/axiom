// Real Overview and persistence, with inert area data. Never accesses the app database.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarClock, Columns3, StickyNote, Wallet } from "lucide-react";
import type { ExtensionManifest } from "../src/extensions/types";
import { OverviewView } from "../src/shell/views/OverviewView";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { modernThemes } from "../src/themes/modern_themes";
import { useTileLayout } from "../src/shell/ui/ResizableTile";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/shell/ui/tileDisplay.css";

function Summary() {
  const [count, setCount] = useState(0);
  const { size, width, height } = useTileLayout();
  return <div><p>{size.w} × {size.h} · {width} × {height}px</p><button className="btn" onClick={() => setCount(count + 1)}>Action {count}</button></div>;
}
const areas: ExtensionManifest[] = [
  ["project_board", "Project Board", Columns3], ["daily_plan", "Daily Plan", CalendarClock],
  ["notes", "Notes", StickyNote], ["finance", "Finance", Wallet],
].map(([id, name, icon]) => ({
  id, name, icon, description: "", about: [], features: [], version: "0.1.0", publisher: "Fixture",
  area: { Summary, fittedSummary: true },
})) as ExtensionManifest[];
function Fixture() {
  const [hidden, setHidden] = useState(false);
  const [opened, setOpened] = useState("");
  const [showOverview, setShowOverview] = useState(true);
  return <ThemeProvider installed={[modernThemes]}>
    <div style={{ padding: 12, height: 52 }}>
      <button className="btn" onClick={() => setHidden(!hidden)}>Toggle Notes</button>
      <button className="btn" onClick={() => setShowOverview(!showOverview)}>Toggle Overview</button>
      <output data-testid="opened">{opened}</output>
    </div>
    <main className="main" style={{ height: "calc(100vh - 52px)" }}>
      {showOverview && <OverviewView areas={areas.filter(area => !hidden || area.id !== "notes")} onOpen={setOpened} onBrowse={() => {}} />}
    </main>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
