import { GraduationCap } from "lucide-react";
import { useTileLayout } from "../../../shell/ui/ResizableTile";
import { TileDisplayMenu } from "../../../shell/ui/TileDisplayMenu";
import { DEFAULTS, recommendedView, resolveView, VIEWS, type Preferences } from "./model";
import { useUniPreferences } from "./preferences";

export function UniSummaryTitle({onOpen}: {onOpen: () => void}) {
  const {size, width, height} = useTileLayout();
  const {prefs, update} = useUniPreferences(size);
  return <span className={`un-ov-title${width < 125 ? " is-compact" : ""}`}><TileDisplayMenu name="University" icon={GraduationCap} options={VIEWS}
    selected={prefs.view} recommended={recommendedView(width, height)} active={resolveView(prefs, width, height)}
    onSelect={view => update({view: view as Preferences["view"]})} onOpen={onOpen} onReset={() => update(DEFAULTS)}>
    <label>Module order<select aria-label="Module order" value={prefs.sort} onChange={event => update({sort: event.target.value as Preferences["sort"]})}>
      <option value="position">Your module order</option><option value="behind">Most behind first</option><option value="progress">Least caught up first</option><option value="name">Module name</option>
    </select></label>
    <label>Module filter<select aria-label="Module filter" value={prefs.scope} onChange={event => update({scope: event.target.value as Preferences["scope"]})}>
      <option value="all">All modules</option><option value="behind">With overdue lectures</option><option value="shaky">With shaky confidence</option>
    </select></label>
    <label>List density<select aria-label="List density" value={prefs.density} onChange={event => update({density: event.target.value as Preferences["density"]})}>
      <option value="auto">Auto</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option>
    </select></label>
    <label><span>Show module and lecture details</span><input type="checkbox" checked={prefs.details} onChange={event => update({details: event.target.checked})} /></label>
  </TileDisplayMenu></span>;
}
