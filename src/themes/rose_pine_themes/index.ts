import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Flower2 } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Palette adapted for Axiom's UI roles; see README.md and LICENSE.
const appearance = {
  fonts: { ui: '"Manrope Variable", "Segoe UI", sans-serif', label: '"Manrope Variable", "Segoe UI", sans-serif', mono: '"IBM Plex Mono", Consolas, monospace', size: 13 },
  style: { radius: 9, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "rose-pine-pine",
    label: "Rosé Pine",
    type: "dark",
    colors: {
      background: "#191724",
      surface: "#1f1d2e",
      panel: "#26233a",
      hover: "#403d52",
      border: "#403d52",
      borderStrong: "#6e6a86",
      text: "#e0def4",
      textDim: "#b7b3cc",
      textFaint: "#a6a1bd",
      accent: "#ebbcba",
      onAccent: "#191724",
      danger: "#eb6f92",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "rose-pine-moon",
    label: "Rosé Pine Moon",
    type: "dark",
    colors: {
      background: "#232136",
      surface: "#2a273f",
      panel: "#393552",
      hover: "#44415a",
      border: "#44415a",
      borderStrong: "#6e6a86",
      text: "#e0def4",
      textDim: "#b7b3cc",
      textFaint: "#a6a1bd",
      accent: "#c4a7e7",
      onAccent: "#232136",
      danger: "#eb6f92",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "rose-pine-dawn",
    label: "Rosé Pine Dawn",
    type: "light",
    colors: {
      background: "#faf4ed",
      surface: "#f2e9e1",
      panel: "#fffaf3",
      hover: "#f2e9de",
      border: "#dfdad9",
      borderStrong: "#b5abae",
      text: "#575279",
      textDim: "#625a7d",
      textFaint: "#79718c",
      accent: "#79658f",
      onAccent: "#ffffff",
      danger: "#b4637a",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const rosePineThemes: ExtensionManifest = {
  id: "rose_pine_themes",
  name: "Rosé Pine",
  description: "Muted rose, pine and cream in three quietly expressive variants.",
  about: [
    "Muted rose, pine and cream in three quietly expressive variants. Adapted for Axiom's planner, project boards and overview tiles.",
    "Palette by Rosé Pine contributors. This is an independent Axiom adaptation, with surface and text tones adjusted for interface readability. Source: https://rosepinetheme.com",
  ],
  features: [
    "3 variants: Rosé Pine, Moon, Dawn",
    "Manrope and IBM Plex Mono fonts, bundled for offline use",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Flower2,
  themes,
};

