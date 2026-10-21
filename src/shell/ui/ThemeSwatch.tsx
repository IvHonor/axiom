import type { Theme } from "../../extensions/types";

/** A tiny preview of a theme: its background, sidebar, accent, font and corner shape. */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  const { colors, fonts, style } = theme;
  return (
    <span
      className="swatch"
      style={{
        background: colors.background,
        color: colors.text,
        fontFamily: fonts.ui,
        borderColor: colors.borderStrong,
        borderRadius: Math.ceil(style.radius / 2),
      }}
      aria-hidden="true"
    >
      <span className="swatch-side" style={{ background: colors.surface, borderColor: colors.border }} />
      <span className="swatch-accent" style={{ background: colors.accent }} />
      Aa
    </span>
  );
}
