import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider, useTheme } from "../src/shell/theme/ThemeProvider";
import { useAssistantAreas } from "../src/shell/useAssistantAreas";
import { Face, moodOf } from "../src/features/lemma/Face";
import { setLemma, useLemma } from "../src/features/lemma/state";
import { setPersona } from "../src/features/lemma/persona";
import { setLook } from "../src/features/lemma/look";
import { setCompanionPrefs } from "../src/features/lemma/preferences";
import { useDialogue } from "../src/features/lemma/useDialogue";
import type { TodaySummary } from "../src/features/daily_plan/api";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

let summary = { total: 2, done: 0, focus: [{ id: "t1", title: "Finish the real focus task", doneAt: null }], running: null } as TodaySummary;
let slow = false;
const releases: (() => void)[] = [];
const commands: string[] = [];
let account: object = { state: "signed_out" };
mockWindows("main");
mockIPC(async command => {
  commands.push(command);
  if (command === "account_status") return account;
  if (command === "plan_summary") {
    const result = structuredClone(summary);
    if (slow) await new Promise<void>(resolve => { releases.push(resolve); });
    return result;
  }
}, { shouldMockEvents: true });
Object.assign(window, { dialogueFixture: {
  commands,
  slow: () => { slow = true; },
  release: () => { slow = false; releases.splice(0).forEach(resolve => resolve()); },
  complete: () => { summary = { ...summary, done: 2, focus: [] }; },
  refresh: () => emit("data-changed"),
  switchAccount: () => {
    account = { state: "signed_in", email: "other@example.test", admin: false, createdAt: "2026-01-01T00:00:00Z" };
    summary = { ...summary, total: 0, done: 0, focus: [] };
    return emit("account-changed", account);
  },
  resetDay: () => { summary = { ...summary, total: 2, done: 0, focus: [{ id: "t1", title: "Finish the real focus task", doneAt: null }] } as TodaySummary; },
} });

function Character() {
  const state = useLemma();
  const dialogue = useDialogue("chat");
  return <div style={{ maxWidth: 420, margin: "40px auto", textAlign: "center" }}>
    <Face mood={moodOf(state)} size={240} idleContext="chat" onIdleComplete={dialogue.completed} dialogueRef={dialogue.attach} />
    <p data-testid="remark" data-lemma-dialogue={dialogue.message?.kind} aria-live="polite">{dialogue.message?.text ?? "Ready when you are."}</p>
    <button className="btn" onClick={() => dialogue.completed("stretch")}>Completed stretch</button>
  </div>;
}
function Controls() {
  const { setTheme } = useTheme();
  const { areas, setAllowed } = useAssistantAreas();
  const [input, setInput] = useState("");
  return <>
    <nav className="row" style={{ flexWrap: "wrap" }}>
      <button className="btn" onClick={() => setTheme("shadow-dark")}>Crimson</button>
      <button className="btn" onClick={() => setTheme("ocean-glass-dark")}>Ocean</button>
      <button className="btn" onClick={() => setPersona({ name: "Nova" })}>Rename Nova</button>
      <button className="btn" onClick={() => setPersona({ personality: "witty" })}>Witty</button>
      <button className="btn" onClick={() => setLook({ shape: "prism", accessory: "halo" })}>New outfit</button>
      <button className="btn" onClick={() => setAllowed("daily_plan", true)}>Allow plan</button>
      <button className="btn" onClick={() => setAllowed("journal", true)}>Allow journal</button>
      <button className="btn" onClick={() => setAllowed("journal", false)}>Disable journal</button>
      <button className="btn" onClick={() => areas.forEach(id => setAllowed(id, false))}>Revoke all</button>
      <button className="btn" onClick={() => { summary = { ...summary, done: 2, focus: [] }; void emit("data-changed"); }}>Complete day</button>
      <button className="btn" onClick={() => { summary = { ...summary, done: 2, focus: [] }; }}>Complete while away</button>
      <button className="btn" onClick={() => setLemma({ focused: true })}>Focus</button>
      <button className="btn" onClick={() => setLemma({ activity: "thinking" })}>Thinking</button>
      <button className="btn" onClick={() => setLemma({ focused: false, activity: "idle" })}>Idle</button>
      <button className="btn" onClick={() => setCompanionPrefs({ chatter: false })}>Comments off</button>
      <button className="btn" onClick={() => setCompanionPrefs({ chatter: true })}>Comments on</button>
      <input aria-label="Message" value={input} onChange={event => setInput(event.currentTarget.value)} />
    </nav>
    <Character />
  </>;
}
createRoot(document.getElementById("root")!).render(<ThemeProvider installed={EXTENSIONS}><div style={{ padding: 24 }}><Controls /></div></ThemeProvider>);
