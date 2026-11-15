// The Hub's commands (src-tauri/src/playground.rs, hub_*) and its fixed
// emotes and phrases, mirroring crates/protocol/src/hub.rs: the server only
// accepts these ids, so nobody can type anything that needs moderating.
import { invoke } from "@tauri-apps/api/core";
import type { Player } from "../api";

export type RoomId = "plaza" | "library" | "lab" | "terrace" | "arcade";
export type ActKind = "emote" | "phrase";

export interface Shown {
  kind: ActKind;
  id: string;
  /** How long ago, in ms. */
  age: number;
  to: string | null;
}

export interface HubPerson {
  player: Player;
  x: number;
  y: number;
  shown: Shown | null;
}

export interface HubEvent {
  id: number;
  from: Player;
  kind: ActKind;
  item: string;
}

export interface RoomCount {
  id: RoomId;
  count: number;
}

export interface HubState {
  room: RoomId;
  people: HubPerson[];
  rooms: RoomCount[];
  online: number;
  events: HubEvent[];
}

export interface HubPeek {
  online: number;
  rooms: RoomCount[];
  plaza: HubPerson[];
}

export const enterHub = (room: RoomId, x: number, y: number) => invoke<HubState>("hub_enter", { room, x, y });
export const syncHub = (room: RoomId, x: number, y: number) => invoke<HubState>("hub_sync", { room, x, y });
export const actHub = (kind: ActKind, id: string, to: string | null = null) => invoke<void>("hub_act", { kind, id, to });
export const leaveHub = () => invoke<void>("hub_leave");
export const peekHub = () => invoke<HubPeek>("hub_peek");

export const EMOTES: { id: string; emoji: string; label: string }[] = [
  { id: "wave", emoji: "👋", label: "Wave" },
  { id: "dance", emoji: "🕺", label: "Dance" },
  { id: "highfive", emoji: "🙌", label: "High five" },
  { id: "heart", emoji: "💖", label: "Heart" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  { id: "clap", emoji: "👏", label: "Clap" },
  { id: "sparkle", emoji: "✨", label: "Sparkle" },
  { id: "think", emoji: "🤔", label: "Think" },
];

export const PHRASES: { id: string; text: string }[] = [
  { id: "hi", text: "Hi!" },
  { id: "hello", text: "Hello there!" },
  { id: "streak", text: "Nice streak!" },
  { id: "friends", text: "Want to be friends?" },
  { id: "luck", text: "Good luck this week!" },
  { id: "gg", text: "Well played!" },
  { id: "got_this", text: "You've got this!" },
  { id: "reading", text: "What are you reading?" },
  { id: "focus", text: "Focus mode: on." },
  { id: "thanks", text: "Thanks!" },
  { id: "wow", text: "Wow!" },
  { id: "bye", text: "See you later!" },
];

export const emoteOf = (id: string) => EMOTES.find((e) => e.id === id);
export const phraseOf = (id: string) => PHRASES.find((p) => p.id === id)?.text ?? "";

/** How long a shown emote or phrase stays up. */
export const SHOW_MS = 4500;
