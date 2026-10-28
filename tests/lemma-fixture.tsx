import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
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

mockWindows("main");
mockIPC((command) => {
  if (command === "assistant_chats") return [];
  if (command === "ai_key_status") return { gemini: false, groq: false };
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
        <button className="btn" onClick={() => setWardrobe(true)}>Wardrobe</button>
        <button className="btn" onClick={() => setChat(!chat)}>Toggle chat</button>
        <button className="btn" onClick={() => setMounted(!mounted)}>Toggle companion</button>
        {(["idle", "listening", "thinking", "looking", "preparing", "happy", "concerned"] as const).map((mood) => <button className="btn" key={mood} onClick={() => setLemma({ activity: ["happy", "concerned"].includes(mood) ? "idle" : mood as Activity, feeling: ["happy", "concerned"].includes(mood) ? mood as Feeling : null, area: mood === "looking" || mood === "preparing" ? "reading" : null, level: mood === "listening" ? 0.8 : 0 })}>{mood}</button>)}
      </nav>
      {chat ? <div style={{ minHeight: 0, flex: 1 }}><AssistantView areas={[]} name="Alex" /></div> : mounted && <Face mood={moodOf(state)} size={300} level={state.level} tool={toolOf(state)} interactive />}
      {mounted && !chat && <Companion onOpen={() => setChat(true)} />}
    </div>
    {wardrobe && <Customise onClose={() => setWardrobe(false)} />}
  </ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
