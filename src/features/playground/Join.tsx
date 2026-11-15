// Entering the Playground (and, once in, changing how you appear): a handle,
// your Lemma stepping through the portal, what you share, and whether
// strangers can see you on the global boards.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Globe2, LogOut, ShieldCheck, Users } from "lucide-react";
import { getProfile } from "../../lib/account";
import { useInstalled } from "../../shell/useInstalled";
import { findExtension } from "../../extensions";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Switch } from "../../shell/ui/Switch";
import { Face } from "../lemma/Face";
import { useAssistantName, usePersona } from "../lemma/persona";
import { lineFor } from "./banter";
import { METRICS, SHARE_HINT } from "./metrics";
import * as api from "./api";
import { myLemma, refresh, sendStats, setMe } from "./store";

/** The server's rules (`check_handle`), so mistakes show while typing. */
export function handleProblem(handle: string): string | null {
  if (handle.length < 3 || handle.length > 20) return "3 to 20 characters";
  if (!/^[a-z0-9_]+$/.test(handle)) return "Letters, numbers and _ only";
  if (!/^[a-z]/.test(handle)) return "Start with a letter";
  return null;
}

export const tidyHandle = (text: string) => text.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "x$1").slice(0, 20);

export function Join({ me, onDone }: { me?: api.PlaygroundMe | null; onDone?: () => void }) {
  /** Already on the boards: changing how you appear. Otherwise joining (maybe with a handle already). */
  const editing = !!me?.inPlayground;
  const { isOn } = useInstalled();
  const persona = usePersona();
  const lemma = useAssistantName();
  // Only areas that are on: nothing to share from the rest.
  const available = useMemo(() => METRICS.filter((m) => {
    const ext = findExtension(m.area);
    return m.area === "axiom" || (!!ext && isOn(ext));
  }), [isOn]);
  const [handle, setHandle] = useState(me?.player.handle ?? "");
  const [shared, setShared] = useState<string[]>(() => (editing ? me!.shared : available.map((m) => m.id)));
  const [global, setGlobal] = useState(me?.global ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest a handle from their name.
  useEffect(() => {
    if (me) return;
    let live = true;
    getProfile().then((p) => { if (live && p.displayName) setHandle((h) => h || tidyHandle(p.displayName!)); }).catch(() => {});
    return () => { live = false; };
  }, [me]);

  const problem = handle ? handleProblem(handle) : null;
  const toggle = (id: string) => setShared((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = async () => {
    if (problem || !handle) return;
    setBusy(true);
    setError(null);
    try {
      setMe(await api.saveMe(handle, global, shared, myLemma()));
      await sendStats(true);
      await refresh();
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await api.leave();
      await refresh();
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pg-join" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {!editing && (
        <div className="pg-portal">
          <div className="pg-portal-ring" aria-hidden="true"><span /><span /><span /></div>
          <Face mood="happy" size={150} interactive />
          <p className="pg-bubble">{lineFor(persona.personality, "hello", "join")}</p>
        </div>
      )}
      <header className="pg-join-head">
        <span className="pg-kicker">{editing ? "Your place in the Playground" : "Axiom Playground"}</span>
        <h2>{editing ? "How you appear" : `Bring ${lemma} to the Playground`}</h2>
        {!editing && <p>Compete with friends, cheer each other on, and show off {lemma}. Your friends' AIs come along too, each with its own name.</p>}
      </header>

      {me ? (
        <div className="pg-field">
          <span>Your handle</span>
          <span className="pg-handle-fixed">@{me.player.handle}</span>
          <small>Handles are for good, so friends always know where to find you.</small>
        </div>
      ) : (
        <label className="pg-field">
          <span>Your handle</span>
          <span className="pg-handle-input" data-invalid={!!problem || undefined}>
            <span aria-hidden="true">@</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, "").toLowerCase().slice(0, 20))} placeholder="ada_lovelace" autoComplete="off" spellCheck={false} aria-invalid={!!problem} required />
          </span>
          <small>{problem ?? "Friends add you with it. Choose carefully: it can't be changed later."}</small>
        </label>
      )}

      <fieldset className="pg-share">
        <legend>What you share</legend>
        <div className="pg-share-grid">
          {available.map((m) => {
            const Icon = m.icon;
            const on = shared.includes(m.id);
            return (
              <button type="button" key={m.id} className="pg-share-chip" data-on={on || undefined} aria-pressed={on} onClick={() => toggle(m.id)} style={{ "--chip": m.color } as CSSProperties} title={SHARE_HINT[m.id] ?? m.label}>
                <Icon size={15} />
                <span>{m.label}</span>
                {!m.global && <span className="pg-chip-tag" title="Only on your friends' boards"><Users size={11} /></span>}
              </button>
            );
          })}
        </div>
        <small><ShieldCheck size={13} /> Only totals leave this computer: never what you wrote, read, planned or spent. Turn one off and it's deleted from the Playground.</small>
      </fieldset>

      <div className="pg-global">
        <Globe2 size={18} />
        <div>
          <strong>Global boards</strong>
          <span>Let everyone see you on the boards fair to compare with strangers. Off, only friends see you.</span>
        </div>
        <Switch on={global} onChange={setGlobal} label="Show me on global boards" />
      </div>

      {error && <p className="pg-error" role="alert">{error}</p>}
      <div className="pg-join-actions">
        {editing && (
          <ConfirmButton className="pg-leave" onConfirm={() => void leave()} confirmText="Leave and delete your numbers?">
            <LogOut size={14} /> Leave the Playground
          </ConfirmButton>
        )}
        <button type="submit" className="pg-enter" disabled={busy || !!problem || !handle}>
          {editing ? "Save" : "Enter the Playground"}
        </button>
      </div>
    </form>
  );
}
