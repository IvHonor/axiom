// Axiom's default themes: soft greys, rounded corners, filled blue buttons and
// the operating system's own fonts.
import { Palette } from "lucide-react";
import type { ExtensionManifest, Theme } from "../../extensions/types";

// System font stacks: Segoe UI on Windows, San Francisco on macOS, Ubuntu on
// Linux; Consolas / Menlo for code. These ship with the OS, so nothing to bundle.
const UI = '-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, "Ubuntu", "Droid Sans", sans-serif';
const MONO = 'Consolas, Menlo, Monaco, "Courier New", monospace';

const modern = {
  fonts: { ui: UI, label: UI, mono: MONO, size: 13 },
  style: { radius: 8, brackets: false, hatching: false, buttons: "filled" },
  labels: { uppercase: false, tracking: 0, joiner: " ", separator: "·" },
} satisfies Partial<Theme>;

const dark: Theme = {
  id: "modern-dark",
  label: "Modern Dark",
  type: "dark",
  colors: {
    background: "#1f1f1f",
    surface: "#181818",
    panel: "#181818",
    hover: "#2a2d2e",
    border: "#2b2b2b",
    borderStrong: "#3c3c3c",
    text: "#cccccc",
    textDim: "#9d9d9d",
    textFaint: "#6e7681",
    accent: "#0078d4",
    onAccent: "#ffffff",
    danger: "#f85149",
    pattern: "transparent",
  },
  ...modern,
};

const light: Theme = {
  id: "modern-light",
  label: "Modern Light",
  type: "light",
  colors: {
    background: "#ffffff",
    surface: "#f8f8f8",
    panel: "#f8f8f8",
    hover: "#f2f2f2",
    border: "#e5e5e5",
    borderStrong: "#cecece",
    text: "#3b3b3b",
    textDim: "#616161",
    textFaint: "#8b949e",
    accent: "#005fb8",
    onAccent: "#ffffff",
    danger: "#f85149",
    pattern: "transparent",
  },
  ...modern,
};

/** Used when following the system's light/dark setting, until another theme is chosen. */
export const DEFAULT_THEMES = { dark: dark.id, light: light.id };

export const modernThemes: ExtensionManifest = {
  id: "modern_themes",
  name: "Modern Themes",
  description: "Axiom's default dark and light themes: clean, rounded and easy on the eyes.",
  about: [
    "The look Axiom ships with. Soft corners, calm colours and comfortable spacing keep the focus on your work, in both a dark and a light version.",
  ],
  features: [
    "A dark and a light theme",
    "Switches with your system's light and dark mode",
    "Rounded panels and clear, readable type",
  ],
  version: "0.2.0",
  publisher: "Axiom",
  icon: Palette,
  builtIn: true,
  required: true,
  themes: [dark, light],
};
