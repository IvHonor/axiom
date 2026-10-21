import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { currentId } from "../../extensions";
import type { ExtensionManifest, Theme } from "../../extensions/types";
import { DEFAULT_THEMES } from "../../themes/modern_themes";
import { usePersistentState } from "../usePersistentState";
import { applyTheme } from "./applyTheme";

export interface ThemeOption {
  theme: Theme;
  extension: ExtensionManifest;
}

/**
 * Like VS Code's "auto detect color scheme": while `followSystem` is on, the
 * app shows the preferred dark or light theme to match the OS. Picking a theme
 * of the other kind switches to `fixed` until "Match system" is turned back on.
 */
interface ThemePrefs {
  followSystem: boolean;
  dark: string;
  light: string;
  fixed: string;
}

const DEFAULT_PREFS: ThemePrefs = {
  followSystem: true,
  dark: DEFAULT_THEMES.dark,
  light: DEFAULT_THEMES.light,
  fixed: DEFAULT_THEMES.dark,
};

interface ThemeContextValue {
  theme: Theme;
  /** Every theme from every installed extension. */
  options: ThemeOption[];
  setTheme: (id: string) => void;
  followSystem: boolean;
  setFollowSystem: (follow: boolean) => void;
  /** The OS's current mode. */
  systemType: Theme["type"];
  /** The themes used for each OS mode while following the system. */
  preferred: { dark: string; light: string };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Whether the OS is in dark mode, updated live when the user switches it. */
function useSystemType(): Theme["type"] {
  const [dark, setDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const query = darkQuery();
    const onChange = () => setDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}

interface ThemeProviderProps {
  installed: ExtensionManifest[];
  children: ReactNode;
}

export function ThemeProvider({ installed, children }: ThemeProviderProps) {
  const [prefs, setPrefs] = usePersistentState<ThemePrefs>("axiom.themePrefs", (saved) => {
    const p = { ...DEFAULT_PREFS, ...(saved && typeof saved === "object" ? (saved as Partial<ThemePrefs>) : {}) };
    return { ...p, dark: currentId(p.dark), light: currentId(p.light), fixed: currentId(p.fixed) };
  });
  const systemType = useSystemType();

  const options = installed.flatMap((extension) => (extension.themes ?? []).map((theme) => ({ theme, extension })));
  const find = (id: string) => options.find((o) => o.theme.id === id)?.theme;

  // A preferred theme whose extension was uninstalled falls back to the default of its kind.
  const preferred = {
    dark: find(prefs.dark)?.id ?? DEFAULT_THEMES.dark,
    light: find(prefs.light)?.id ?? DEFAULT_THEMES.light,
  };
  const wanted = prefs.followSystem ? preferred[systemType] : prefs.fixed;
  const theme = find(wanted) ?? find(DEFAULT_THEMES[systemType]);
  if (!theme) throw new Error("The built-in default themes are missing");

  const setTheme = (id: string) => {
    const picked = find(id);
    if (!picked) return;
    setPrefs((p) => ({
      ...p,
      [picked.type]: id,
      fixed: id,
      // Picking a theme of the other kind than the OS means "use this one regardless".
      followSystem: p.followSystem && picked.type === systemType,
    }));
  };

  const setFollowSystem = (followSystem: boolean) =>
    setPrefs((p) => ({ ...p, followSystem, fixed: theme.id }));

  // Layout effect so the theme is in place before the first paint (no flash).
  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      // While following the system, the native title bar follows it too (null);
      // otherwise it matches the chosen theme. This also keeps the webview's
      // prefers-color-scheme honest, which useSystemType relies on.
      const win = getCurrentWindow();
      win.setTheme(prefs.followSystem ? null : theme.type).catch(() => {});
      win.setBackgroundColor(theme.colors.background).catch(() => {});
    } catch {
      // Not running inside Tauri (e.g. a plain browser tab).
    }
  }, [theme, prefs.followSystem]);

  return (
    <ThemeContext.Provider
      value={{ theme, options, setTheme, followSystem: prefs.followSystem, setFollowSystem, systemType, preferred }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

/** Writes labels in the active theme's style: "No data" becomes NO_DATA in the Wireframe theme. */
export function useLabels() {
  const { labels } = useTheme().theme;
  return {
    label: (text: string) => text.replace(/ /g, labels.joiner),
    sep: labels.separator,
  };
}
