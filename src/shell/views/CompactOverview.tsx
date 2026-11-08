// The overview on a phone or tablet. The desktop grid, stacked into one
// column, kept each tile's desktop height (a birthday list sized for a
// monitor), so the page went on and on. Here each area gets a card sized for
// the screen, in the order of your desktop overview, with the area's own
// compact summary in it: two across on a phone, four on a tablet.
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { InstallBanner } from "../InstallApp";
import type { ExtensionManifest, OverviewTile } from "../../extensions/types";
import { useAreaName } from "../../features/lemma/persona";
import { ExtensionIcon, extensionStyle } from "../ui/ExtensionIcon";
import { Panel } from "../ui/Panel";
import { ResizableTile, TileGrid } from "../ui/ResizableTile";
import type { TilePosition, TileSize } from "../ui/tileLayout";

// A card is about as wide as the smallest desktop tile (2 of 12 columns),
// so each area shows the compact summary it already has for that size. The
// areas with the most to say take two cards' width (a 4-column tile).
const HALF: TileSize = { w: 2, h: 3 };
/** Double-width areas, and their rows of height. */
const WIDE: Record<string, number> = { lemma: 3, daily_plan: 5 };

const cardSize = (id: string): TileSize => (id in WIDE ? { w: 4, h: WIDE[id] } : HALF);

/** Desktop order: by row, then column; anything without a place at the end. */
const byPlace = (positions: Record<string, TilePosition>) => (a: string, b: string) => {
  const pa = positions[a], pb = positions[b];
  if (!pa || !pb) return Number(!pa) - Number(!pb);
  return pa.row - pb.row || pa.col - pb.col;
};

function today() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export function CompactOverview({ columns, areas, extra, positions, onOpen }: {
  /** Cards across: 2 on a phone, 4 on a tablet. */
  columns: number;
  areas: ExtensionManifest[];
  extra: { ext: ExtensionManifest; tile: OverviewTile }[];
  positions: Record<string, TilePosition>;
  onOpen: (id: string) => void;
}) {
  const nameOf = useAreaName();
  const order = byPlace(positions);
  const cards = [
    ...areas.map((ext) => ({ id: ext.id, ext, tile: null as OverviewTile | null })),
    ...extra.map(({ ext, tile }) => ({ id: tile.id, ext, tile })),
  ].sort((a, b) => order(a.id, b.id));

  return (
    <div className="overview phone-overview" style={{ "--overview-cols": columns } as CSSProperties}>
      <p className="phone-overview-date">{today()}</p>
      <InstallBanner />
      <TileGrid>
        {cards.map(({ id, ext, tile }) => {
          const size = tile ? HALF : cardSize(ext.id);
          if (tile) {
            return (
              <ResizableTile key={id} label={tile.label} size={size} onResize={() => {}}>
                <tile.Tile item={tile.item} onOpen={() => onOpen(ext.id)} />
              </ResizableTile>
            );
          }
          const Summary = ext.area?.Summary;
          const SummaryTitle = ext.area?.SummaryTitle;
          return (
            <ResizableTile key={id} label={nameOf(ext)} size={size} onResize={() => {}}>
              <Panel
                style={extensionStyle(ext)}
                className={`${ext.area?.fittedSummary ? "tile tile-fitted" : "tile"} phone-card${size.w > HALF.w ? " phone-card-wide" : ""}`}
                title={
                  SummaryTitle ? (
                    <SummaryTitle onOpen={() => onOpen(ext.id)} />
                  ) : (
                    <button className="tile-title" onClick={() => onOpen(ext.id)} title={`Open ${nameOf(ext)}`}>
                      <ExtensionIcon ext={ext} />
                      {nameOf(ext)}
                    </button>
                  )
                }
                actions={
                  <button className="icon-btn" aria-label={`Open ${nameOf(ext)}`} onClick={() => onOpen(ext.id)}>
                    <ArrowUpRight size={16} strokeWidth={1.5} />
                  </button>
                }
              >
                {Summary ? <Summary onOpen={() => onOpen(ext.id)} onOpenArea={onOpen} /> : <p className="dim">Open {nameOf(ext)} to get started.</p>}
              </Panel>
            </ResizableTile>
          );
        })}
      </TileGrid>
    </div>
  );
}
