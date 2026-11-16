import "@fontsource/ubuntu/400.css";
import "@fontsource/ubuntu/500.css";
import "@fontsource/ubuntu-mono/400.css";
import "@fontsource/ubuntu-mono/700.css";
import { Sun } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Field-notebook typography, a sand-tinted dot grid and a top-bar clock.
const appearance = {
  fonts: {
    ui: '"Ubuntu", "Segoe UI", sans-serif',
    label: '"Ubuntu Mono", "Segoe UI", sans-serif',
    mono: '"Ubuntu Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 3, brackets: false, buttons: "outline", clock: true },
  labels: { uppercase: false, tracking: 0.15, joiner: " ", separator: "/" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "desert-dark",
    label: "Desert Dark",
    type: "dark",
    colors: {
      background: "#28231C",
      surface: "#201C16",
      panel: "#342D23",
      hover: "#453B2D",
      border: "#584A36",
      borderStrong: "#847054",
      text: "#F8F0DF",
      textDim: "#D5C4A6",
      textFaint: "#C0AD8C",
      accent: "#DCC18B",
      onAccent: "#28231C",
      danger: "#F6A79A",
      pattern: "rgba(220, 193, 139, 0.10)",
    },
    ...appearance,
  },
  {
    id: "desert-light",
    label: "Desert Light",
    type: "light",
    colors: {
      background: "#F8F1E3",
      surface: "#EEE3CF",
      panel: "#FFFCF6",
      hover: "#E9DCC2",
      border: "#D3BF9A",
      borderStrong: "#A78C5F",
      text: "#3D3324",
      textDim: "#68583E",
      textFaint: "#756248",
      accent: "#826323",
      onAccent: "#FFFFFF",
      danger: "#A43733",
      pattern: "rgba(130, 99, 35, 0.12)",
    },
    ...appearance,
  },
];

export const desertThemes: ExtensionManifest = {
  id: "desert_themes",
  name: "Desert",
  description: "Smoky browns, sunlit sand and ochre accents.",
  about: [
    "Smoky browns, sunlit sand and ochre accents.",
    "Field-notebook typography, a sand-tinted dot grid and a top-bar clock.",
  ],
  features: [
    "Desert Dark and Desert Light",
    "Ubuntu interface and Ubuntu Mono labels, bundled for offline use",
    "Field-notebook typography, a sand-tinted dot grid and a top-bar clock.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Sun,
  themes,
};
