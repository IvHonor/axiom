// Nexus's live commands (src-tauri/src/playground.rs, hub_*) and its fixed
// emotes and phrases, mirroring crates/protocol/src/hub.rs: the server only
// accepts these ids, so nobody can type anything that needs moderating.
// Positions are metres on the city map (see nexus/world.ts).
import { invoke } from "@tauri-apps/api/core";
import type { Player } from "../api";
import type { DistrictId } from "../nexus/world";

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
  z: number;
  shown: Shown | null;
}

export interface HubEvent {
  id: number;
  from: Player;
  kind: ActKind;
  item: string;
}

export interface DistrictCount {
  id: DistrictId;
  count: number;
}

export interface HubState {
  /** Everyone within 200 m, nearest first. */
  people: HubPerson[];
  districts: DistrictCount[];
  online: number;
  events: HubEvent[];
}

export interface HubPeek {
  online: number;
  districts: DistrictCount[];
  /** Some of who's in the Nexus itself. */
  nexus: HubPerson[];
}

/** `inside`: the building you're in (x and z from its middle), or null out in the city. */
export const enterHub = (x: number, z: number, inside: string | null = null) => invoke<HubState>("hub_enter", { x, z, inside });
export const syncHub = (x: number, z: number, inside: string | null = null) => invoke<HubState>("hub_sync", { x, z, inside });
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
