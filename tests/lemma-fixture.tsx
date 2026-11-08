import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AssistantView } from "../src/shell/views/AssistantView";
import { Customise } from "../src/features/lemma/Customise";
import { Companion } from "../src/features/lemma/Companion";
import { Face, moodOf } from "../src/features/lemma/Face";
import { setLemma, useLemma, type Activity, type Feeling } from "../src/features/lemma/state";
import { toolOf } from "../src/features/lemma/parts";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// ?fail: the AI can't answer, and the new chat is kept with only the question.
const failing = new URLSearchParams(location.search).has("fail");
let fixtureAccount = new URLSearchParams(location.search).has("admin") ? { state: "signed_in", email: "admin@example.test", admin: true } : { state: "signed_in", email: "member@example.test", admin: false };
let asked = false;

mockWindows("main");
mockIPC((command) => {
  if (command === "account_status") return fixtureAccount;
  if (command === "ai_transcribe") return { text: "A captured sentence", provider: "fixture" };
  if (command === "assistant_chats") return failing && asked ? [{ id: "fixture-chat", title: "Hello", updatedAt: new Date().toISOString() }] : [];
  if (command === "assistant_send" && failing) {
    asked = true;
    throw "The assistant couldn't answer: Groq is busy or has used up its free requests for now.";
  }
  if (command === "assistant_chat" && failing) return { id: "fixture-chat", title: "Hello", entries: [{ id: "q", kind: "user", text: "Hello" }] };
  if (command === "assistant_send") return { id: "fixture-chat", title: "A test conversation", entries: [{ id: "reply", kind: "assistant", text: "I'm here to help.", provider: "fixture", tokens: 0 }] };
  if (command === "assistant_chat") return { id: "fixture-chat", title: "A test conversation", entries: [{ id: "reply", kind: "assistant", text: "I'm here to help.", provider: "fixture", tokens: 0 }] };
}, { shouldMockEvents: true });

function Fixture() {
  const [wardrobe, setWardrobe] = useState(true);
  const [chat, setChat] = useState(false);
  const [mounted, setMounted] = useState(true);
  const state = useLemma();
  return <ThemeProvider installed={EXTENSIONS}>
    <div style={{ padding: 20, height: "100vh", display: "flex", flexDirection: "column", gap: 12 }}>
      <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <output data-testid="behaviour-state" hidden>{JSON.stringify(state)}</output>
        <button className="btn" onClick={() => setWardrobe(true)}>Wardrobe</button>
        <button className="btn" onClick={() => setChat(!chat)}>Toggle chat</button>
        <button className="btn" onClick={() => setMounted(!mounted)}>Toggle companion</button>
        <button className="btn" onClick={() => { fixtureAccount = { state: "signed_in", email: "member@example.test", admin: false }; void emit("account-changed", fixtureAccount); }}>Use member account</button>
        <button className="btn" onClick={() => { fixtureAccount = { state: "signed_in", email: "admin@example.test", admin: true }; void emit("account-changed", fixtureAccount); }}>Use admin account</button>
        <button className="btn" onClick={() => void emit("assistant-progress", { state: "thinking", area: null, text: "Here is my answer", step: 0 })}>Stream answer</button>
        <button className="btn" onClick={() => void emit("assistant-progress", { state: "done", area: null, text: null, step: 0 })}>Finish answer</button>
        {(["idle", "listening", "thinking", "looking", "preparing", "speaking", "happy", "concerned"] as const).map((mood) => <button className="btn" key={mood} onClick={() => setLemma({ activity: ["happy", "concerned"].includes(mood) ? "idle" : mood as Activity, feeling: ["happy", "concerned"].includes(mood) ? mood as Feeling : null, area: mood === "looking" || mood === "preparing" ? "reading" : null, level: mood === "listening" ? 0.8 : 0 })}>{mood}</button>)}
      </nav>
      {chat ? <div style={{ minHeight: 0, flex: 1 }}><AssistantView areas={[]} name="Alex" /></div> : mounted && <Face mood={moodOf(state)} size={300} level={state.level} tool={toolOf(state)} interactive />}
      {!chat && <div data-testid="small-face"><Face mood={moodOf(state)} size={48} alive={false} /></div>}
      {mounted && !chat && <Companion onOpen={() => setChat(true)} />}
    </div>
    {wardrobe && <Customise onClose={() => setWardrobe(false)} />}
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
