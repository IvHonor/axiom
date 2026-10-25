import type { Theme } from "../../extensions/types";

/** Writes a theme onto the page as CSS variables and data attributes that the stylesheets read. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const { colors, fonts, style, labels } = theme;

  const vars: Record<string, string> = {
    "--bg": colors.background,
    "--surface": colors.surface,
    "--panel": colors.panel,
    "--hover": colors.hover,
    "--line": colors.border,
    "--line-strong": colors.borderStrong,
    "--text": colors.text,
    "--text-dim": colors.textDim,
    "--text-faint": colors.textFaint,
    "--accent": colors.accent,
    "--on-accent": colors.onAccent,
    "--danger": colors.danger,
    "--pattern": colors.pattern,
    "--font-ui": fonts.ui,
    "--font-label": fonts.label,
    "--font-mono": fonts.mono,
    "--font-size": `${fonts.size}px`,
    "--radius": `${style.radius}px`,
    "--radius-sm": `${Math.ceil(style.radius / 2)}px`,
    "--label-case": labels.uppercase ? "uppercase" : "none",
    "--tracking": String(labels.tracking),
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

  root.style.colorScheme = theme.type;
  root.dataset.colorScheme = theme.type;
  root.dataset.brackets = style.brackets ? "on" : "off";
  root.dataset.hatching = style.hatching ? "on" : "off";
  root.dataset.buttons = style.buttons;
}
