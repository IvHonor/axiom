import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Trophy } from "lucide-react";
import { useInstalled } from "../../shell/useInstalled";
import { findExtension } from "../../extensions";
import { Switch } from "../../shell/ui/Switch";
import { Modal } from "../../shell/ui/Modal";
import { METRICS, SHARE_HINT } from "./metrics";
import { changeSharing } from "./store";
import type { PlaygroundMe } from "./api";

export function SharingPreferences({ me }: { me: PlaygroundMe }) {
  const { isOn } = useInstalled();
  const available = useMemo(() => METRICS.filter(m => {
    const ext = findExtension(m.area);
    return m.area === "axiom" || (!!ext && isOn(ext));
  }), [isOn]);
  const participation = !me.inPlayground ? "off" : me.global ? "global" : "friends";
  const [audience, setAudience] = useState(participation);
  const [shared, setShared] = useState(me.shared);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const source = me.shared.join("|");
  useEffect(() => { setAudience(participation); setShared(me.shared); setSaved(false); }, [participation, source]);
  const dirty = audience !== participation || [...shared].sort().join("|") !== [...me.shared].sort().join("|");
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await changeSharing(audience, shared);
      setConfirm(false); setSaved(true);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  return <section className="pg-pref-section pg-pref-sharing" aria-label="Leaderboard participation" aria-busy={busy}>
    <h3><Trophy size={14} /> Participation</h3>
    <label className="pg-pref-field">Who can see your scores?<select aria-label="Leaderboard participation" value={audience} disabled={busy} onChange={e => { setAudience(e.target.value); setSaved(false); }}>
      <option value="off">Off — browse only</option><option value="friends">Friends only</option><option value="global">Friends + Global</option>
    </select></label>
    <p>{audience === "off" ? "Browse rankings without publishing scores. Turning participation off deletes your shared totals; your handle and friends stay." : audience === "global" ? "Friends see the activities you share. Everyone can see your scores on eligible global boards." : "Only friends can see the activity totals you share."}</p>
    <details className="pg-pref-activities">
      <summary>Activities you share <span>{shared.length}</span></summary>
      <fieldset disabled={busy || audience === "off"}>
        <legend className="sr-only">Shared activity totals</legend>
        {available.map(m => <div key={m.id} className="pg-pref-row"><span><strong>{m.label}</strong><small>{m.global ? SHARE_HINT[m.id] : "Friends only"}</small></span>
          <Switch label={`Share ${m.label.toLowerCase()}`} on={shared.includes(m.id)} disabled={busy || audience === "off"}
            onChange={on => { setShared(all => on ? [...all, m.id] : all.filter(id => id !== m.id)); setSaved(false); }} />
        </div>)}
      </fieldset>
    </details>
    <p className="pg-pref-privacy"><ShieldCheck size={14} /> Only activity totals are shared. Your journal entries, task names and private content stay private. Disabling an activity deletes its published totals.</p>
    {error && <p className="pg-error" role="alert">{error}</p>}
    <button className="pg-enter pg-pref-save" disabled={!dirty || busy} onClick={() => { if (audience === "off" && me.inPlayground) setConfirm(true); else void save(); }}>
      {busy ? "Saving…" : "Save sharing preferences"}
    </button>
    {saved && <p role="status" className="pg-pref-saved">Sharing preferences saved.</p>}
    {confirm && <Modal title="Leave leaderboards?" onClose={() => { if (!busy) setConfirm(false); }} width={420} className="pg-modal">
      <p>Your published scores will be deleted. Your handle, friends and personal activity records stay. You can join again whenever you want.</p>
      {error && <p role="alert" className="pg-error">{error}</p>}
      <div className="pg-pref-confirm"><button className="btn" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
        <button className="pg-enter" disabled={busy} onClick={() => void save()}>{busy ? "Leaving…" : "Leave leaderboards"}</button></div>
    </Modal>}
  </section>;
}
