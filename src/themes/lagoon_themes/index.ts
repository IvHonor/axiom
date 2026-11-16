import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import { Leaf } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Generously rounded panels, smooth type and quiet sentence-case labels.
const appearance = {
  fonts: {
    ui: '"Manrope Variable", "Segoe UI", sans-serif',
    label: '"Manrope Variable", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", Consolas, monospace',
    size: 13,
  },
  style: { radius: 18, brackets: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "lagoon-dark",
    label: "Lagoon Dark",
    type: "dark",
    colors: {
      background: "#122725",
      surface: "#0E1E1D",
      panel: "#1A3430",
      hover: "#26463E",
      border: "#36594E",
      borderStrong: "#568574",
      text: "#EBFAF1",
      textDim: "#B5D2C4",
      textFaint: "#99BBAB",
      accent: "#8ADBC1",
      onAccent: "#122725",
      danger: "#FFADAD",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "lagoon-light",
    label: "Lagoon Light",
    type: "light",
    colors: {
      background: "#EEF8F1",
      surface: "#E0EFE4",
      panel: "#FFFFFF",
      hover: "#D4E8DB",
      border: "#B4D0BF",
      borderStrong: "#7BA78B",
      text: "#203E31",
      textDim: "#426650",
      textFaint: "#4D715B",
      accent: "#267259",
      onAccent: "#FFFFFF",
      danger: "#A72F47",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const lagoonThemes: ExtensionManifest = {
  id: "lagoon_themes",
  name: "Lagoon",
  description: "Petrol green and fresh mint, with a pale botanical light variant.",
  about: [
    "Petrol green and fresh mint, with a pale botanical light variant.",
    "Generously rounded panels, smooth type and quiet sentence-case labels.",
  ],
  features: [
    "Lagoon Dark and Lagoon Light",
    "Manrope interface and JetBrains Mono details, bundled for offline use",
    "Generously rounded panels, smooth type and quiet sentence-case labels.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Leaf,
  themes,
};
