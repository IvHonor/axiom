import { ArrowUpRight, Crosshair } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { useLabels } from "../theme/ThemeProvider";
import { Panel } from "../ui/Panel";
import { ResizableTile, TileGrid } from "../ui/ResizableTile";
import { useTileSizes } from "../useTileSizes";

interface OverviewViewProps {
  areas: ExtensionManifest[];
  /** Opens an area in its own tab. */
  onOpen: (id: string) => void;
  onBrowse: () => void;
}

/** The home dashboard: one resizable tile per installed area. */
export function OverviewView({ areas, onOpen, onBrowse }: OverviewViewProps) {
  const { label } = useLabels();
  const { sizeOf, resize } = useTileSizes();

  if (areas.length === 0) {
    return (
      <div className="empty-state overview-empty">
        <Crosshair size={56} strokeWidth={0.75} className="dim" />
        <div className="empty-title">{label("No areas tracked")}</div>
        <p className="empty-text">Install an extension to start tracking an area of your life. It will report here.</p>
        <button className="btn" onClick={onBrowse}>
          Browse extensions
        </button>
      </div>
    );
  }

  return (
    <div className="overview">
      <TileGrid>
        {areas.map((ext) => {
          const Summary = ext.area?.Summary;
          return (
            <ResizableTile key={ext.id} label={ext.name} size={sizeOf(ext.id)} onResize={(size) => resize(ext.id, size)}>
              <Panel
                className="tile"
                title={
                  <button className="tile-title" onClick={() => onOpen(ext.id)} title={`Open ${ext.name}`}>
                    <ext.icon size={16} strokeWidth={1.5} />
                    {ext.name}
                  </button>
                }
                actions={
                  <button className="icon-btn" aria-label={`Open ${ext.name}`} title="Open in a tab" onClick={() => onOpen(ext.id)}>
                    <ArrowUpRight size={16} strokeWidth={1.5} />
                  </button>
                }
              >
                {Summary ? <Summary /> : <p className="dim">Open {ext.name} to get started.</p>}
              </Panel>
            </ResizableTile>
          );
        })}
      </TileGrid>
    </div>
  );
}
