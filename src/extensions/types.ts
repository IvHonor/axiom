import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/** Everything the shell needs to know about one extension. */
export interface ExtensionManifest {
  /** Stable id. Also the extension's folder name (src/features/<id>/ or src/themes/<id>/). */
  id: string;
  name: string;
  /** One line for the Extensions list. */
  description: string;
  /** A paragraph or two for the extension's page. */
  about: string[];
  /** What it does, as short bullet points on its page. */
  features: string[];
  version: string;
  publisher: string;
  icon: LucideIcon;
  /** CSS colour for the extension's identity; theme packages use their own palette by default. */
  color?: string;
  /** Ships with Axiom: always installed and can't be uninstalled, but can be
   * switched off (see `required`). Extensions from the library are installed. */
  builtIn?: boolean;
  /** Can't be switched off either: Axiom needs it (the default themes). */
  required?: boolean;
  /** A life area: listed under Areas and shown as a tile on the overview. */
  area?: AreaContribution;
  /** Themes this extension adds to the theme picker. */
  themes?: Theme[];
}

export interface AreaContribution {
  /** Full view for the main panel. Leave out until the feature is built: the
   * area is then listed as "Coming soon" and can't be installed. */
  View?: ComponentType;
  /** Compact tile for the overview. */
  Summary?: ComponentType<{ onOpen: () => void; /** Opens another area (by id). */ onOpenArea?: (id: string) => void }>;
  /** Summary manages its content within the tile's available space. */
  fittedSummary?: boolean;
  /** Optional overview title with area-specific controls. */
  SummaryTitle?: ComponentType<{ onOpen: () => void }>;
  /** A sidebar of the area's own, opened from its icon in the activity bar
   * (under Extensions). The shell draws the frame and title; this is the body. */
  Sidebar?: ComponentType<AreaSidebarProps>;
  /** More tiles for the overview beside the area's own: one per sticky note,
   * say. Hidden along with the area. */
  tiles?: TileSource;
}

/** A tile an area adds to the overview, which it draws whole, frame and all
 * (put `<TileMoveHandle />` in it so it can be moved). */
export interface OverviewTile {
  /** Unique across the overview and stable: it's where the tile's place and
   * size are remembered. */
  id: string;
  /** What the tile shows, for the Tile component (e.g. a note's id). */
  item: string;
  /** Names it for screen readers ("Resize …"). */
  label: string;
  /** Its size until resized, in grid cells. */
  size?: { w: number; h: number };
  Tile: ComponentType<{ item: string; onOpen: () => void }>;
}

/** The extra tiles, as an external store: what's there now, and a way to
 * hear when that changes. `get` must return the same array until it does. */
export interface TileSource {
  subscribe: (listener: () => void) => () => void;
  get: () => OverviewTile[];
}

export interface AreaSidebarProps {
  /** Whether the area's tab is the one showing. */
  active: boolean;
  /** Opens (or focuses) the area's tab. */
  onOpen: () => void;
}

/**
 * A theme controls how the whole platform looks: colors, fonts, corner shapes
 * and how labels are written. Any CSS color or font-family string works.
 */
export interface Theme {
  id: string;
  label: string;
  /** Picks the native title bar and form controls to match. */
  type: "dark" | "light";
  colors: {
    /** Main area behind the panels. */
    background: string;
    /** Top bar, activity bar, sidebars and status bar. */
    surface: string;
    /** Panels and tiles. */
    panel: string;
    hover: string;
    border: string;
    /** Borders that need to stand out: inputs, boxes, icon frames. */
    borderStrong: string;
    text: string;
    textDim: string;
    textFaint: string;
    /** Active markers, focus rings, filled buttons and corner brackets. */
    accent: string;
    /** Text drawn on top of the accent color. */
    onAccent: string;
    danger: string;
    /** Dot grid behind the main area. "transparent" hides it. */
    pattern: string;
  };
  fonts: {
    /** Body text, titles and buttons. */
    ui: string;
    /** Small labels, metadata and the status bar. */
    label: string;
    /** Code: paths, identifiers and the clock. */
    mono: string;
    /** Base size in px. */
    size: number;
  };
  style: {
    /** Corner rounding of panels in px. Buttons and inputs get half. 0 is sharp. */
    radius: number;
    /** HUD corner brackets on panels. */
    brackets: boolean;
    /** Diagonal hatched boxes in the top bar. */
    hatching: boolean;
    /** "outline" draws buttons as frames; "filled" fills them with the accent. */
    buttons: "outline" | "filled";
    /** A ticking clock at the right of the top bar. */
    clock?: boolean;
  };
  labels: {
    uppercase: boolean;
    /** Letter spacing of labels. 1 is the HUD's wide spacing, 0 is none. */
    tracking: number;
    /** Joins words in labels: "_" writes NO_DATA, " " writes No data. */
    joiner: string;
    /** Sits between label parts, as in "DATABASE // ONLINE". */
    separator: string;
  };
}
