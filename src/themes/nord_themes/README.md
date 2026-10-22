# Nord for Axiom

An optional extension, installed and removed through Axiom's existing Extensions library.

Upstream: https://www.nordtheme.com

Palette credit: Arctic Ice Studio and Sven Greb. See LICENSE for upstream terms. Axiom's UI mapping and typography are an independent adaptation, not an official upstream port. Muted text, surfaces, and light-mode accents may differ to maintain usable contrast in small controls.

Variants: Polar Night, Snow.

Fonts: Inter (interface) and IBM Plex Mono (numbers, identifiers and code). Fontsource dependencies include their own font licenses. Fonts are bundled locally, as with existing Axiom theme packages.

Register the exported manifest in src/extensions/index.ts. Do not mark it builtIn: installation gates its themes in ThemeProvider. Uninstalling an active package falls back to Modern; saved preferences are retained for reinstallation.

