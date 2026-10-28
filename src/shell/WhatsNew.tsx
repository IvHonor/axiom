import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { unseen, type Release } from "./releaseNotes";

/** The last version whose news was shown here. */
const SEEN = "axiom.whatsNew.seen";

function readSeen(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN) ?? "null");
    return typeof saved === "string" ? saved : null;
  } catch {
    return null;
  }
}

function markSeen(version: string) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(version));
  } catch {
    // Storage unavailable: it shows again next time, which is harmless.
  }
}

/** Once after an update: what the new version brings. `version` is the one running, once known. */
export function WhatsNew({ version, onOpenLemma }: { version: string | null; onOpenLemma: () => void }) {
  const [news, setNews] = useState<Release[]>([]);
  useEffect(() => {
    if (!version) return;
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
