// Responsive standings shared by desktop and web. Load only the selected board.
import { ArrowUpRight, Globe2, Users } from "lucide-react";
import { openLeaderboards } from "./preferences";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { Face } from "../lemma/Face";
import { useAssistantName } from "../lemma/persona";
import { metricInfo, PERIODS } from "./metrics";
import { resolveView, viewOf } from "./overview/model";
import { usePlaygroundPreferences } from "./overview/preferences";
import { VIEW_COMPONENTS, type ViewProps } from "./overview/views";
import { useTileBoard } from "./overview/data";
import { usePlayground } from "./store";
import "./overview/overview.css";

export function PlaygroundSummary({ onOpen }: { onOpen: () => void }) {
  const { me, friends, signedIn } = usePlayground();
  const { size, width, height } = useTileLayout();
  const { prefs, update } = usePlaygroundPreferences(size);
  const lemma = useAssistantName();
  const competing = !!me?.inPlayground;
  const metric = metricInfo(prefs.metric);
  const scope = metric.global ? prefs.scope : "friends";
  const toolbar = !!me && width >= 170 && height >= 130;
  const bodyHeight = height - (toolbar ? 58 : 0);
  const view = resolveView(prefs, width, bodyHeight, competing);
  const needsBoard = !!me && viewOf(view).boards;
  const { board, error, reload } = useTileBoard(prefs.metric, prefs.period, needsBoard, scope);

  const periodLabel = PERIODS.find(p => p.id === prefs.period)!.label;
  const openBoards = () => {
    openLeaderboards({ metric: prefs.metric, period: prefs.period, scope });
    onOpen();
  };
  if (!width || height < 24) return null;
  if (!signedIn || !me) {
    return (
      <button className="pg-tile is-invite" onClick={openBoards}>
        {height >= 150 && width >= 200 && <Face mood="happy" size={Math.min(84, height - 80)} alive={false} />}
        <span>
          <strong>{signedIn ? "Pick a handle" : `Bring ${lemma} to the Playground`}</strong>
          {height >= 70 && <small>{signedIn ? "Compare your progress with friends and global rankings." : "Sign in to compare progress with friends and the world."}</small>}
        </span>
        <ArrowUpRight size={14} />
      </button>
    );
  }

  const props: ViewProps = {
    width, height: bodyHeight, me, board, friends,
    metric, period: prefs.period,
    onOpen: openBoards, openBoards,
  };
  const Layout = VIEW_COMPONENTS[view];
  return (
    <div className={`pg-ov${toolbar ? " has-toolbar" : ""}`} data-view={view} data-scope={scope}>
      {toolbar && <div className="pg-ov-toolbar">
        <div className="pg-ov-scope" role="group" aria-label="Leaderboard audience">
          <button aria-pressed={scope === "friends"} onClick={() => update({ scope: "friends" })}><Users size={12} /> Friends</button>
          <button aria-pressed={scope === "global"} disabled={!metric.global} title={metric.global ? undefined : "This board is friends only"}
            onClick={() => update({ scope: "global" })}><Globe2 size={12} /> Global</button>
        </div>
        <span className="pg-ov-board-caption" title={`${metric.label} · ${periodLabel}`}>
          {metric.label} · {periodLabel}
        </span>
      </div>}
      <div className="pg-ov-content">
        {error && !board ? (
          <button className="pg-ov-retry" onClick={reload} title={error}>Couldn't load rankings · Retry</button>
        ) : <Layout {...props} />}
      </div>
    </div>
  );
}
