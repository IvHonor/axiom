// Picking a handle: all anyone needs for friends. Sharing nothing, and not
// on the Playground's boards until they choose to join them.
import { useEffect, useState } from "react";
import { AtSign } from "lucide-react";
import { getProfile } from "../../lib/account";
import * as api from "./api";
import { handleProblem, tidyHandle } from "./Join";
import { myLemma, refresh, setMe } from "./store";

export function HandleForm() {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getProfile().then((p) => { if (live && p.displayName) setHandle((h) => h || tidyHandle(p.displayName!)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const problem = handle ? handleProblem(handle) : null;
  const save = async () => {
    if (!handle || problem) return;
    setBusy(true);
    setError(null);
    try {
      setMe(await api.saveMe(handle, false, [], myLemma(), false));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pg-handle-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <span className="pg-handle-icon"><AtSign size={18} /></span>
      <strong>Pick a handle</strong>
      <p>It's how friends find you. Your email is never shown, and nothing else is shared. Choose carefully: it can't be changed later.</p>
      <span className="pg-handle-input" data-invalid={!!problem || undefined}>
        <span aria-hidden="true">@</span>
        <input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, "").toLowerCase().slice(0, 20))} placeholder="ada_lovelace" aria-label="Handle" autoComplete="off" spellCheck={false} aria-invalid={!!problem} />
      </span>
      {(problem || error) && <small className={error ? "pg-error" : undefined}>{error ?? problem}</small>}
      <button type="submit" className="pg-enter" disabled={busy || !handle || !!problem}>Save handle</button>
    </form>
  );
}
