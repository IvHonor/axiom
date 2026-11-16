import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Pencil } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Square drafting frames, corner brackets, mono labels and a subtle dot grid.
const appearance = {
  fonts: {
    ui: '"Inter Variable", "Segoe UI", sans-serif',
    label: '"IBM Plex Mono", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
    size: 13,
  },
  style: { radius: 0, brackets: true, buttons: "outline" },
  labels: { uppercase: true, tracking: 0.3, joiner: " ", separator: "/" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "graphite-dark",
    label: "Graphite Dark",
    type: "dark",
    colors: {
      background: "#191B1E",
      surface: "#121416",
      panel: "#22262B",
      hover: "#30363E",
      border: "#414952",
      borderStrong: "#68737F",
      text: "#F4F6F8",
      textDim: "#BAC3CE",
      textFaint: "#A1ACBA",
      accent: "#C3CBD5",
      onAccent: "#191B1E",
      danger: "#FFA6AD",
      pattern: "rgba(195, 203, 213, 0.08)",
    },
    ...appearance,
  },
  {
    id: "graphite-light",
    label: "Graphite Light",
    type: "light",
    colors: {
      background: "#F4F5F7",
      surface: "#E8EBEF",
      panel: "#FFFFFF",
      hover: "#DDE2E8",
      border: "#C4CBD4",
      borderStrong: "#939EAC",
      text: "#252B33",
      textDim: "#505B6A",
      textFaint: "#5D6979",
      accent: "#414B5A",
      onAccent: "#FFFFFF",
      danger: "#B02F44",
      pattern: "rgba(65, 75, 90, 0.10)",
    },
    ...appearance,
  },
];

export const graphiteThemes: ExtensionManifest = {
  id: "graphite_themes",
  name: "Graphite",
  description: "Crisp black, white and silver with cool, restrained grey surfaces.",
  about: [
    "Crisp black, white and silver with cool, restrained grey surfaces.",
    "Square drafting frames, corner brackets, mono labels and a subtle dot grid.",
  ],
  features: [
    "Graphite Dark and Graphite Light",
    "Inter interface and IBM Plex Mono labels, bundled for offline use",
    "Square drafting frames, corner brackets, mono labels and a subtle dot grid.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Pencil,
  themes,
};
