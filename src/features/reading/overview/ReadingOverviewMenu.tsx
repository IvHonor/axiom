import { BookOpen } from "lucide-react";
import { useTileLayout } from "../../../shell/ui/ResizableTile";
import { TileDisplayMenu } from "../../../shell/ui/TileDisplayMenu";
import { DEFAULTS, recommendedView, resolveView, VIEWS, type Preferences } from "./model";
import { useReadingPreferences } from "./preferences";

export function ReadingSummaryTitle({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs, update } = useReadingPreferences(size);
  return <span className={`rd-ov-title${width < 125 ? " is-compact" : ""}`}><TileDisplayMenu name="Reading Tracker" icon={BookOpen} options={VIEWS} selected={prefs.view}
    recommended={recommendedView(width, height)} active={resolveView(prefs, width, height)}
    onSelect={view => update({ view: view as Preferences["view"] })} onOpen={onOpen} onReset={() => update(DEFAULTS)}>
    <label>Book order<select aria-label="Book order" value={prefs.sort} onChange={e => update({ sort: e.target.value as Preferences["sort"] })}>
      <option value="recent">Recently read first</option><option value="position">Your shelf order</option><option value="progress">Closest to finished</option><option value="title">Title</option>
    </select></label>
    <label>List density<select aria-label="List density" value={prefs.density} onChange={e => update({ density: e.target.value as Preferences["density"] })}>
      <option value="auto">Auto</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option>
    </select></label>
    <label><span>Show covers in lists</span><input type="checkbox" checked={prefs.covers} onChange={e => update({ covers: e.target.checked })} /></label>
  </TileDisplayMenu></span>;
}
