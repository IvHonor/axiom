// Wireframe: a monochrome HUD with bracket corners and code-style labels.
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource-variable/jetbrains-mono";
import { Scan } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

const UI = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", "Cascadia Mono", Consolas, monospace';

const hud = {
  fonts: { ui: UI, label: MONO, mono: MONO, size: 13 },
  style: { radius: 0, brackets: true, hatching: true, buttons: "outline", clock: true },
  labels: { uppercase: true, tracking: 1, joiner: "_", separator: "//" },
} satisfies Partial<Theme>;

const dark: Theme = {
  id: "wireframe-dark",
  label: "Wireframe Dark",
  type: "dark",
  colors: {
    background: "#000000",
    surface: "#060606",
    panel: "rgba(0, 0, 0, 0.88)",
    hover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.14)",
    borderStrong: "rgba(255, 255, 255, 0.34)",
    text: "#f2f2f2",
    textDim: "#9b9b9b",
    textFaint: "#5e5e5e",
    accent: "#f2f2f2",
    onAccent: "#000000",
    danger: "#f2f2f2",
    pattern: "rgba(255, 255, 255, 0.07)",
  },
  ...hud,
};

const light: Theme = {
  id: "wireframe-light",
  label: "Wireframe Light",
  type: "light",
  colors: {
    background: "#f3f3f0",
    surface: "#ebebe7",
    panel: "rgba(250, 250, 248, 0.92)",
    hover: "rgba(0, 0, 0, 0.05)",
    border: "rgba(0, 0, 0, 0.14)",
    borderStrong: "rgba(0, 0, 0, 0.32)",
    text: "#111111",
    textDim: "#5c5c5c",
    textFaint: "#9a9a9a",
    accent: "#111111",
    onAccent: "#f3f3f0",
    danger: "#111111",
    pattern: "rgba(0, 0, 0, 0.09)",
  },
  ...hud,
};

export const wireframeThemes: ExtensionManifest = {
  id: "wireframe_themes",
  name: "Wireframe",
  description: "A monochrome HUD: black glass, bracket corners and terminal-style labels.",
  about: [
    "For a sharper, more technical feel. Wireframe turns Axiom into a heads-up display: monochrome panels, corner brackets and uppercase, terminal-style labels.",
  ],
  features: [
    "A dark and a light version",
    "Bracket-cornered panels and hatched details",
    "Uppercase labels in Chakra Petch and JetBrains Mono",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: Scan,
  themes: [dark, light],
};
