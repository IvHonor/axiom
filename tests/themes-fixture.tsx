// The real theme provider and Themes panel, isolated from the desktop database.
// Theme packs are built in and always on: every theme is there to pick.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { useInstalled } from "../src/shell/useInstalled";
import { ThemeProvider, useLabels, useTheme } from "../src/shell/theme/ThemeProvider";
import { ThemesPanel } from "../src/shell/ThemesPanel";
import { TopBar } from "../src/shell/TopBar";
import { OVERVIEW } from "../src/shell/view";
import { Panel } from "../src/shell/ui/Panel";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

mockWindows("main");
mockIPC(command => {
  if (command === "notifications_list") return [];
  if (command === "account_status") return { state: "signed_out" };
}, { shouldMockEvents: true });

function Status() {
  const { theme, options } = useTheme();
  return <output data-testid="status" data-theme={theme.id} data-options={options.length}>{theme.label}</output>;
}
function StylePreview() {
  const { theme } = useTheme();
  const { label, sep } = useLabels();
  return <main className="main" data-testid="style-preview" style={{ padding: 32 }}>
    <Panel title={theme.label} meta={<span data-testid="preview-label">{label("Workspace overview")} {sep} {label("Ready to plan")}</span>}>
      <p style={{ marginBottom: 20 }}>A quiet place to turn good ideas into everyday progress.</p>
      <div className="row">
        <button className="btn" data-testid="preview-button">{label("Plan today")}</button>
        <button className="btn btn-ghost">{label("View projects")}</button>
      </div>
      <p className="mono" style={{ marginTop: 24 }}>09:30 / 12 tasks / 3 projects</p>
    </Panel>
  </main>;
}
function Fixture() {
  const { isOn } = useInstalled();
  return <ThemeProvider installed={EXTENSIONS.filter(isOn)}>
    <div className="app">
      <TopBar tabs={[OVERVIEW]} active={OVERVIEW} previewKey={null}
        onSelect={() => {}} onPin={() => {}} onClose={() => {}} onReorder={() => {}}
        playground={{ on: false, open: () => {} }} />
      <div className="workbench"><ThemesPanel /><StylePreview /></div>
      <div style={{ padding: "4px 12px", fontSize: 11 }}><Status /></div>
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
