// The Playground tile's title: its layout (Automatic, or any that fits), and
// which board and period the board layouts show.
import { openLeaderboards } from "../preferences";
import { Trophy } from "lucide-react";
import { useTileLayout } from "../../../shell/ui/ResizableTile";
import { TileDisplayMenu } from "../../../shell/ui/TileDisplayMenu";
import { Flame, atRisk } from "../Flame";
import { METRICS, PERIODS, metricInfo } from "../metrics";
import { useTileBoard } from "./data";
import { usePlayground } from "../store";
import { DEFAULTS, VIEWS, recommendedView, resolveView, type Preferences } from "./model";
import { usePlaygroundPreferences } from "./preferences";

export function PlaygroundSummaryTitle({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs, update } = usePlaygroundPreferences(size);
  const { me } = usePlayground();
  const metric = metricInfo(prefs.metric);
  const scope = metric.global ? prefs.scope : "friends";
  const openBoards = () => {
    openLeaderboards({ metric: prefs.metric, period: prefs.period, scope });
    onOpen();
  };
  const toolbar = !!me && width >= 170 && height >= 130;
  const bodyHeight = height - (toolbar ? 58 : 0);
  const competing = !!me?.inPlayground;
  const options = VIEWS.map((v) => ({ ...v, height: v.height + (toolbar ? 58 : 0) }));
  // A one-row tile has no room below its title: the pulse goes in the title.
  const inTitle = height < 24;
  const { board } = useTileBoard(prefs.metric, prefs.period, inTitle && !!me, scope);
  const mine = board?.entries.find((e) => e.player.you) ?? board?.you;
  return (
    <span className={`pg-ov-title${width < 125 ? " is-compact" : ""}${inTitle ? " has-pulse" : ""}`}>
      <TileDisplayMenu
        name="Playground"
        icon={Trophy}
        options={options}
        selected={prefs.view}
        recommended={recommendedView(width, bodyHeight, competing)}
        active={resolveView(prefs, width, bodyHeight, competing)}
        onSelect={(view) => update({ view: view as Preferences["view"] })}
        onOpen={openBoards}
        onReset={() => update(DEFAULTS)}
      >
        {competing && (
          <>
            <label>Audience<select aria-label="Leaderboard audience" value={scope} onChange={(e) => update({ scope: e.target.value as Preferences["scope"] })}>
              <option value="friends">Friends</option><option value="global" disabled={!metric.global}>Global</option>
            </select></label>
            <label>Board<select aria-label="Board" value={prefs.metric} onChange={(e) => update({ metric: e.target.value })}>
              {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select></label>
            <label>Period<select aria-label="Period" value={prefs.period} onChange={(e) => update({ period: e.target.value as Preferences["period"] })}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>
          </>
        )}
      </TileDisplayMenu>
      {inTitle && mine && (
        <button className="pg-ov-title-pulse" onClick={openBoards} title={`#${mine.rank} of ${board?.players ?? 1} ${scope === "global" ? "players globally" : "friends"}`}>
          {mine.streak > 0 && <Flame streak={mine.streak} risk={atRisk(mine.streakThrough, mine.asOf)} size={13} />}
          <b>#{mine.rank}</b>
        </button>
      )}
    </span>
  );
}
