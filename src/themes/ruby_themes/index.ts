import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { Gem } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// Bold geometric type, sharp ruby corner markers and filled accent buttons.
const appearance = {
  fonts: {
    ui: '"Space Grotesk Variable", "Segoe UI", sans-serif',
    label: '"Space Grotesk Variable", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", Consolas, monospace',
    size: 13,
  },
  style: { radius: 2, brackets: true, buttons: "filled" },
  labels: { uppercase: true, tracking: 0.35, joiner: " ", separator: "/" },
} satisfies Partial<Theme>;

const themes: Theme[] = [
  {
    id: "ruby-dark",
    label: "Ruby Dark",
    type: "dark",
    colors: {
      background: "#100E10",
      surface: "#09090B",
      panel: "#1A171B",
      hover: "#30242A",
      border: "#48333C",
      borderStrong: "#795563",
      text: "#FFFFFF",
      textDim: "#D3BDC6",
      textFaint: "#BFA5B0",
      accent: "#F04F78",
      onAccent: "#09090B",
      danger: "#FFB068",
      pattern: "transparent",
    },
    ...appearance,
  },
  {
    id: "ruby-light",
    label: "Ruby Light",
    type: "light",
    colors: {
      background: "#FFFFFF",
      surface: "#F5F3F4",
      panel: "#FFFFFF",
      hover: "#F0E5E9",
      border: "#DCC8D0",
      borderStrong: "#B58A9A",
      text: "#191116",
      textDim: "#65434F",
      textFaint: "#765460",
      accent: "#A3163F",
      onAccent: "#FFFFFF",
      danger: "#9C4B12",
      pattern: "transparent",
    },
    ...appearance,
  },
];

export const rubyThemes: ExtensionManifest = {
  id: "ruby_themes",
  name: "Ruby",
  description: "Ruby-red accents, black panels and white text, with a crisp white light variant.",
  about: [
    "Ruby-red accents, black panels and white text, with a crisp white light variant.",
    "Bold geometric type, sharp ruby corner markers and filled accent buttons.",
  ],
  features: [
    "Ruby Dark and Ruby Light",
    "Space Grotesk interface and JetBrains Mono details, bundled for offline use",
    "Bold geometric type, sharp ruby corner markers and filled accent buttons.",
    "Works with saved theme preferences and system light/dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Gem,
  themes,
};
