import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import { Waves } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Rounded glass-like frames and light outline buttons.
const appearance = {
  fonts: {
    ui: '"Outfit Variable", "Segoe UI", sans-serif',
    label: '"Outfit Variable", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", Consolas, monospace',
    size: 13,
  },
  style: { radius: 12, brackets: false, buttons: "outline" },
  labels: { uppercase: false, tracking: 0.2, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "ocean-glass-dark",
    label: "Ocean Glass Dark",
    type: "dark",
    colors: {
      background: "#10232C",
      surface: "#0C1C24",
      panel: "#172F39",
      hover: "#213F49",
      border: "#2D505A",
      borderStrong: "#49757E",
      text: "#EAF6F8",
      textDim: "#AECBD2",
      textFaint: "#93B6BF",
      accent: "#69D2CD",
      onAccent: "#10232C",
      danger: "#FFA5AB",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "ocean-glass-light",
    label: "Ocean Glass Light",
    type: "light",
    colors: {
      background: "#EFF8F7",
      surface: "#E0F0EF",
      panel: "#FFFFFF",
      hover: "#D5EAE8",
      border: "#B5D3D2",
      borderStrong: "#7BABA9",
      text: "#183C42",
      textDim: "#3F6468",
      textFaint: "#4C7175",
      accent: "#176F76",
      onAccent: "#FFFFFF",
      danger: "#AB354B",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const oceanGlassThemes: ExtensionManifest = {
  id: "ocean_glass_themes",
  name: "Ocean Glass",
  description: "Deep ocean blues and clear turquoise with crisp, airy surfaces.",
  about: [
    "Deep ocean blues and clear turquoise with crisp, airy surfaces.",
    "Rounded glass-like frames and light outline buttons.",
  ],
  features: [
    "Ocean Glass Dark and Ocean Glass Light",
    "Outfit interface and JetBrains Mono details, bundled for offline use",
    "Rounded glass-like frames and light outline buttons.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Waves,
  themes,
};
