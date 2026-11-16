// The Nexus tab: outside, a look in (who's online, and where) and the way in;
// inside, the 3D city with everyone who's there right now (nexus/Nexus.tsx).
// Only people actually in Nexus are there: close it and your AI's gone.
import { lazy, Suspense, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Face } from "../../lemma/Face";
import { useAssistantName } from "../../lemma/persona";
import { HandleForm } from "../HandleForm";
import { PeerLemma } from "../PeerLemma";
import { usePlayground } from "../store";
import { districtOf } from "../nexus/world";
import { peekHub, type HubPeek } from "./api";
import "./hub.css";

// The 3D city (and Three.js with it) loads only when someone steps in.
const Nexus = lazy(() => import("../nexus/Nexus").then((m) => ({ default: m.Nexus })));

export function Hub() {
  const { me, signedIn } = usePlayground();
  const [inside, setInside] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!signedIn) return <div className="hub-outside"><div className="hub-card"><h2>Nexus</h2><p>Sign in to meet everyone's AIs.</p></div></div>;
  if (me === undefined) return <div className="hub-outside"><div className="hub-card"><p>Connecting…</p></div></div>;
  if (inside && me) {
    return (
      <Suspense fallback={<div className="nx" />}>
        <Nexus onLeave={(why) => { setInside(false); setNotice(why ?? null); }} />
      </Suspense>
    );
  }
  return <Outside notice={notice} hasHandle={!!me} onEnter={() => { setNotice(null); setInside(true); }} />;
}

/** Outside: a look in (who's where), and the way in. */
function Outside({ notice, onEnter, hasHandle }: { notice: string | null; onEnter: () => void; hasHandle: boolean }) {
  const lemma = useAssistantName();
  const [peek, setPeek] = useState<HubPeek | null>(null);
  useEffect(() => {
    if (!hasHandle) return;
    let live = true;
    const load = () => peekHub().then((p) => live && setPeek(p), () => {});
    void load();
    const every = window.setInterval(load, 10_000);
    return () => { live = false; window.clearInterval(every); };
  }, [hasHandle]);
  const busy = (peek?.districts ?? []).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  return (
    <div className="hub-outside">
      <div className="hub-outside-crowd" aria-hidden="true">
        {(peek?.nexus ?? []).slice(0, 10).map((p, i) => (
          <span key={p.player.userId} className="hub-peek-ai" style={{ left: `${4 + ((i * 0.37 + (p.x + 52) / 208) % 1) * 88}%`, bottom: `${3 + (1 - (p.z + 52) / 104) * 7}%`, animationDelay: `${-i * 0.6}s` }}>
            <PeerLemma player={p.player} size={54} />
          </span>
        ))}
      </div>
      <div className="hub-card">
        <span className="pg-kicker"><Sparkles size={12} /> Live now</span>
        <h2>Nexus</h2>
        <p>A city of AIs. Walk {lemma} from the Nexus out to the Memory District, the Computation District, the Simulation Chambers and the Model District, and meet whoever's there right now.</p>
        {!hasHandle ? (
          <HandleForm />
        ) : (
          <>
            <div className="hub-outside-me">
              <Face mood="happy" size={92} interactive />
              <div>
                <strong className="hub-outside-online"><i /> {peek ? peek.online : "…"} online</strong>
                <ul>
                  {busy.length ? busy.map((d) => <li key={d.id}><span>{districtOf(d.id).name}</span> <b>{d.count}</b></li>) : <li><span>{peek ? `Quiet right now. ${lemma} could be the first in.` : "Looking in…"}</span></li>}
                </ul>
              </div>
            </div>
            <button className="pg-enter hub-enter" onClick={onEnter}>Enter Nexus</button>
            <small className="hub-privacy">While you're in, everyone near you in Nexus can see your name, picture and AI. Close it and you're gone. People talk with emotes and set phrases only.</small>
          </>
        )}
        {notice && <p className="pg-note" role="status">{notice}</p>}
      </div>
    </div>
  );
}
