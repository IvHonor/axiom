import "@fontsource-variable/lora";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Sparkles } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Literary serif text, clean sans-serif labels and soft filled buttons.
const appearance = {
  fonts: {
    ui: '"Lora Variable", Georgia, serif',
    label: '"Manrope Variable", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 8, brackets: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0.1, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "velvet-dark",
    label: "Velvet Dark",
    type: "dark",
    colors: {
      background: "#241B2F",
      surface: "#1B1424",
      panel: "#2E233A",
      hover: "#3C2E49",
      border: "#4D3B5D",
      borderStrong: "#745B88",
      text: "#F3EBFA",
      textDim: "#D0BDD9",
      textFaint: "#BCA6C7",
      accent: "#C7A4EE",
      onAccent: "#241B2F",
      danger: "#F8A4B4",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "velvet-light",
    label: "Velvet Light",
    type: "light",
    colors: {
      background: "#F7F1FA",
      surface: "#EDE3F2",
      panel: "#FFFFFF",
      hover: "#E8DBEF",
      border: "#D4BFDF",
      borderStrong: "#AB89BA",
      text: "#352340",
      textDim: "#634D70",
      textFaint: "#71577F",
      accent: "#79509C",
      onAccent: "#FFFFFF",
      danger: "#AB3150",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const velvetThemes: ExtensionManifest = {
  id: "velvet_themes",
  name: "Velvet",
  description: "Rich aubergine and soft lilac, paired with pale porcelain in light mode.",
  about: [
    "Rich aubergine and soft lilac, paired with pale porcelain in light mode.",
    "Literary serif text, clean sans-serif labels and soft filled buttons.",
  ],
  features: [
    "Velvet Dark and Velvet Light",
    "Lora interface, Manrope labels and IBM Plex Mono details, bundled for offline use",
    "Literary serif text, clean sans-serif labels and soft filled buttons.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Sparkles,
  themes,
};
