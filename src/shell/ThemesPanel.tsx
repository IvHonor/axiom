import { useState } from "react";
import { Check, Search } from "lucide-react";
import { useTheme, type ThemeOption } from "./theme/ThemeProvider";
import { Section } from "./ui/Section";
import { ThemeSwatch } from "./ui/ThemeSwatch";

/** Sidebar for picking the color theme, like VS Code's Ctrl+K Ctrl+T picker. Every theme pack's themes are here. */
export function ThemesPanel() {
  const { theme: active, options, setTheme, followSystem, setFollowSystem, systemType, preferred } = useTheme();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = options.filter(({ theme, extension }) =>
    `${theme.label} ${extension.name} ${theme.type}`.toLowerCase().includes(q),
  );
  const dark = matches.filter((o) => o.theme.type === "dark");
  const light = matches.filter((o) => o.theme.type === "light");

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
      <label className="search">
        <Search size={14} strokeWidth={1.5} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search themes"
          placeholder="Search themes"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
          spellCheck={false}
        />
      </label>
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
        {dark.length > 0 && <Section key={q ? "search-dark" : "dark"} title="Dark" count={dark.length}>
          {list(dark)}
        </Section>}
        {light.length > 0 && <Section key={q ? "search-light" : "light"} title="Light" count={light.length}>
          {list(light)}
        </Section>}
        {matches.length === 0 && <p className="sidebar-empty" role="status">No themes match your search.</p>}
      </div>
    </aside>
  );
}
