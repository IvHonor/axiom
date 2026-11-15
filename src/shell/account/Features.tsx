// Lemma and the Playground: part of Axiom rather than extensions, so they're
// switched on and off here. To be on the Playground's boards, the Playground
// has to be on: switching it off takes you off them (friends stay).
import { useState } from "react";
import { SlidersHorizontal, Sparkles, Trophy } from "lucide-react";
import * as playground from "../../features/playground/api";
import { refresh, usePlayground } from "../../features/playground/store";
import { useAssistantName } from "../../features/lemma/persona";
import { Switch } from "../ui/Switch";
import { ErrorNote } from "./fields";

export interface FeatureSwitches {
  isOn: (id: string) => boolean;
  setEnabled: (id: string, on: boolean) => void;
}

export function Features({ isOn, setEnabled, signedIn }: FeatureSwitches & { signedIn: boolean }) {
  const lemma = useAssistantName();
  const { me } = usePlayground();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPlayground = (on: boolean) => {
    setError(null);
    // On the boards: leaving them comes first, and is asked about.
    if (!on && signedIn && me?.inPlayground) return setConfirming(true);
    setEnabled("playground", on);
  };
  const leaveAndTurnOff = async () => {
    setBusy(true);
    try {
      await playground.leave();
      await refresh();
      setEnabled("playground", false);
      setConfirming(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-section features">
      <h3 className="account-section-head"><SlidersHorizontal size={14} strokeWidth={1.75} />Features</h3>
      <div className="account-section-body">
        <div className="feature-row">
          <Sparkles size={16} />
          <span><strong>{lemma}</strong><small>Your assistant and companion, across every area.</small></span>
          <Switch on={isOn("lemma")} onChange={(on) => setEnabled("lemma", on)} label={`${lemma} on`} />
        </div>
        <div className="feature-row">
          <Trophy size={16} />
          <span><strong>Playground</strong><small>Leaderboards with your friends. Friends stay in the top bar either way.</small></span>
          <Switch on={isOn("playground")} onChange={setPlayground} label="Playground on" disabled={busy} />
        </div>
        {confirming && (
          <div className="feature-confirm" role="alertdialog" aria-label="Turn off the Playground">
            <p>You're on the Playground's boards. Turning it off takes you off them and deletes your numbers there. Your handle and friends stay.</p>
            <div>
              <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Keep it on</button>
              <button className="btn btn-sm btn-ghost is-danger" onClick={() => void leaveAndTurnOff()} disabled={busy}>Leave and turn off</button>
            </div>
          </div>
        )}
        <ErrorNote error={error} />
      </div>
    </section>
  );
}
