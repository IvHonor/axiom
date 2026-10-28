// Real tab bar and persistence, isolated from the desktop database.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { TopBar } from "../src/shell/TopBar";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { useTabs } from "../src/shell/useTabs";
import { ASSISTANT, viewKey } from "../src/shell/view";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

mockWindows("main");
mockIPC((command) => command === "notifications_list" ? [] : undefined, { shouldMockEvents: true });

function Fixture() {
  const { tabs, active, previewKey, open, pin, close, closeExtension, reorder } = useTabs();
  return <ThemeProvider installed={EXTENSIONS}>
    <div className="app">
      <TopBar tabs={tabs} active={active} previewKey={previewKey} onSelect={open} onPin={pin} onClose={close} onReorder={reorder} />
      <main>
        <output data-testid="active">{viewKey(active)}</output>
        <button onClick={() => open(ASSISTANT)}>Open Lemma</button>
        <button onClick={() => open({ kind: "extension-info", id: "uni" }, { preview: true })}>Preview University</button>
        <button onClick={() => open({ kind: "extension-info", id: "reading" }, { preview: true })}>Preview Reading</button>
        <button onClick={() => closeExtension("reading")}>Disable Reading</button>
        <button onClick={() => close(active)}>Close active</button>
      </main>
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
