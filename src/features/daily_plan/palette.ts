/** Block colours: a name is stored, the shade is picked here. */
export const BLOCK_COLORS = ["blue", "green", "purple", "orange", "red", "pink", "yellow", "gray"] as const;

const SHADES: Record<string, string> = {
  blue: "#579dff",
  green: "#4bce97",
  purple: "#9f8fef",
  orange: "#fea362",
  red: "#f87168",
  pink: "#e774bb",
  yellow: "#e2b203",
  gray: "#8c9bab",
};

export const colorOf = (name: string) => SHADES[name] ?? SHADES.blue;
