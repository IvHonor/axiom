//! The assistant commands React calls, wrapped by `src/lib/ai.ts`.

use axiom_protocol::ai::ChatRequest;
use tauri::State;

use super::{Assistant, AssistantReply, KeyStatus, Provider};
use crate::account::Account;
use crate::error::Result;

#[tauri::command]
pub fn ai_key_status(assistant: State<'_, Assistant>) -> KeyStatus {
    assistant.key_status()
}

/// Saves one of the person's own AI keys, or forgets it (`key` null).
#[tauri::command]
pub fn ai_set_key(assistant: State<'_, Assistant>, provider: Provider, key: Option<String>) -> Result<KeyStatus> {
    assistant.set_key(provider, key.as_deref())
}

#[tauri::command]
pub async fn ai_chat(assistant: State<'_, Assistant>, account: State<'_, Account>, request: ChatRequest) -> Result<AssistantReply> {
    assistant.chat(&account, &request).await
}
