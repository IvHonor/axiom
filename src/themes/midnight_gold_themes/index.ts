import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Star } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Expressive serif text, spaced uppercase labels and fine outline buttons.
const appearance = {
  fonts: {
    ui: '"Fraunces Variable", Georgia, serif',
    label: '"Inter Variable", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 4, brackets: false, buttons: "outline" },
  labels: { uppercase: true, tracking: 0.5, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "midnight-gold-dark",
    label: "Midnight Gold Dark",
    type: "dark",
    colors: {
      background: "#151D2B",
      surface: "#101623",
      panel: "#202B3C",
      hover: "#2E3B50",
      border: "#40506A",
      borderStrong: "#647793",
      text: "#F8F3E7",
      textDim: "#C8C6BB",
      textFaint: "#AEAEA8",
      accent: "#E6C780",
      onAccent: "#151D2B",
      danger: "#FFA7A5",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "midnight-gold-light",
    label: "Midnight Gold Light",
    type: "light",
    colors: {
      background: "#FBF7EC",
      surface: "#F0EAD9",
      panel: "#FFFFFF",
      hover: "#EAE2CB",
      border: "#D5C8A7",
      borderStrong: "#AA9460",
      text: "#302E28",
      textDim: "#625B47",
      textFaint: "#6F664F",
      accent: "#826319",
      onAccent: "#FFFFFF",
      danger: "#AF343B",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const midnightGoldThemes: ExtensionManifest = {
  id: "midnight_gold_themes",
  name: "Midnight Gold",
  description: "Ink navy and champagne gold with warm ivory in light mode.",
  about: [
    "Ink navy and champagne gold with warm ivory in light mode.",
    "Expressive serif text, spaced uppercase labels and fine outline buttons.",
  ],
  features: [
    "Midnight Gold Dark and Midnight Gold Light",
    "Fraunces interface, Inter labels and IBM Plex Mono details, bundled for offline use",
    "Expressive serif text, spaced uppercase labels and fine outline buttons.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Star,
  themes,
};
