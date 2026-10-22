// Real installation and theme providers, isolated from the desktop database.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EXTENSIONS, findExtension } from "../src/extensions";
import { useInstalled } from "../src/shell/useInstalled";
import { ThemeProvider, useTheme } from "../src/shell/theme/ThemeProvider";
import { ExtensionInfoView } from "../src/shell/views/ExtensionInfoView";
import { ThemesPanel } from "../src/shell/ThemesPanel";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

const packages = EXTENSIONS.filter(ext => ["catppuccin_themes", "tokyo_night_themes", "rose_pine_themes", "gruvbox_themes", "nord_themes"].includes(ext.id));
function Status() {
  const { theme, options } = useTheme();
  return <output data-testid="status" data-theme={theme.id} data-options={options.length}>{theme.label}</output>;
}
function Fixture() {
  const { installedIds, install, uninstall } = useInstalled();
  const [selected, select] = useState(packages[0].id);
  const ext = findExtension(selected)!;
  const installed = EXTENSIONS.filter(ext => ext.builtIn || installedIds.includes(ext.id));
  return <ThemeProvider installed={installed}>
    <div style={{ padding: 16 }}><label>Package <select aria-label="Package" value={selected} onChange={e => select(e.target.value)}>{packages.map(ext => <option key={ext.id} value={ext.id}>{ext.name}</option>)}</select></label> <Status /></div>
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", height: "calc(100vh - 60px)", overflow: "auto" }}>
      <ThemesPanel onBrowse={() => {}} />
      <ExtensionInfoView ext={ext} installed={installedIds.includes(ext.id)} onInstall={() => install(ext.id)} onUninstall={() => uninstall(ext.id)} onOpen={() => {}} />
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
