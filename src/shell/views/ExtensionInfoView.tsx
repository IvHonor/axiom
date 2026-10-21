import { Check } from "lucide-react";
import { isComingSoon } from "../../extensions";
import type { ExtensionManifest } from "../../extensions/types";
import { useLabels, useTheme } from "../theme/ThemeProvider";
import { Panel } from "../ui/Panel";
import { ThemeSwatch } from "../ui/ThemeSwatch";

interface ExtensionInfoViewProps {
  ext: ExtensionManifest;
  installed: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onOpen: () => void;
}

/** The page shown when an extension is clicked in the Extensions sidebar. */
export function ExtensionInfoView({ ext, installed, onInstall, onUninstall, onOpen }: ExtensionInfoViewProps) {
  const { theme: activeTheme, setTheme } = useTheme();
  const { label, sep } = useLabels();
  const comingSoon = isComingSoon(ext);
  const state = comingSoon ? "coming soon" : ext.builtIn ? "built-in" : installed ? "installed" : "not installed";
  // A coming-soon area has a badge instead, so its state isn't repeated here.
  const meta = comingSoon ? [ext.publisher] : [ext.publisher, `v${ext.version}`, label(state)];

  return (
    <div className="page">
      <Panel>
        <div className="ext-hero">
          <div className="ext-hero-icon">
            <ext.icon size={36} strokeWidth={1.25} />
          </div>
          <div>
            <h1 className="ext-hero-name">{ext.name}</h1>
            <div className="ext-meta">{meta.join(` ${sep} `)}</div>
            <p className="ext-hero-desc">{ext.description}</p>
            <div className="row">
              {comingSoon && <span className="ext-soon">Coming soon</span>}
              {!comingSoon && !installed && (
                <button className="btn" onClick={onInstall}>
                  Install
                </button>
              )}
              {installed && ext.area && (
                <button className="btn" onClick={onOpen}>
                  Open
                </button>
              )}
              {installed && !ext.builtIn && (
                <button className="btn btn-ghost" onClick={onUninstall}>
                  Uninstall
                </button>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="About">
        <div className="ext-about">
          {ext.about.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <ul className="ext-features">
            {ext.features.map((feature) => (
              <li key={feature}>
                <Check size={14} strokeWidth={2} />
                {feature}
              </li>
            ))}
          </ul>
          {comingSoon && <p className="dim">This area is still being built. It will be available to install in a future update.</p>}
        </div>
      </Panel>

      {ext.themes && (
        <Panel title="Themes" meta={installed ? undefined : label("Install to use")}>
          <ul className="theme-rows">
            {ext.themes.map((theme) => {
              const isActive = theme.id === activeTheme.id;
              return (
                <li key={theme.id} className="theme-row">
                  <ThemeSwatch theme={theme} />
                  <span className="theme-text">
                    <span className="theme-name">{theme.label}</span>
                    <span className="ext-meta">{label(theme.type)}</span>
                  </span>
                  <button
                    className={isActive ? "btn btn-sm btn-ghost" : "btn btn-sm"}
                    disabled={!installed || isActive}
                    onClick={() => setTheme(theme.id)}
                  >
                    {isActive ? "Active" : "Apply"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
