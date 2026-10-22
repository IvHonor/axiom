import { SquareKanban } from "lucide-react";
import { useTileLayout } from "../../../shell/ui/ResizableTile";
import { TileDisplayMenu } from "../../../shell/ui/TileDisplayMenu";
import { DEFAULTS, recommendedView, resolveView, VIEWS, type BoardTilePreferences } from "./model";
import { useBoardTilePreferences } from "./preferences";
import { useBoardOverviewData } from "./data";

export function BoardSummaryTitle({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs, update } = useBoardTilePreferences(size);
  const data = useBoardOverviewData();
  const boards = data.boards.filter((board) => prefs.project === "all" || board.project.id === prefs.project);
  const labels = [...new Set(boards.flatMap((board) => board.labels.map((label) => label.name)))].sort();
  return <TileDisplayMenu name="Project Board" icon={SquareKanban} options={VIEWS} selected={prefs.view}
    recommended={recommendedView(width, height)} active={resolveView(prefs, width, height)} onOpen={onOpen}
    onSelect={(view) => update({ view: view as BoardTilePreferences["view"] })} onReset={() => update(DEFAULTS)}>
    <label>Project<select aria-label="Project scope" value={prefs.project} onChange={(e) => update({ project: e.target.value, label: "all" })}>
      <option value="all">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      {prefs.project !== "all" && !data.projects.some((project) => project.id === prefs.project) && <option value={prefs.project}>Unavailable project</option>}
    </select></label>
    <label>Card order<select aria-label="Card order" value={prefs.sort} onChange={(e) => update({ sort: e.target.value as BoardTilePreferences["sort"] })}>
      <option value="urgency">Needs attention first</option><option value="due">Due date</option><option value="priority">Priority</option><option value="updated">Recently updated</option><option value="board">Board order</option>
    </select></label>
    <label>List density<select aria-label="List density" value={prefs.density} onChange={(e) => update({ density: e.target.value as BoardTilePreferences["density"] })}>
      <option value="auto">Auto</option><option value="compact">Compact</option><option value="comfortable">Comfortable</option>
    </select></label>
    <label>Deadline range<select aria-label="Deadline range" value={prefs.horizon} onChange={(e) => update({ horizon: Number(e.target.value) as BoardTilePreferences["horizon"] })}>
      {[7, 14, 30, 90].map((days) => <option key={days} value={days}>Next {days} days</option>)}
    </select></label>
    <label>Priority filter<select aria-label="Priority filter" value={prefs.priority} onChange={(e) => update({ priority: e.target.value as BoardTilePreferences["priority"] })}>
      <option value="all">All priorities</option><option value="3">High</option><option value="2">Medium</option><option value="1">Low</option><option value="0">None</option>
    </select></label>
    <label>Label filter<select aria-label="Label filter" value={prefs.label} onChange={(e) => update({ label: e.target.value })}>
      <option value="all">All labels</option><option value="none">Unlabelled</option>{labels.map((name) => <option key={name} value={`name:${name}`}>{name}</option>)}
      {prefs.label.startsWith("name:") && !labels.includes(prefs.label.slice(5)) && <option value={prefs.label}>Unavailable label</option>}
    </select></label>
    <label><span>Include completed in card views</span><input type="checkbox" checked={prefs.completed} onChange={(e) => update({ completed: e.target.checked })} /></label>
    <label><span>Include subtasks in counts and views</span><input type="checkbox" checked={prefs.subtasks} onChange={(e) => update({ subtasks: e.target.checked })} /></label>
    <label><span>Show card details when space allows</span><input type="checkbox" checked={prefs.details} onChange={(e) => update({ details: e.target.checked })} /></label>
    <p className="tile-display-note">Progress includes completed cards. Attention and label views show open work. Archived cards are excluded. Column limits use full column counts.</p>
  </TileDisplayMenu>;
}
