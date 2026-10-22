import { CalendarClock } from "lucide-react";
import { TileDisplayMenu } from "../../../shell/ui/TileDisplayMenu";
import { useTileLayout } from "../../../shell/ui/ResizableTile";
import { DEFAULTS, recommendedView, resolveView, VIEWS, type Preferences } from "./model";
import { useOverviewPreferences } from "./preferences";

export function PlanSummaryTitle({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs, update } = useOverviewPreferences(size);
  return <TileDisplayMenu name="Daily Plan" icon={CalendarClock} options={VIEWS} selected={prefs.view}
    recommended={recommendedView(width, height)} active={resolveView(prefs, width, height)}
    onSelect={(view) => update({ view: view as Preferences["view"] })} onOpen={onOpen} onReset={() => update(DEFAULTS)}>
    <label>List density<select aria-label="List density" value={prefs.density} onChange={(e) => update({ density: e.target.value as Preferences["density"] })}><option value="auto">Auto</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
    <label>Timeline hours<select aria-label="Timeline hours" value={prefs.hours} onChange={(e) => update({ hours: e.target.value as Preferences["hours"] })}><option value="scheduled">Fit scheduled events</option><option value="working">Working day + events</option><option value="full">Full 24 hours</option></select></label>
    <label><span>Show completed tasks in lists</span><input type="checkbox" checked={prefs.completed} onChange={(e) => update({ completed: e.target.checked })} /></label>
    <label><span>Include past events in lists</span><input type="checkbox" checked={prefs.earlier} onChange={(e) => update({ earlier: e.target.checked })} /></label>
  </TileDisplayMenu>;
}
