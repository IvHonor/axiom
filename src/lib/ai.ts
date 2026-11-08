// The assistant, wrapping src-tauri/src/ai/commands.rs. Conversations
// mirror `axiom_protocol::ai` (crates/protocol/src/ai.rs).
import { invoke } from "@tauri-apps/api/core";

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
  /** `cached`: of `tokens`, how many the AI had kept from before (cheaper). */
  | { kind: "assistant"; id: string; text: string; provider: string | null; tokens: number | null; cached?: number }
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
  /** "waiting": the AI is busy for a moment and will be asked again. */
  state: "thinking" | "waiting" | "looking" | "preparing" | "done";
  area: string | null;
  /** Which of the turn's AI calls it's on, from 0. */
  step: number;
  /** What this step's answer has written so far, while it's written. */
  text: string | null;
  /** While waiting: seconds until the AI is asked again. */
  wait: number | null;
}

export const chats = () => invoke<ChatSummary[]>("assistant_chats");
/** Wakes Axiom's server, which sleeps when idle and takes about a minute to start. */
export const wakeServer = () => invoke<void>("assistant_wake");
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

/** What came of something said to Lemma on the desktop. Mirrors `quick::QuickReply`. */
export interface QuickReply {
  /** For the speech bubble. */
  said: string | null;
  /** What was done, e.g. `Start a timer on "Essay"`. */
  did: string | null;
  /** It needs a chat: carry on in Axiom. */
  openChat: boolean;
  /** Puts back what was done (`quickUndo`); empty when nothing was. */
  undo: string[];
  /** A reminder to give later: what, and when (ms since 1970). */
  reminder: { text: string; at: number; onReturn: boolean } | null;
}

/** Something said to Lemma on the desktop: small things are done straight away, and nothing is kept. */
export const quick = (text: string, areas: string[], name: string | null, persona: Persona) =>
  invoke<QuickReply>("assistant_quick", { text, areas, name, persona });
/**
 * Something done on the desktop by hand, with no AI: dropped on Lemma, the
 * evening check-in, logging a timer. Straight away, with an Undo. `tool` is
 * one of `quick::ACTS`, `args` as Lemma's own tool takes them.
 */
export const act = (tool: string, args: Record<string, unknown>) => invoke<QuickReply>("assistant_act", { tool, args });
/** Undo, from the speech bubble: puts back what something said on the desktop did. */
export const quickUndo = (undo: string[]) => invoke<void>("assistant_quick_undo", { undo });
