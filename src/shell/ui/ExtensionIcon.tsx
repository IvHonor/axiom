import type { CSSProperties } from "react";
import type { ExtensionManifest } from "../../extensions/types";

/** Theme previews keep their own palette while icons follow the current light/dark appearance. */
export function extensionStyle(ext: ExtensionManifest): CSSProperties {
  const light = ext.themes?.find(theme => theme.type === "light") ?? ext.themes?.[0];
  const dark = ext.themes?.find(theme => theme.type === "dark") ?? ext.themes?.[0];
  const color = ext.color ?? (light && dark
    ? `light-dark(${light.colors.accent}, ${dark.colors.accent})`
    : "var(--accent)");
  return { "--extension-accent": color } as CSSProperties;
}

export function ExtensionIcon({ ext, size = 16, frame }: {
  ext: ExtensionManifest;
  size?: number;
  frame?: "small" | "large";
}) {
  return <span aria-hidden="true" style={extensionStyle(ext)}
    className={`extension-symbol${frame === "small" ? " ext-icon" : frame === "large" ? " ext-hero-icon" : ""}`}>
    <ext.icon size={size} strokeWidth={1.5} />
  </span>;
}

export function ExtensionPalette({ ext }: { ext: ExtensionManifest }) {
  if (!ext.themes?.length) return null;
  return <span className="extension-palettes" aria-hidden="true">
    {ext.themes.map(theme => <span key={theme.id} className="extension-palette" title={theme.label}>
      <span style={{ background: theme.colors.background }} />
      <span style={{ background: theme.colors.surface }} />
      <span style={{ background: theme.colors.accent }} />
    </span>)}
  </span>;
}
