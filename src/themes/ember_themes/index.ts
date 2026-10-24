// Ember: warm charcoal greys with orange highlights, in the Ubuntu font.
// The dark palette is adapted from the "Ambiance" theme in SolarLiner's Linux
// Themes for VS Code; the light one is built from the same palette so the pair
// can follow the system's light/dark setting.
import "@fontsource/ubuntu/400.css";
import "@fontsource/ubuntu/500.css";
import "@fontsource/ubuntu/700.css";
import "@fontsource/ubuntu-mono/400.css";
import { Sunrise } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

const UI = '"Ubuntu", "Segoe UI", system-ui, sans-serif';
const MONO = '"Ubuntu Mono", Consolas, monospace';

const ember = {
  fonts: { ui: UI, label: UI, mono: MONO, size: 13 },
  style: { radius: 4, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const dark: Theme = {
  id: "ember-dark",
  label: "Ember",
  type: "dark",
  colors: {
    background: "#31312e", // editor.background
    surface: "#373633", // sideBar.background
    panel: "#3c3b37", // editorGroupHeader.tabsBackground
    hover: "#403f3a", // selection.background
    border: "#2a2926",
    borderStrong: "#4b4a45",
    text: "#dddddd", // editor.foreground
    textDim: "#aaa9a4",
    textFaint: "#7b7a74",
    accent: "#ec6a3f", // button.background
    onAccent: "#ffffff",
    danger: "#ff5a52",
    pattern: "transparent",
  },
  ...ember,
};

const light: Theme = {
  id: "ember-light",
  label: "Ember Light",
  type: "light",
  colors: {
    background: "#f2f1f0",
    surface: "#e8e6e3",
    panel: "#ffffff",
    hover: "#e3e0dc",
    border: "#d6d3cf",
    borderStrong: "#bdb9b3",
    text: "#3c3c3c",
    textDim: "#6e6c68",
    textFaint: "#9a9792",
    accent: "#e95420",
    onAccent: "#ffffff",
    danger: "#c7162b",
    pattern: "transparent",
  },
  ...ember,
};

export const emberThemes: ExtensionManifest = {
  id: "ember_themes",
  name: "Ember",
  description: "Warm charcoal greys with orange highlights, in a dark and a light version.",
  about: [
    "A warm alternative to the default look. Ember pairs soft charcoal greys with glowing orange highlights, and sets everything in the friendly, rounded Ubuntu typeface.",
  ],
  features: [
    "Ember (dark) and Ember Light",
    "Warm greys with orange highlights",
    "Set in the Ubuntu and Ubuntu Mono fonts",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Sunrise,
  themes: [dark, light],
};
