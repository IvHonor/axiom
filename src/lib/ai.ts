// The assistant, wrapping src-tauri/src/ai/commands.rs. Conversations
// mirror `axiom_protocol::ai` (crates/protocol/src/ai.rs).
import { invoke } from "@tauri-apps/api/core";

export type Provider = "gemini" | "groq";

/** Which of the person's own keys are saved (never the keys themselves). */
export interface KeyStatus {
  gemini: boolean;
  groq: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  /** Gemini's, passed back unchanged. */
  signature?: string;
}

export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; call_id: string; name: string; result: unknown };

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: unknown;
}

export interface ChatRequest {
  system: string;
  messages: Message[];
  tools: Tool[];
}

export interface AssistantReply {
  text: string | null;
  tool_calls: ToolCall[];
  /** Which AI answered, e.g. "Gemini". */
  provider: string;
  /** On the person's own key, rather than Axiom's. */
  ownKey: boolean;
}

export const PROVIDERS: { id: Provider; name: string; keyUrl: string }[] = [
  { id: "gemini", name: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "groq", name: "Groq", keyUrl: "https://console.groq.com/keys" },
];

export const keyStatus = () => invoke<KeyStatus>("ai_key_status");
/** Saves one of the person's own keys, or forgets it (`key` null). */
export const setKey = (provider: Provider, key: string | null) => invoke<KeyStatus>("ai_set_key", { provider, key });
export const chat = (request: ChatRequest) => invoke<AssistantReply>("ai_chat", { request });

// ---------- Chats with Lemma ----------

/** One line of a change's preview: new (after), changed (before and after) or going (before). */
export interface PreviewItem {
  label: string;
  before?: string;
  after?: string;
}

export interface Preview {
  title: string;
  items: PreviewItem[];
}

export type ProposalStatus = "pending" | "confirmed" | "discarded" | "failed" | "undone";

/** Mirrors `agent::Entry`. */
export type Entry =
  | { kind: "user"; id: string; text: string }
  /** `tokens`: what this answer's AI calls used, when the AI said. */
  | { kind: "assistant"; id: string; text: string; provider: string | null; tokens: number | null }
  | { kind: "looked"; id: string; area: string }
  /**
   * `undoable`: confirmed (or failed part-way), and what it did can still be undone on this computer.
   * `elsewhere`: confirmed lately on another computer, which is where its Undo is.
   */
  | { kind: "proposal"; id: string; area: string; preview: Preview; status: ProposalStatus; outcome: string | null; undoable: boolean; elsewhere: boolean }
  /** Lemma prepared a change again that's still waiting on the card `proposal`. */
  | { kind: "repeat"; id: string; proposal: string };

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatView {
  id: string;
  title: string;
  entries: Entry[];
}

/** What Lemma is doing right now (the `assistant-progress` event). */
export interface Progress {
  chatId: string;
  state: "thinking" | "looking" | "preparing" | "done";
  area: string | null;
  /** Which of the turn's AI calls it's on, from 0. */
  step: number;
  /** What this step's answer has written so far, while it's written. */
  text: string | null;
}

export const chats = () => invoke<ChatSummary[]>("assistant_chats");
export const getChat = (id: string) => invoke<ChatView>("assistant_chat", { id });
/** Who the assistant is (see `features/lemma/persona.ts`). */
export interface Persona {
  name: string;
  personality: string;
}

/** Sends `text` (null tries again after an error) to a chat (null starts one). `turnId` is for `stopTurn`. */
export const send = (turnId: string, chatId: string | null, text: string | null, areas: string[], name: string | null, persona: Persona) =>
  invoke<ChatView>("assistant_send", { turnId, chatId, text, areas, name, persona });
/** Stops a turn under way: `send` then returns the chat as it got. */
export const stopTurn = (turnId: string) => invoke<void>("assistant_stop", { turnId });
export const confirmChange = (id: string) => invoke<ChatView>("assistant_confirm", { id });
export const discardChange = (id: string) => invoke<ChatView>("assistant_discard", { id });
/** Confirms every change still waiting in a chat, in the order they were prepared. */
export const confirmAll = (chatId: string) => invoke<ChatView>("assistant_confirm_all", { chatId });
/** Puts back what a confirmed change did, unless something has changed it since. */
export const undoChange = (id: string) => invoke<ChatView>("assistant_undo", { id });
export const renameChat = (id: string, title: string) => invoke<void>("assistant_rename_chat", { id, title });
export const deleteChat = (id: string) => invoke<void>("assistant_delete_chat", { id });

export interface Transcript {
  /** What was said; empty when nothing was. */
  text: string;
  provider: string;
}

/** What was said in a recording (base64 `audio`), see `voice.ts`. */
export const transcribe = (audio: string, mime: string) => invoke<Transcript>("ai_transcribe", { audio, mime });
