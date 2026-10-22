import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api } from "./api";

/** Covers already loaded this session, by address. */
const loaded = new Map<string, string>();
const failed = new Set<string>();

/** A cover from the disk cache (or downloaded once); a lettered spine when there isn't one. */
export function Cover({ url, title, size = "md" }: { url: string | null; title: string; size?: "sm" | "md" | "lg" }) {
  const [src, setSrc] = useState(() => (url ? loaded.get(url) ?? null : null));

  useEffect(() => {
    if (!url || failed.has(url)) return setSrc(null);
    const known = loaded.get(url);
    if (known) return setSrc(known);
    let live = true;
    api.cover(url).then(
      (data) => {
        loaded.set(url, data);
        if (live) setSrc(data);
      },
      () => {
        failed.add(url);
        if (live) setSrc(null);
      },
    );
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <span className={`rd-cover is-${size}`} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span className="rd-cover-blank">{title.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

/** Five stars in halves. Clicking the left half of a star gives a half. */
export function Stars({ value, onChange, size = 16 }: { value: number | null; onChange?: (rating: number | null) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <span
      className={`rd-stars${onChange ? " is-editable" : ""}`}
      role={onChange ? "radiogroup" : "img"}
      aria-label={value ? `Rated ${value / 2} out of 5` : "Not rated"}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = shown >= n * 2 ? 100 : shown === n * 2 - 1 ? 50 : 0;
        const pick = (e: React.MouseEvent<HTMLElement>) => {
          const box = e.currentTarget.getBoundingClientRect();
          return e.clientX - box.left < box.width / 2 ? n * 2 - 1 : n * 2;
        };
        const star = (
          <span className="rd-star" style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={1.5} className="rd-star-empty" />
            <span className="rd-star-fill" style={{ width: `${fill}%` }}>
              <Star size={size} strokeWidth={1.5} />
            </span>
          </span>
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n * 2}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseMove={(e) => setHover(pick(e))}
            onClick={(e) => {
              const picked = pick(e);
              onChange(picked === value ? null : picked);
            }}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

/** A thin progress bar. */
export function Progress({ percent, label }: { percent: number | null; label?: string }) {
  return (
    <span className="rd-progress" role="progressbar" aria-valuenow={Math.round(percent ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${percent ?? 0}%` }} />
    </span>
  );
}
