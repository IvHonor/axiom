import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource-variable/jetbrains-mono";
import { Zap } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Terminal labels, sharp brackets, violet dot grid and a clock.
const appearance = {
  fonts: {
    ui: '"Chakra Petch", "Segoe UI", sans-serif',
    label: '"JetBrains Mono Variable", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", Consolas, monospace',
    size: 13,
  },
  style: { radius: 0, brackets: true, buttons: "outline", clock: true },
  labels: { uppercase: true, tracking: 0.6, joiner: "_", separator: "//" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "electric-iris-dark",
    label: "Electric Iris Dark",
    type: "dark",
    colors: {
      background: "#191625",
      surface: "#12101D",
      panel: "#242036",
      hover: "#342E49",
      border: "#473E64",
      borderStrong: "#716295",
      text: "#F3EEFF",
      textDim: "#C5B9E0",
      textFaint: "#AD9FC9",
      accent: "#B6A0FF",
      onAccent: "#191625",
      danger: "#FFA1B9",
      pattern: "rgba(182, 160, 255, 0.12)",
    },
    ...appearance,
  },
  {
    id: "electric-iris-light",
    label: "Electric Iris Light",
    type: "light",
    colors: {
      background: "#F4F1FF",
      surface: "#E9E3FA",
      panel: "#FFFFFF",
      hover: "#E2D9F5",
      border: "#C8B9E6",
      borderStrong: "#9A83C6",
      text: "#30234A",
      textDim: "#5D4B7B",
      textFaint: "#6A578A",
      accent: "#6944CC",
      onAccent: "#FFFFFF",
      danger: "#B02952",
      pattern: "rgba(105, 68, 204, 0.12)",
    },
    ...appearance,
  },
];

export const electricIrisThemes: ExtensionManifest = {
  id: "electric_iris_themes",
  name: "Electric Iris",
  description: "Near-black violet and vivid lavender with sharp, technical typography.",
  about: [
    "Near-black violet and vivid lavender with sharp, technical typography.",
    "Terminal labels, sharp brackets, violet dot grid and a clock.",
  ],
  features: [
    "Electric Iris Dark and Electric Iris Light",
    "Chakra Petch interface and JetBrains Mono labels, bundled for offline use",
    "Terminal labels, sharp brackets, violet dot grid and a clock.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Zap,
  themes,
};
