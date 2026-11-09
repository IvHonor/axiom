import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { readSetting, saveSetting } from "../lib/settings";
import { compareVersions, unseen, type Release } from "./releaseNotes";
import { firstRanHere } from "./firstRun";

/** The last version whose news was shown, on any of the person's computers. */
const SEEN = "axiom.whatsNew.seen";

function readSeen(): string | null {
  const saved = readSetting(SEEN);
  return typeof saved === "string" ? saved : null;
}

/** Never goes back: a computer not updated yet mustn't show another's news again. */
function markSeen(version: string) {
  const seen = readSeen();
  if (seen === null || compareVersions(version, seen) > 0) saveSetting(SEEN, version);
}

/** Once after an update: what the new version brings. `version` is the one running, once known. */
export function WhatsNew({ version, onOpenLemma }: { version: string | null; onOpenLemma: () => void }) {
  const [news, setNews] = useState<Release[]>([]);
  useEffect(() => {
    if (!version) return;
    // New here: the tour shows them round instead of every release so far.
    if (readSeen() === null && firstRanHere()) return markSeen(version);
    const fresh = unseen(readSeen(), version);
    if (fresh.length) setNews(fresh);
    else markSeen(version);
  }, [version]);

  if (!version || !news.length) return null;
  const done = () => {
    markSeen(version);
    setNews([]);
  };
  return (
    <Modal title={`What’s new in Axiom ${version}`} icon={<Sparkles size={16} strokeWidth={1.75} />} onClose={done} width={520} className="whats-new">
      {news.map((release) => (
        <section key={release.version} className="whats-new-release">
          <h3>{release.title}</h3>
          <p className="whats-new-intro">{release.intro}</p>
          <ul>
            {release.points.map((point) => (
              <li key={point.title}>
                <strong>{point.title}</strong>
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="row whats-new-actions">
        <button
          className="btn"
          onClick={() => {
            done();
            onOpenLemma();
          }}
        >
          Open Lemma
        </button>
        <button className="btn btn-ghost" onClick={done}>
          Later
        </button>
      </div>
    </Modal>
  );
}
