import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { Eclipse } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

const dark: Theme = {
  id: "shadow-dark",
  label: "Crimson",
  type: "dark",
  colors: {
    background: "#060607",
    surface: "#030304",
    panel: "#101012",
    hover: "#211418",
    border: "#302126",
    borderStrong: "#67434D",
    text: "#F5F3F4",
    textDim: "#C7B9BE",
    textFaint: "#AA959D",
    accent: "#CE203C",
    onAccent: "#FFFFFF",
    danger: "#FFB077",
    pattern: "transparent",
  },
  fonts: {
    ui: '"Space Grotesk Variable", "Segoe UI", sans-serif',
    label: '"Space Grotesk Variable", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", Consolas, monospace',
    size: 13,
  },
  style: { radius: 6, brackets: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0.1, joiner: " ", separator: "·" },
};

export const shadowThemes: ExtensionManifest = {
  id: "shadow_themes",
  name: "Crimson",
  description: "Blood-red accents against deep black, with crisp white text and a smooth finish.",
  about: [
    "Deep black surfaces, blood-red accents and crisp white text give Crimson its bold, understated character.",
    "Smooth panels, filled crimson buttons and geometric type keep the interface focused and understated.",
  ],
  features: [
    "One dark variant with blood-red accents and layered black surfaces",
    "Space Grotesk and JetBrains Mono fonts, bundled for offline use",
    "Soft corners, sentence-case labels and filled buttons",
    "Works with saved theme preferences and system dark mode",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Eclipse,
  themes: [dark],
};
