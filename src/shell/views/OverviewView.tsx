import { ArrowUpRight } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { AreaContextMenu } from "../ui/AreaContextMenu";
import type { MenuPosition } from "../ui/ContextMenu";
import type { ExtensionManifest, OverviewTile } from "../../extensions/types";
import { useLabels } from "../theme/ThemeProvider";
import { Panel } from "../ui/Panel";
import { Logo } from "../ui/Logo";
import { ExtensionIcon, extensionStyle } from "../ui/ExtensionIcon";
import { useAreaName } from "../../features/lemma/persona";
import { ResizableTile, TileGrid } from "../ui/ResizableTile";
import { TileMoveHandle } from "../ui/TileMoveHandle";
import { useOverviewLayout } from "../useOverviewLayout";

interface OverviewViewProps {
  areas: ExtensionManifest[];
  /** Opens an area in its own tab. */
  onOpen: (id: string) => void;
  onBrowse: () => void;
  hiddenIds?: string[];
  onVisibilityChange?: (id: string, hidden: boolean) => void;
}

/** The tiles areas add beside their own (sticky notes), kept current. */
function useAreaTiles(areas: ExtensionManifest[]): { ext: ExtensionManifest; tile: OverviewTile }[] {
  const [, changed] = useReducer((n: number) => n + 1, 0);
  const sources = areas.filter((ext) => ext.area?.tiles);
  const key = sources.map((ext) => ext.id).join();
  useEffect(() => {
    const stops = sources.map((ext) => ext.area!.tiles!.subscribe(changed));
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return sources.flatMap((ext) => ext.area!.tiles!.get().map((tile) => ({ ext, tile })));
}

/** The home dashboard: one resizable tile per installed area, and any
 * extra tiles they add. */
export function OverviewView({ areas, onOpen, onBrowse, hiddenIds = [], onVisibilityChange }: OverviewViewProps) {
  const { label } = useLabels();
  const visible = areas.filter((area) => !hiddenIds.includes(area.id));
  const [menu, setMenu] = useState<{ ext: ExtensionManifest; at: MenuPosition } | null>(null);
  const nameOf = useAreaName();
  const extra = useAreaTiles(visible);
  const { sizeOf, resize, positions, movement } = useOverviewLayout(
    [...visible.map(area => area.id), ...extra.map(({ tile }) => tile.id)],
    Object.fromEntries(extra.flatMap(({ tile }) => tile.size ? [[tile.id, tile.size]] : [])),
  );

  if (areas.length === 0) {
    return (
      <div className="empty-state overview-empty">
        <Logo size={56} />
        <div className="empty-title">{label("No areas tracked")}</div>
        <p className="empty-text">Install an extension to start tracking an area of your life. It will report here.</p>
        <button className="btn" onClick={onBrowse}>
          Browse extensions
        </button>
      </div>
    );
  }

  if (visible.length === 0) return <div className="empty-state overview-empty">
    <Logo size={56} />
    <div className="empty-title">Your overview is clear</div>
    <p className="empty-text">Right-click an area in the left bar and choose Unhide to bring it back.</p>
    <button className="btn" onClick={() => areas.forEach((ext) => onVisibilityChange?.(ext.id, false))}>Show all areas</button>
  </div>;

  return (
    <div className="overview">
      <TileGrid>
        {visible.map((ext) => {
          const Summary = ext.area?.Summary;
          const SummaryTitle = ext.area?.SummaryTitle;
          return (
            <ResizableTile key={ext.id} label={nameOf(ext)} size={sizeOf(ext.id)}
              position={positions[ext.id]} movement={movement(ext.id)} onResize={(size) => resize(ext.id, size)}>
              <Panel
                onContextMenu={onVisibilityChange ? (event) => {
                  if (event.defaultPrevented || (event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
                  event.preventDefault();
                  setMenu({ ext, at: { x: event.clientX, y: event.clientY } });
                } : undefined}
                style={extensionStyle(ext)}
                className={ext.area?.fittedSummary ? "tile tile-fitted" : "tile"}
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
                  <><TileMoveHandle /><button className="icon-btn" aria-label={`Open ${nameOf(ext)}`} title="Open in a tab" onClick={() => onOpen(ext.id)}>
                    <ArrowUpRight size={16} strokeWidth={1.5} />
                  </button></>
                }
              >
                {Summary ? <Summary onOpen={() => onOpen(ext.id)} onOpenArea={onOpen} /> : <p className="dim">Open {nameOf(ext)} to get started.</p>}
              </Panel>
            </ResizableTile>
          );
        })}
        {extra.map(({ ext, tile }) => (
          <ResizableTile key={tile.id} label={tile.label} size={sizeOf(tile.id)}
            position={positions[tile.id]} movement={movement(tile.id)} onResize={(size) => resize(tile.id, size)}>
            <tile.Tile item={tile.item} onOpen={() => onOpen(ext.id)} />
          </ResizableTile>
        ))}
      </TileGrid>
      {menu && onVisibilityChange && <AreaContextMenu ext={menu.ext} at={menu.at} hidden={false}
        onClose={() => setMenu(null)} onOpen={() => onOpen(menu.ext.id)} onVisibilityChange={onVisibilityChange} />}
    </div>
  );
}
