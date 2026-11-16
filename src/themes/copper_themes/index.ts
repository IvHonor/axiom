import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Flame } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Workshop-style frames, mono labels and a top-bar clock.
const appearance = {
  fonts: {
    ui: '"IBM Plex Sans", "Segoe UI", sans-serif',
    label: '"IBM Plex Mono", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 2, brackets: false, buttons: "outline", clock: true },
  labels: { uppercase: true, tracking: 0.35, joiner: " ", separator: "/" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "copper-dark",
    label: "Copper Dark",
    type: "dark",
    colors: {
      background: "#26201D",
      surface: "#1E1916",
      panel: "#302823",
      hover: "#40342C",
      border: "#534337",
      borderStrong: "#80654F",
      text: "#F6EEE7",
      textDim: "#D4BFAE",
      textFaint: "#BCA795",
      accent: "#E4AB85",
      onAccent: "#26201D",
      danger: "#FFA2A0",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "copper-light",
    label: "Copper Light",
    type: "light",
    colors: {
      background: "#FAF2E9",
      surface: "#EFE3D5",
      panel: "#FFFCF8",
      hover: "#EBDCCB",
      border: "#D6C1AB",
      borderStrong: "#AC8B70",
      text: "#3E2D24",
      textDim: "#6B5343",
      textFaint: "#785E4C",
      accent: "#96502E",
      onAccent: "#FFFFFF",
      danger: "#AA2F3D",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const copperThemes: ExtensionManifest = {
  id: "copper_themes",
  name: "Copper",
  description: "Warm charcoal and glowing copper, with parchment-white light surfaces.",
  about: [
    "Warm charcoal and glowing copper, with parchment-white light surfaces.",
    "Workshop-style frames, mono labels and a top-bar clock.",
  ],
  features: [
    "Copper Dark and Copper Light",
    "IBM Plex Sans interface and IBM Plex Mono labels, bundled for offline use",
    "Workshop-style frames, mono labels and a top-bar clock.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Flame,
  themes,
};
