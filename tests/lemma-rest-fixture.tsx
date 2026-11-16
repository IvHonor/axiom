import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { Face, moodOf } from "../src/features/lemma/Face";
import { setLemma, useLemma } from "../src/features/lemma/state";
import { setCompanionPrefs } from "../src/features/lemma/preferences";
import { toolOf } from "../src/features/lemma/parts";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

mockWindows("main");
mockIPC(command => command === "account_status" ? { state: "signed_out" } : undefined, { shouldMockEvents: true });

function Fixture() {
  const state = useLemma();
  const [timer, setTimer] = useState(false);
  return <ThemeProvider installed={EXTENSIONS}>
    <div style={{ padding: 32 }}>
      <div className="row">
        <button className="btn" onClick={() => setLemma({ focused: true })}>Focus</button>
        <button className="btn" onClick={() => setLemma({ activity: "thinking", area: "reading" })}>Thinking</button>
        <button className="btn" onClick={() => setLemma({ activity: "idle", area: null, focused: false })}>Idle</button>
        <button className="btn" onClick={() => setTimer(value => !value)}>Toggle timer</button>
        <button className="btn" onClick={() => setCompanionPrefs({ movement: 0 })}>Still</button>
        <button className="btn" onClick={() => setCompanionPrefs({ movement: 1 })}>Move</button>
        <input aria-label="Message" placeholder="Type a message" />
      </div>
      <div style={{ display: "flex", gap: 32, marginTop: 48 }}>
        {(["desktop", "overview", "chat"] as const).map(context => <section key={context} data-context={context}>
          <h2>{context}</h2>
          <Face mood={moodOf(state)} size={context === "desktop" ? 80 : 240}
            idleContext={context} tool={toolOf(state)} display={timer ? { text: "12:30" } : null} />
        </section>)}
      </div>
    </div>
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
