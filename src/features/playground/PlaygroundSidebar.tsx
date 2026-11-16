import { useState, type ReactNode } from "react";
import { ArrowUpRight, Users } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Switch } from "../../shell/ui/Switch";
import { Duo } from "./Duo";
import { FriendsDialog } from "./FriendsDialog";
import { HandleForm } from "./HandleForm";
import { SharingPreferences } from "./SharingPreferences";
import { METRICS, PERIODS, metricInfo } from "./metrics";
import { usePlaygroundOptions, setBoardFilters, type BoardFilters } from "./preferences";
import { usePlayground } from "./store";
import "./preferences.css";

export function PreferenceRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="pg-pref-row"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>{children}</div>;
}

export function PlaygroundSidebar(_props: AreaSidebarProps) {
  const { me, friends, signedIn, error } = usePlayground();
  const { options, update } = usePlaygroundOptions();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const defaultBoard = options.defaultBoard;
  const changeBoard = (change: Partial<BoardFilters>) => {
    const next = { ...defaultBoard, ...change };
    if (!metricInfo(next.metric).global) next.scope = "friends";
    update({ defaultBoard: next });
    setBoardFilters(next);
  };
  const waiting = friends?.incoming.length ?? me?.requests ?? 0;
  return <div className="pg-sidebar pg-preferences" aria-label="Playground preferences">
    {me && <div className="pg-pref-profile">
      <Duo player={me.player} size={38} />
      <div><strong>@{me.player.handle}</strong><small>{me.inPlayground ? `${me.global ? "Friends + Global" : "Friends only"} · ${me.shared.length} ${me.shared.length === 1 ? "activity" : "activities"} shared` : "Not sharing leaderboard scores"}</small></div>
    </div>}
    <button className="pg-pref-friends" onClick={() => setFriendsOpen(true)} aria-haspopup="dialog" aria-expanded={friendsOpen}>
      <Users size={16} /><span><strong>View friends</strong><small>{friends?.friends.length ?? 0} friends{waiting ? ` · ${waiting} ${waiting === 1 ? "request" : "requests"}` : " · Codes, requests and cheers"}</small></span><ArrowUpRight size={14} />
    </button>
    {friendsOpen && <FriendsDialog onClose={() => setFriendsOpen(false)} />}
    {!signedIn ? <p className="pg-side-note">Sign in through Account to manage leaderboard participation.</p>
      : me === undefined ? <p className="pg-side-note" role="status">{error ?? "Loading your Playground preferences…"}</p>
      : me === null ? <HandleForm /> : <SharingPreferences key={me.player.userId} me={me} />}

    <section className="pg-pref-section" aria-label="Default leaderboard">
      <h3>Default leaderboard</h3><p>Choose your starting board. Changing these also updates the open leaderboard.</p>
      <label className="pg-pref-field">Activity<select aria-label="Default activity" value={defaultBoard.metric} onChange={e => changeBoard({ metric: e.target.value })}>
        {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select></label>
      <div className="pg-pref-fields">
        <label className="pg-pref-field">Audience<select aria-label="Default audience" value={defaultBoard.scope} onChange={e => changeBoard({ scope: e.target.value as BoardFilters["scope"] })}>
          <option value="friends">Friends</option><option value="global" disabled={!metricInfo(defaultBoard.metric).global}>Global</option>
        </select></label>
        <label className="pg-pref-field">Period<select aria-label="Default period" value={defaultBoard.period} onChange={e => changeBoard({ period: e.target.value as BoardFilters["period"] })}>
          {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select></label>
      </div><p>Viewing Global rankings does not publish your scores.</p>
    </section>
    <section className="pg-pref-section" aria-label="In-app alerts">
      <h3>In-app alerts</h3><p>Notices while the leaderboards are open.</p>
      {([ ["cheers", "Cheers from friends"], ["overtaken", "When your rank drops"], ["results", "Weekly and monthly results"] ] as const).map(([id, label]) =>
        <PreferenceRow key={id} label={label}><Switch label={label} on={options.alerts[id]} onChange={on => update({ alerts: { ...options.alerts, [id]: on } })} /></PreferenceRow>)}
    </section>
    <section className="pg-pref-section" aria-label="Leaderboard appearance">
      <h3>Appearance</h3>
      {([ ["compact", "Compact rows"], ["companions", "Show companions"], ["podium", "Show podium"], ["reducedMotion", "Reduce animations"] ] as const).map(([id, label]) =>
        <PreferenceRow key={id} label={label}><Switch label={label} on={options[id]} onChange={on => update({ [id]: on })} /></PreferenceRow>)}
      <p>Display preferences save automatically. Your system’s reduced-motion setting is always respected.</p>
    </section>
  </div>;
}
