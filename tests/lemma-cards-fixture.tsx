import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AssistantView } from "../src/shell/views/AssistantView";
import type { ChatView, Entry, Progress } from "../src/lib/ai";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// A chat with a card in every state, kept in memory: nothing reaches an AI or the desktop database.
const entries: Entry[] = [
  { kind: "user", id: "u1", text: "Add Ada's birthday and a running goal" },
  { kind: "proposal", id: "ada", area: "birthdays", preview: { title: "Add Ada Lovelace's birthday", items: [{ label: "Name", after: "Ada Lovelace" }, { label: "Birthday", after: "10 December" }] }, status: "confirmed", outcome: null, undoable: true, elsewhere: false },
  { kind: "proposal", id: "run", area: "goals", preview: { title: "Add a goal", items: [{ label: "Goal", after: "Run 5k" }, { label: "By", after: "1 March 2027" }] }, status: "confirmed", outcome: null, undoable: false, elsewhere: true },
  { kind: "assistant", id: "a1", text: "Both are done.", provider: "Gemini", tokens: 2100 },
  { kind: "user", id: "u2", text: "Plan tomorrow morning and add Dune to my reading list" },
  { kind: "looked", id: "l1", area: "reading" },
  { kind: "proposal", id: "plan", area: "daily_plan", preview: { title: "Plan Thursday 29 October", items: [{ label: "09:00", after: "Deep work (90 min)" }, { label: "10:45", after: "Gym (60 min)" }] }, status: "pending", outcome: null, undoable: false, elsewhere: false },
  { kind: "proposal", id: "dune", area: "reading", preview: { title: "Add a book", items: [{ label: "Title", after: "Dune" }, { label: "By", after: "Frank Herbert" }, { label: "First published", after: "1965" }, { label: "Pages", after: "412" }, { label: "Shelf", after: "Want to read" }, { label: "Details", after: "From Open Library, with its cover" }] }, status: "pending", outcome: null, undoable: false, elsewhere: false },
  { kind: "assistant", id: "a2", text: "I've prepared **both** for you to check.", provider: "Gemini", tokens: 3150 },
  { kind: "user", id: "u3", text: "Add Dune please" },
  { kind: "repeat", id: "r1", proposal: "dune" },
  { kind: "assistant", id: "a3", text: "Dune is already on the card above, waiting for you.", provider: "Gemini", tokens: 900 },
];
const chat = (): ChatView => ({ id: "c", title: "Plans and books", entries: entries.map((e) => ({ ...e })) });
const set = (id: string, change: Partial<Extract<Entry, { kind: "proposal" }>>) => {
  const i = entries.findIndex((e) => e.id === id);
  entries[i] = { ...(entries[i] as Extract<Entry, { kind: "proposal" }>), ...change };
};

declare global {
  interface Window {
    calls: string[];
    progress: (p: Partial<Progress>) => Promise<void>;
    finishTurn: () => void;
  }
}
window.calls = [];
let finish: (() => void) | null = null;
window.finishTurn = () => finish?.();
window.progress = (p) => emit("assistant-progress", { chatId: "c", state: "thinking", area: null, step: 0, text: null, ...p });

localStorage.setItem("axiom.assistant.chat", JSON.stringify("c"));
mockWindows("main");
mockIPC((command, args) => {
  window.calls.push(command);
  const id = (args as { id?: string } | undefined)?.id ?? "";
  switch (command) {
    case "assistant_chats":
      return [{ id: "c", title: "Plans and books", updatedAt: new Date().toISOString() }];
    case "assistant_chat":
      return chat();
    case "ai_key_status":
      return { gemini: true, groq: false };
    case "assistant_confirm_all":
      entries.forEach((e) => e.kind === "proposal" && e.status === "pending" && set(e.id, { status: "confirmed", undoable: true }));
      return chat();
    case "assistant_confirm":
      set(id, { status: "confirmed", undoable: true });
      return chat();
    case "assistant_undo":
      set(id, { status: "undone", undoable: false });
      return chat();
    case "assistant_send":
      return new Promise((resolve) => {
        finish = () => {
          entries.push({ kind: "user", id: "u4", text: "What's next?" }, { kind: "assistant", id: "a4", text: "Here's your plan for the morning.", provider: "Groq", tokens: 1200 });
          resolve(chat());
        };
      });
  }
}, { shouldMockEvents: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider installed={EXTENSIONS}>
      <div style={{ height: "100vh" }}>
        <AssistantView areas={EXTENSIONS} name="Alex" />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
