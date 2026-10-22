import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Snowflake } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Palette adapted for Axiom's UI roles; see README.md and LICENSE.
const appearance = {
  fonts: { ui: '"Inter Variable", "Segoe UI", sans-serif', label: '"Inter Variable", "Segoe UI", sans-serif', mono: '"IBM Plex Mono", Consolas, monospace', size: 13 },
  style: { radius: 6, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "nord-polar-night",
    label: "Nord Polar Night",
    type: "dark",
    colors: {
      background: "#2e3440",
      surface: "#272d38",
      panel: "#3b4252",
      hover: "#434c5e",
      border: "#4c566a",
      borderStrong: "#67758e",
      text: "#eceff4",
      textDim: "#d8dee9",
      textFaint: "#b6c0d2",
      accent: "#88c0d0",
      onAccent: "#2e3440",
      danger: "#e88f99",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "nord-snow",
    label: "Nord Snow",
    type: "light",
    colors: {
      background: "#eceff4",
      surface: "#e5e9f0",
      panel: "#ffffff",
      hover: "#d8dee9",
      border: "#c3ccda",
      borderStrong: "#8b99af",
      text: "#2e3440",
      textDim: "#434c5e",
      textFaint: "#59677e",
      accent: "#456780",
      onAccent: "#ffffff",
      danger: "#a13f50",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const nordThemes: ExtensionManifest = {
  id: "nord_themes",
  name: "Nord",
  description: "Arctic slate, frost-blue accents and a clear, structured interface.",
  about: [
    "Arctic slate, frost-blue accents and a clear, structured interface. Adapted for Axiom's planner, project boards and overview tiles.",
    "Palette by Arctic Ice Studio and Sven Greb. This is an independent Axiom adaptation, with surface and text tones adjusted for interface readability. Source: https://www.nordtheme.com",
  ],
  features: [
    "2 variants: Polar Night, Snow",
    "Inter and IBM Plex Mono fonts, bundled for offline use",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: Snowflake,
  themes,
};

