// The real Playground page, sidebar, tile and friends pop-out against the
// pretend server in playground-mocks.ts. ?phone: the page alone.
import { createRoot } from "react-dom/client";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { PlaygroundView } from "../src/features/playground/PlaygroundView";
import { PlaygroundSidebar } from "../src/features/playground/PlaygroundSidebar";
import { PlaygroundSummary } from "../src/features/playground/PlaygroundSummary";
import { FriendsButton } from "../src/shell/friends/FriendsButton";
import { query } from "./playground-mocks";
import { refresh, sendStats } from "../src/features/playground/store";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/lemma/lemma.css";
import "../src/features/playground/playground.css";

Object.assign(window, { publishPlayground: () => sendStats(true), refreshPlayground: refresh });
createRoot(document.getElementById("root")!).render(
  query.has("sidebar") ? <ThemeProvider installed={EXTENSIONS}><aside style={{ width: "min(320px, 100vw)", height: "100vh", overflow: "auto", background: "var(--surface)", color: "var(--text)" }}><PlaygroundSidebar active onOpen={() => {}} /></aside></ThemeProvider> :
  query.has("phone") ? <ThemeProvider installed={EXTENSIONS}><div style={{ height: "100vh" }}><PlaygroundView /></div></ThemeProvider> :
  <ThemeProvider installed={EXTENSIONS}>
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <aside style={{ borderRight: "1px solid var(--line)", background: "var(--surface)", overflow: "auto" }}>
        <PlaygroundSidebar active onOpen={() => {}} />
        <div style={{ margin: 12, height: 190, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }} data-tile>
          <PlaygroundSummary onOpen={() => {}} />
        </div>
      </aside>
      <main style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}><FriendsButton playgroundOn onOpenPlayground={() => document.body.setAttribute("data-opened", "playground")} /></div>
        <div style={{ flex: 1, minHeight: 0 }}><PlaygroundView /></div>
      </main>
    </div>
  </ThemeProvider>,
);
