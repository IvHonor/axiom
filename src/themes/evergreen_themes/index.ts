import "@fontsource-variable/dm-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Trees } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Softly rounded panels and calm, sentence-case labels.
const appearance = {
  fonts: {
    ui: '"DM Sans Variable", "Segoe UI", sans-serif',
    label: '"DM Sans Variable", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 10, brackets: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0.1, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "evergreen-dark",
    label: "Evergreen Dark",
    type: "dark",
    colors: {
      background: "#14231D",
      surface: "#101C17",
      panel: "#1C2D24",
      hover: "#293F32",
      border: "#354B3C",
      borderStrong: "#53705B",
      text: "#EEF5E9",
      textDim: "#BACCB6",
      textFaint: "#9CAF9A",
      accent: "#9BC59D",
      onAccent: "#14231D",
      danger: "#F29E9E",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "evergreen-light",
    label: "Evergreen Light",
    type: "light",
    colors: {
      background: "#F1F5EC",
      surface: "#E6ECDD",
      panel: "#FFFFFF",
      hover: "#DDE7D5",
      border: "#C5D1BE",
      borderStrong: "#8A9F83",
      text: "#23382A",
      textDim: "#4A604C",
      textFaint: "#566D57",
      accent: "#356344",
      onAccent: "#FFFFFF",
      danger: "#A62E3E",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const evergreenThemes: ExtensionManifest = {
  id: "evergreen_themes",
  name: "Evergreen",
  description: "Deep forest greens, sage highlights and soft cream.",
  about: [
    "Deep forest greens, sage highlights and soft cream.",
    "Softly rounded panels and calm, sentence-case labels.",
  ],
  features: [
    "Evergreen Dark and Evergreen Light",
    "DM Sans interface and IBM Plex Mono details, bundled for offline use",
    "Softly rounded panels and calm, sentence-case labels.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Trees,
  themes,
};
