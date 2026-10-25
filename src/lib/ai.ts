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
