// The real theme provider and Themes panel, isolated from the desktop database.
// Theme packs are built in and always on: every theme is there to pick.
import { createRoot } from "react-dom/client";
import { EXTENSIONS } from "../src/extensions";
import { useInstalled } from "../src/shell/useInstalled";
import { ThemeProvider, useTheme } from "../src/shell/theme/ThemeProvider";
import { ThemesPanel } from "../src/shell/ThemesPanel";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

function Status() {
  const { theme, options } = useTheme();
  return <output data-testid="status" data-theme={theme.id} data-options={options.length}>{theme.label}</output>;
}
function Fixture() {
  const { isOn } = useInstalled();
  return <ThemeProvider installed={EXTENSIONS.filter(isOn)}>
    <div style={{ padding: 16 }}><Status /></div>
    <div style={{ width: 320, height: "calc(100vh - 60px)", overflow: "auto" }}>
      <ThemesPanel />
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
