// Who Lemma is: the name it goes by and how it talks. Part of the profile
// beside its look, and sent with each message so the AI plays the part.
// "Lemma" with the standard personality is the default.
import { useMemo, useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";
import { useAchievementRewards } from "./achievements/useAchievementRewards";

export type Personality = "standard" | "cheerful" | "calm" | "direct" | "witty" | "coach" | "automaton" | "muse" | "jekyll";

export interface Persona {
  /** What it's called; "" is Lemma. */
  name: string;
  personality: Personality;
}

export const DEFAULT_NAME = "Lemma";
export const MAX_NAME = 24;
export const STANDARD_PERSONA: Persona = { name: "", personality: "standard" };

/** Mirrors the styles in `agent::style`. */
export const PERSONALITIES: { id: Personality; name: string; description: string; reward?: string }[] = [
  { id: "standard", name: "Standard", description: "Warm, encouraging and brief." },
  { id: "cheerful", name: "Cheerful", description: "Upbeat and playful, with a bit of fun." },
  { id: "calm", name: "Calm", description: "Gentle and reassuring, never rushed." },
  { id: "direct", name: "Direct", description: "Straight to the point, no small talk." },
  { id: "witty", name: "Witty", description: "Friendly, with a dry sense of humour." },
  { id: "coach", name: "Coach", description: "Motivating, and keeps you to your goals." },
  { id: "automaton", name: "Automaton", description: "Precise, mechanical and always on schedule.", reward: "automaton" },
  { id: "muse", name: "The Muse", description: "Thoughtful and poetic, with a gentle question.", reward: "muse" },
  { id: "jekyll", name: "Jekyll & Hyde", description: "Impeccably polite, apart from the occasional aside.", reward: "jekyll" },
];

/** A saved personality is kept, but one that takes a reward needs it earned. */
export function personaForRewards(p: Persona, rewards: readonly string[]): Persona {
  const needs = PERSONALITIES.find((item) => item.id === p.personality)?.reward;
  return needs && !rewards.includes(needs) ? { ...p, personality: STANDARD_PERSONA.personality } : p;
}

const KEY = "axiom.lemma.persona";

let persona: Persona = normalisePersona(readSetting(KEY));
const listeners = new Set<() => void>();

onSettingSynced(KEY, (saved) => {
  persona = normalisePersona(saved);
  listeners.forEach((listener) => listener());
});

export function normalisePersona(saved: unknown): Persona {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...STANDARD_PERSONA };
  const value = saved as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name.replace(/\s+/g, " ").slice(0, MAX_NAME) : "",
    personality: PERSONALITIES.find((p) => p.id === value.personality)?.id ?? STANDARD_PERSONA.personality,
  };
}

export function setPersona(change: Partial<Persona>) {
  persona = normalisePersona({ ...persona, ...change });
  saveSetting(KEY, persona);
  listeners.forEach((listener) => listener());
}

export function usePersona(): Persona {
  const saved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => persona,
  );
  const rewards = useAchievementRewards(false);
  return useMemo(() => personaForRewards(saved, rewards), [saved, rewards]);
}

/** The name it goes by: the chosen one, or Lemma. */
export const nameOf = (p: Persona) => p.name.trim() || DEFAULT_NAME;

export const useAssistantName = () => nameOf(usePersona());

/** An area's name as the person sees it: Lemma's area goes by the name they chose. */
export function useAreaName(): (ext: { id: string; name: string }) => string {
  const name = useAssistantName();
  return (ext) => (ext.id === "lemma" ? name : ext.name);
}
