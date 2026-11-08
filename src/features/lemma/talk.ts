// Double-clicking Lemma talks to him: from his face anywhere in the app,
// the chat's microphone starts (opening the Lemma tab first, if need be).
// Tapping him instead, as if to find out how, gets a hint in his own words.
import { useEffect, useRef } from "react";
import type { Personality } from "./persona";

const EVENT = "lemma-talk";
/** Asked before the chat was there to hear it: it starts listening as it opens. */
let waiting = false;

/** Asks the chat to start listening. */
export function askToTalk() {
  waiting = true;
  markTalked();
  window.dispatchEvent(new Event(EVENT));
}

/** The chat's side: `talk` when asked (now, or as it opens after being asked). */
export function useTalkRequests(talk: () => void) {
  const latest = useRef(talk);
  latest.current = talk;
  useEffect(() => {
    const heard = () => {
      waiting = false;
      latest.current();
    };
    if (waiting) heard();
    window.addEventListener(EVENT, heard);
    return () => window.removeEventListener(EVENT, heard);
  }, []);
}

const TALKED_KEY = "axiom.lemma.talked";
/** Whether they've ever double-clicked him to talk (so they know how). */
export function hasTalked(): boolean {
  try {
    return localStorage.getItem(TALKED_KEY) === "1";
  } catch {
    return false;
  }
}
export function markTalked() {
  try {
    localStorage.setItem(TALKED_KEY, "1");
  } catch {
    // Without storage he may give the hint again; no harm.
  }
}

/** Tapped this many times within `TAP_WINDOW_MS`, he gives the hint (once if they've never talked to him). */
export const HINT_TAPS = 2;
export const TAP_WINDOW_MS = 10_000;

const HINTS: Record<Personality, string[]> = {
  standard: ["Double-click me to talk.", "Psst: double-click me and I'll listen."],
  cheerful: ["Double-click me and let's chat! 🎤", "Ooh, double-click me to talk!"],
  calm: ["Double-click whenever you'd like to talk.", "If you'd like to talk, just double-click me."],
  direct: ["Double-click to talk.", "Talk: double-click."],
  witty: ["Poking won't do it. Double-click and I'm all ears.", "That tickles. Double-click if you want to talk."],
  coach: ["Double-click to talk. Let's get after it!", "Want to talk? Double-click me, champ."],
};

/** How to talk to him, said his way. */
export function tapHint(personality: Personality): string {
  const ways = HINTS[personality] ?? HINTS.standard;
  return ways[Math.floor(Math.random() * ways.length)];
}
