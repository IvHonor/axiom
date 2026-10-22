import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import { Cat } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Palette adapted for Axiom's UI roles; see README.md and LICENSE.
const appearance = {
  fonts: { ui: '"Manrope Variable", "Segoe UI", sans-serif', label: '"Manrope Variable", "Segoe UI", sans-serif', mono: '"JetBrains Mono Variable", Consolas, monospace', size: 13 },
  style: { radius: 10, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    type: "light",
    colors: {
      background: "#eff1f5",
      surface: "#e6e9ef",
      panel: "#ffffff",
      hover: "#ccd0da",
      border: "#bcc0cc",
      borderStrong: "#9ca0b0",
      text: "#4c4f69",
      textDim: "#53566d",
      textFaint: "#6c6f85",
      accent: "#8839ef",
      onAccent: "#ffffff",
      danger: "#d20f39",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    type: "dark",
    colors: {
      background: "#303446",
      surface: "#292c3c",
      panel: "#414559",
      hover: "#51576d",
      border: "#51576d",
      borderStrong: "#737994",
      text: "#c6d0f5",
      textDim: "#c6d0f5",
      textFaint: "#a5adce",
      accent: "#ca9ee6",
      onAccent: "#232634",
      danger: "#e78284",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "catppuccin-macchiato",
    label: "Catppuccin Macchiato",
    type: "dark",
    colors: {
      background: "#24273a",
      surface: "#1e2030",
      panel: "#363a4f",
      hover: "#494d64",
      border: "#494d64",
      borderStrong: "#6e738d",
      text: "#cad3f5",
      textDim: "#b8c0e0",
      textFaint: "#a5adcb",
      accent: "#c6a0f6",
      onAccent: "#181926",
      danger: "#ed8796",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    type: "dark",
    colors: {
      background: "#1e1e2e",
      surface: "#181825",
      panel: "#313244",
      hover: "#45475a",
      border: "#45475a",
      borderStrong: "#6c7086",
      text: "#cdd6f4",
      textDim: "#bac2de",
      textFaint: "#a6adc8",
      accent: "#cba6f7",
      onAccent: "#11111b",
      danger: "#f38ba8",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const catppuccinThemes: ExtensionManifest = {
  id: "catppuccin_themes",
  name: "Catppuccin",
  description: "Four pastel flavours, from bright Latte to deep Mocha.",
  about: [
    "Four pastel flavours, from bright Latte to deep Mocha. Adapted for Axiom's planner, project boards and overview tiles.",
    "Palette by Catppuccin contributors. This is an independent Axiom adaptation, with surface and text tones adjusted for interface readability. Source: https://github.com/catppuccin/catppuccin",
  ],
  features: [
    "4 variants: Latte, Frappé, Macchiato, Mocha",
    "Manrope and JetBrains Mono fonts, bundled for offline use",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: Cat,
  themes,
};

