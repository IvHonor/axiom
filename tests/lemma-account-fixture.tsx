import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AssistantView } from "../src/shell/views/AssistantView";
import { usePanelRequests, type PanelRequest } from "../src/shell/panelRequests";
import type { ChatView } from "../src/lib/ai";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// Lemma's chat with no account yet, and only the starter areas on. Nothing
// reaches an AI: `assistant_send` answers from here, and records what it was sent.
declare global {
  interface Window {
    calls: { command: string; args: unknown }[];
    panels: PanelRequest[];
    signIn: () => Promise<void>;
  }
}
window.calls = [];
window.panels = [];
let account: unknown = { state: "signed_out" };
window.signIn = () => {
  account = { state: "signed_in", email: "new@example.test", admin: false, createdAt: new Date().toISOString() };
  return emit("account-changed", account);
};

let chat: ChatView | null = null;
mockWindows("main");
mockIPC((command, args) => {
  window.calls.push({ command, args });
  switch (command) {
    case "account_status":
      return account;
    case "assistant_chats":
      return chat ? [{ id: chat.id, title: chat.title, updatedAt: new Date().toISOString() }] : [];
    case "assistant_chat":
      return chat;
    case "assistant_send": {
      const { text } = args as { text: string };
      chat = {
        id: "c",
        title: "Today",
        entries: [
          { kind: "user", id: "u1", text },
          { kind: "assistant", id: "a1", text: "Here's your day.", provider: "Groq", tokens: 800 },
        ],
      };
      return chat;
    }
  }
}, { shouldMockEvents: true });

const areas = EXTENSIONS.filter((ext) => ext.id === "daily_plan" || ext.id === "notes");

function Fixture() {
  usePanelRequests((request) => window.panels.push(request));
  return (
    <div style={{ height: "100vh" }}>
      <AssistantView areas={areas} name={null} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider installed={EXTENSIONS}>
      <Fixture />
    </ThemeProvider>
  </StrictMode>,
);
