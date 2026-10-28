// Who Lemma is: the name it goes by and how it talks. Kept on this computer
// beside its look, and sent with each message so the AI plays the part.
// "Lemma" with the standard personality is the default.
import { useSyncExternalStore } from "react";

export type Personality = "standard" | "cheerful" | "calm" | "direct" | "witty" | "coach";

export interface Persona {
  /** What it's called; "" is Lemma. */
  name: string;
  personality: Personality;
}

export const DEFAULT_NAME = "Lemma";
export const MAX_NAME = 24;
export const STANDARD_PERSONA: Persona = { name: "", personality: "standard" };

/** Mirrors the styles in `agent::style`. */
export const PERSONALITIES: { id: Personality; name: string; description: string }[] = [
  { id: "standard", name: "Standard", description: "Warm, encouraging and brief." },
  { id: "cheerful", name: "Cheerful", description: "Upbeat and playful, with a bit of fun." },
  { id: "calm", name: "Calm", description: "Gentle and reassuring, never rushed." },
  { id: "direct", name: "Direct", description: "Straight to the point, no small talk." },
  { id: "witty", name: "Witty", description: "Friendly, with a dry sense of humour." },
  { id: "coach", name: "Coach", description: "Motivating, and keeps you to your goals." },
];

const KEY = "axiom.lemma.persona";

let persona: Persona = load();
const listeners = new Set<() => void>();

function load(): Persona {
  try {
    return normalisePersona(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return STANDARD_PERSONA;
  }
}

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
  try {
    localStorage.setItem(KEY, JSON.stringify(persona));
  } catch {
    // Storage unavailable: the persona lasts for this session only.
  }
  listeners.forEach((listener) => listener());
}

export function usePersona(): Persona {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => persona,
  );
}

/** The name it goes by: the chosen one, or Lemma. */
export const nameOf = (p: Persona) => p.name.trim() || DEFAULT_NAME;

export const useAssistantName = () => nameOf(usePersona());

/** An area's name as the person sees it: Lemma's area goes by the name they chose. */
export function useAreaName(): (ext: { id: string; name: string }) => string {
  const name = useAssistantName();
  return (ext) => (ext.id === "lemma" ? name : ext.name);
}
