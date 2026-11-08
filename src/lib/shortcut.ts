/** Mac keyboards say ⌘ and ⇧ where Windows says Ctrl and Shift. Every shortcut accepts either key. */
export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

/** "Areas (Ctrl+B)" on Windows, "Areas (⌘B)" on a Mac. */
export function shortcut(label: string): string {
  return isMac ? label.replace(/Ctrl\+/g, "⌘").replace(/Shift\+/g, "⇧") : label;
}

/** A system-wide shortcut (Lemma on the desktop): "Ctrl+Alt+Space" on Windows, "⌃⌥Space" (Control, Option) on a Mac. */
export function globalShortcut(label: string): string {
  return isMac ? label.replace(/Ctrl\+Alt\+/g, "⌃⌥") : label;
}
