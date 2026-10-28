import "./lemma.css";
import { Sparkles } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { LemmaSidebar } from "./LemmaSidebar";
import { LemmaSummary } from "./LemmaSummary";
import { LemmaView } from "./LemmaView";

export const lemma: ExtensionManifest = {
  id: "lemma",
  name: "Lemma",
  description: "Axiom Intelligence: an assistant that plans your day, answers questions about your areas and makes changes once you confirm them.",
  about: [
    "Lemma is Axiom's assistant. Ask it, by typing or talking, to plan your day, add a birthday, log a book or check how your goals are going. It looks at the areas you let it see, and every change it suggests comes as a card you confirm or discard: nothing changes without you.",
    "It runs on free AI (Google Gemini, with Groq as a backup) through Axiom's keys, or your own. Choose which areas it may see in its settings; it only writes in Journal and Notes when you ask, and only ever adds to them. Chats are kept on your computer and synced end-to-end encrypted.",
  ],
  features: [
    "Chat by typing or talking, and hear replies read aloud",
    "Looks at the areas you allow, and answers from your own data",
    "Prepares changes as cards: confirm or discard each one, and undo it after",
    "Plans your day around your calendar and working hours",
    "Your chats, kept and synced end-to-end encrypted",
    "Talks you through your day on the overview, fitted to any tile size",
    "A living 3D companion with geometric bodies, colours, hats and keepsakes",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Sparkles,
  color: "var(--accent)",
  area: { View: LemmaView, Summary: LemmaSummary, Sidebar: LemmaSidebar, fittedSummary: true },
};
