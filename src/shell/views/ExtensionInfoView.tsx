import { Check } from "lucide-react";
import { isComingSoon } from "../../extensions";
import type { ExtensionManifest } from "../../extensions/types";
import { useLabels, useTheme } from "../theme/ThemeProvider";
import { NotificationSettings } from "../notifications/NotificationSettings";
import { Panel } from "../ui/Panel";
import { ThemeSwatch } from "../ui/ThemeSwatch";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { Publisher } from "../ui/Publisher";

interface ExtensionInfoViewProps {
  ext: ExtensionManifest;
  installed: boolean;
  /** Installed (or built in) and switched on. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onInstall: () => void;
  onUninstall: () => void;
  onOpen: () => void;
  /** Emails need an account. */
  signedIn: boolean;
}

/** The page shown when an extension is clicked in the Extensions sidebar. */
export function ExtensionInfoView({ ext, installed, enabled, onEnabledChange, onInstall, onUninstall, onOpen, signedIn }: ExtensionInfoViewProps) {
  const { theme: activeTheme, setTheme } = useTheme();
  const { label, sep } = useLabels();
  const comingSoon = isComingSoon(ext);
  const state = comingSoon ? "coming soon" : ext.builtIn ? (enabled ? "built-in" : "built-in, off") : installed ? (enabled ? "installed" : "installed, off") : "not installed";
  // A coming-soon area has a badge instead, so its state isn't repeated here.
  const meta = comingSoon ? [] : [`v${ext.version}`, label(state)];

  return (
    <div className="page">
      <Panel>
        <div className="ext-hero">
          <ExtensionIcon ext={ext} size={36} frame="large" />
          <div>
            <h1 className="ext-hero-name">{ext.name}</h1>
            <div className="ext-meta">
              <Publisher name={ext.publisher} />
              {meta.length > 0 && ` ${sep} ${meta.join(` ${sep} `)}`}
            </div>
            <p className="ext-hero-desc">{ext.description}</p>
            <div className="row">
              {comingSoon && <span className="ext-soon">Coming soon</span>}
              {!comingSoon && !installed && !ext.builtIn && (
                <button className="btn" onClick={onInstall}>
                  Install
                </button>
              )}
              {enabled && ext.area && (
                <button className="btn" onClick={onOpen}>
                  Open
                </button>
              )}
              {(ext.builtIn || installed) && !comingSoon && !ext.required && (
                <button className={enabled ? "btn btn-ghost" : "btn"} onClick={() => onEnabledChange(!enabled)}>
                  {enabled ? "Switch off" : "Switch on"}
                </button>
              )}
              {ext.required && <span className="ext-soon">Always on</span>}
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

      {enabled && ext.area?.View && (
        <Panel title="Notifications">
          <NotificationSettings extensions={[ext.id]} signedIn={signedIn} />
        </Panel>
      )}

      {ext.themes && (
        <Panel title="Themes" meta={enabled ? undefined : label(ext.builtIn ? "Switch on to use" : "Install to use")}>
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
                    disabled={!enabled || isActive}
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
