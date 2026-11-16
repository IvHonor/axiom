import "@fontsource-variable/nunito-sans";
import "@fontsource/ubuntu-mono/400.css";
import "@fontsource/ubuntu-mono/700.css";
import { Flower2 } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Friendly rounded type, petal-soft corners and filled buttons.
const appearance = {
  fonts: {
    ui: '"Nunito Sans Variable", "Segoe UI", sans-serif',
    label: '"Nunito Sans Variable", "Segoe UI", sans-serif',
    mono: '"Ubuntu Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 14, brackets: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "•" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "sakura-dark",
    label: "Sakura Dark",
    type: "dark",
    colors: {
      background: "#291E28",
      surface: "#20171F",
      panel: "#352833",
      hover: "#463342",
      border: "#5A4052",
      borderStrong: "#865F78",
      text: "#FFF0F6",
      textDim: "#DBBCCD",
      textFaint: "#C5A4B8",
      accent: "#E9A8C0",
      onAccent: "#291E28",
      danger: "#FFBA84",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "sakura-light",
    label: "Sakura Light",
    type: "light",
    colors: {
      background: "#FFF2F5",
      surface: "#F7E4EB",
      panel: "#FFFFFF",
      hover: "#F1DBE3",
      border: "#DFBDCB",
      borderStrong: "#B7879C",
      text: "#442735",
      textDim: "#735162",
      textFaint: "#805D6F",
      accent: "#A64068",
      onAccent: "#FFFFFF",
      danger: "#A34B1F",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const sakuraThemes: ExtensionManifest = {
  id: "sakura_themes",
  name: "Sakura",
  description: "Muted plum, cherry-blossom pink and soft white petals.",
  about: [
    "Muted plum, cherry-blossom pink and soft white petals.",
    "Friendly rounded type, petal-soft corners and filled buttons.",
  ],
  features: [
    "Sakura Dark and Sakura Light",
    "Nunito Sans interface and Ubuntu Mono details, bundled for offline use",
    "Friendly rounded type, petal-soft corners and filled buttons.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Flower2,
  themes,
};
