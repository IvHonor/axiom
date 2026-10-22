import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { MoonStar } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Palette adapted for Axiom's UI roles; see README.md and LICENSE.
const appearance = {
  fonts: { ui: '"Space Grotesk Variable", "Segoe UI", sans-serif', label: '"Space Grotesk Variable", "Segoe UI", sans-serif', mono: '"JetBrains Mono Variable", Consolas, monospace', size: 13 },
  style: { radius: 5, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "tokyo-night-night",
    label: "Tokyo Night",
    type: "dark",
    colors: {
      background: "#1a1b26",
      surface: "#16161e",
      panel: "#24283b",
      hover: "#292e42",
      border: "#343b58",
      borderStrong: "#565f89",
      text: "#c0caf5",
      textDim: "#a9b1d6",
      textFaint: "#9aa5ce",
      accent: "#7aa2f7",
      onAccent: "#16161e",
      danger: "#f7768e",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "tokyo-night-storm",
    label: "Tokyo Night Storm",
    type: "dark",
    colors: {
      background: "#24283b",
      surface: "#1f2335",
      panel: "#292e42",
      hover: "#343b58",
      border: "#414868",
      borderStrong: "#565f89",
      text: "#c0caf5",
      textDim: "#a9b1d6",
      textFaint: "#9aa5ce",
      accent: "#bb9af7",
      onAccent: "#1a1b26",
      danger: "#f7768e",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "tokyo-night-day",
    label: "Tokyo Night Day",
    type: "light",
    colors: {
      background: "#e1e2e7",
      surface: "#d5d6db",
      panel: "#eceef4",
      hover: "#cbd0df",
      border: "#b4bbce",
      borderStrong: "#8990a8",
      text: "#343b58",
      textDim: "#4c5577",
      textFaint: "#566185",
      accent: "#34548a",
      onAccent: "#ffffff",
      danger: "#a31545",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const tokyoNightThemes: ExtensionManifest = {
  id: "tokyo_night_themes",
  name: "Tokyo Night",
  description: "Midnight blues, electric violet and crisp technical typography.",
  about: [
    "Midnight blues, electric violet and crisp technical typography. Adapted for Axiom's planner, project boards and overview tiles.",
    "Palette by Enkia and Tokyo Night contributors. This is an independent Axiom adaptation, with surface and text tones adjusted for interface readability. Source: https://github.com/tokyo-night/tokyo-night-vscode-theme",
  ],
  features: [
    "3 variants: Night, Storm, Day",
    "Space Grotesk and JetBrains Mono fonts, bundled for offline use",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: MoonStar,
  themes,
};

