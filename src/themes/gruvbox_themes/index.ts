import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Coffee } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Palette adapted for Axiom's UI roles; see README.md and LICENSE.
const appearance = {
  fonts: { ui: '"IBM Plex Sans", "Segoe UI", sans-serif', label: '"IBM Plex Sans", "Segoe UI", sans-serif', mono: '"IBM Plex Mono", Consolas, monospace', size: 13 },
  style: { radius: 3, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "gruvbox-dark",
    label: "Gruvbox Dark",
    type: "dark",
    colors: {
      background: "#282828",
      surface: "#1d2021",
      panel: "#32302f",
      hover: "#3c3836",
      border: "#504945",
      borderStrong: "#7c6f64",
      text: "#ebdbb2",
      textDim: "#d5c4a1",
      textFaint: "#bdae93",
      accent: "#fabd2f",
      onAccent: "#282828",
      danger: "#fb4934",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "gruvbox-light",
    label: "Gruvbox Light",
    type: "light",
    colors: {
      background: "#fbf1c7",
      surface: "#f2e5bc",
      panel: "#fff8db",
      hover: "#ebdbb2",
      border: "#d5c4a1",
      borderStrong: "#a89984",
      text: "#3c3836",
      textDim: "#665c54",
      textFaint: "#7c6f64",
      accent: "#9d0006",
      onAccent: "#ffffff",
      danger: "#9d0006",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const gruvboxThemes: ExtensionManifest = {
  id: "gruvbox_themes",
  name: "Gruvbox",
  description: "Earthy retro colours, warm parchment and purposeful Plex typography.",
  about: [
    "Earthy retro colours, warm parchment and purposeful Plex typography. Adapted for Axiom's planner, project boards and overview tiles.",
    "Palette by Pavel Pertsev. This is an independent Axiom adaptation, with surface and text tones adjusted for interface readability. Source: https://github.com/morhetz/gruvbox",
  ],
  features: [
    "2 variants: Dark, Light",
    "IBM Plex Sans and IBM Plex Mono fonts, bundled for offline use",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Coffee,
  themes,
};

