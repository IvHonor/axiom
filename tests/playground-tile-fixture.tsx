// The Playground's overview tile at many real grid sizes at once, each in the
// real tile and panel, against the pretend server (playground-mocks.ts).
// ?sizes=2x2,6x3 picks the sizes; ?view=race forces a layout on all of them.
import { createRoot } from "react-dom/client";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { Panel } from "../src/shell/ui/Panel";
import { PlaygroundSummary } from "../src/features/playground/PlaygroundSummary";
import { PlaygroundSummaryTitle } from "../src/features/playground/overview/PlaygroundOverviewMenu";
import { query } from "./playground-mocks";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/lemma/lemma.css";
import "../src/features/playground/playground.css";

const sizes = (query.get("sizes") ?? "2x1,3x2,3x3,4x3,4x5,6x2,6x3,6x4,8x3,12x2,12x7")
  .split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { w, h }; });
// ?view= is applied in the page itself (playground-tile-preview.html), before
// any module reads the saved layouts.

createRoot(document.getElementById("root")!).render(
  <ThemeProvider installed={EXTENSIONS}>
    <div style={{ padding: 16, height: "100vh", overflow: "auto", background: "var(--bg)", color: "var(--text)" }}>
      {sizes.map((size) => (
        <div key={`${size.w}x${size.h}`} data-size={`${size.w}x${size.h}`} style={{ marginBottom: 16 }}>
          <TileGrid>
            <ResizableTile size={size} onResize={() => {}} label={`Playground ${size.w}x${size.h}`}>
              <Panel className="tile tile-fitted" title={<PlaygroundSummaryTitle onOpen={() => {}} />}>
                <PlaygroundSummary onOpen={() => {}} />
              </Panel>
            </ResizableTile>
          </TileGrid>
        </div>
      ))}
    </div>
  </ThemeProvider>,
);
