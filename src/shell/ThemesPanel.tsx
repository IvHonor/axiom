import { Check } from "lucide-react";
import { useTheme, type ThemeOption } from "./theme/ThemeProvider";
import { Section } from "./ui/Section";
import { ThemeSwatch } from "./ui/ThemeSwatch";

/** Sidebar for picking the color theme, like VS Code's Ctrl+K Ctrl+T picker. */
export function ThemesPanel({ onBrowse }: { onBrowse: () => void }) {
  const { theme: active, options, setTheme, followSystem, setFollowSystem, systemType, preferred } = useTheme();
  const dark = options.filter((o) => o.theme.type === "dark");
  const light = options.filter((o) => o.theme.type === "light");

  const list = (items: ThemeOption[]) => (
    <ul className="theme-list">
      {items.map(({ theme, extension }) => {
        const isActive = theme.id === active.id;
        // While following the system, mark the theme the other mode would use.
        const isPreferred = followSystem && !isActive && preferred[theme.type] === theme.id;
        return (
          <li key={theme.id}>
            <button
              className={isActive ? "theme-item is-active" : "theme-item"}
              onClick={() => setTheme(theme.id)}
              aria-pressed={isActive}
            >
              <ThemeSwatch theme={theme} />
              <span className="theme-text">
                <span className="theme-name">{theme.label}</span>
                <span className="ext-meta">
                  {extension.name}
                  {isPreferred && ` · used in ${theme.type} mode`}
                </span>
              </span>
              {isActive && <Check size={14} strokeWidth={1.75} className="theme-check" />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="sidebar">
      <header className="sidebar-head">Themes</header>
      <div className="sidebar-body">
        <label className="theme-follow">
          <input type="checkbox" checked={followSystem} onChange={(e) => setFollowSystem(e.currentTarget.checked)} />
          <span>
            Match system light/dark
            <span className="ext-meta">
              {followSystem
                ? `Your system is in ${systemType} mode. Pick a ${systemType} theme to use it in this mode.`
                : "Using the theme you picked, whatever the system mode."}
            </span>
          </span>
        </label>
        <Section title="Dark" count={dark.length}>
          {list(dark)}
        </Section>
        <Section title="Light" count={light.length}>
          {list(light)}
        </Section>
        <div className="sidebar-empty">
          <button className="btn btn-sm btn-ghost" onClick={onBrowse}>
            Browse theme extensions
          </button>
        </div>
      </div>
    </aside>
  );
}
