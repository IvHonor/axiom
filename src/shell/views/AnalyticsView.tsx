import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, ChartColumn, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { useAreaName } from "../../features/lemma/persona";
import { today } from "../../features/daily_plan/time";
import { useDataChanged } from "../../lib/sync";
import { isCurrent, periodName, periodOf, periodRange, previousName, shiftPeriod, type Period, type PeriodUnit } from "../analytics/period";
import { Delta, Sparkline } from "../ui/charts/Charts";
import { ExtensionIcon, extensionStyle } from "../ui/ExtensionIcon";
import { usePersistentState } from "../usePersistentState";
import "./analytics.css";

interface AnalyticsViewProps {
  /** Installed areas that are switched on; those with analytics show. */
  areas: ExtensionManifest[];
  onOpen: (id: string) => void;
}

/** The tab with every area's headline. */
const OVERVIEW = "overview";

/** What one area's report is doing. */
type Loaded = { report?: unknown; error?: string };

/** A week or month across every area: an overview of headlines, and a tab per area. */
export function AnalyticsView({ areas, onOpen }: AnalyticsViewProps) {
  const nameOf = useAreaName();
  const [unit, setUnit] = usePersistentState<PeriodUnit>("axiom.analytics.unit.v1", (saved) => (saved === "month" ? "month" : "week"));
  const [tab, setTab] = usePersistentState<string>("axiom.analytics.tab.v1", (saved) => (typeof saved === "string" ? saved : OVERVIEW));
  const [period, setPeriod] = useState<Period>(() => periodOf(unit, today()));
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [loading, setLoading] = useState(true);
  const asked = useRef(0);
  // Life areas first; the assistant, which works across them, last.
  const shown = areas.filter((ext) => ext.area?.analytics).sort((a, b) => Number(a.id === "lemma") - Number(b.id === "lemma"));
  const ids = shown.map((ext) => ext.id).join();
  // An area since switched off falls back to the overview.
  const area = shown.find((ext) => ext.id === tab);
  const active = area?.id ?? OVERVIEW;

  // Today moves on at midnight; periods are always built from it fresh.
  const current = periodOf(period.unit, period.start);

  const load = useCallback(() => {
    const ask = ++asked.current;
    setLoading(true);
    Promise.all(
      shown.map(async (ext): Promise<[string, Loaded]> => {
        try {
          return [ext.id, { report: await ext.area!.analytics!.load(current) }];
        } catch (e) {
          return [ext.id, { error: typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong. Try again." }];
        }
      }),
    ).then((entries) => {
      // A slower, older request mustn't overwrite a newer one.
      if (ask !== asked.current) return;
      setLoaded(Object.fromEntries(entries));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, current.unit, current.start, current.today]);
  useEffect(load, [load]);
  useDataChanged(load);

  const pick = (next: PeriodUnit) => {
    setUnit(next);
    setPeriod(periodOf(next, isCurrent(current) ? current.today : current.start));
  };

  /** Arrow keys, Home and End move along the tabs. */
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = [OVERVIEW, ...shown.map((ext) => ext.id)];
    const at = tabs.indexOf(active);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    setTab(next);
    document.getElementById(`analytics-tab-${next}`)?.focus();
  };

  if (shown.length === 0) {
    return (
      <div className="empty-state">
        <ChartColumn size={40} strokeWidth={1.25} />
        <div className="empty-title">No analytics yet</div>
        <p className="empty-text">Switch on an area, use it for a few days, and how it's going shows here.</p>
      </div>
    );
  }

  const inProgress = isCurrent(current);
  return (
    <div className={`analytics${loading ? " is-loading" : ""}`}>
      <header className="analytics-head">
        <div className="analytics-title">
          <h1>Analytics</h1>
          <p className="dim">How {inProgress ? `${periodName(current).toLowerCase()} is` : `${periodName(current)} was`} going, across your areas.</p>
        </div>
        <div className="analytics-controls">
          <div className="pb-segmented" role="radiogroup" aria-label="Period">
            {(["week", "month"] as const).map((u) => (
              <button key={u} role="radio" aria-checked={current.unit === u} className={current.unit === u ? "is-active" : undefined} onClick={() => pick(u)}>
                {u === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <div className="analytics-nav">
            <button className="icon-btn" aria-label={`Previous ${current.unit}`} onClick={() => setPeriod(shiftPeriod(current, -1))}>
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span className="analytics-period">
              <b>{periodName(current)}</b>
              <span className="dim">{periodRange(current)}</span>
            </span>
            <button className="icon-btn" aria-label={`Next ${current.unit}`} disabled={inProgress} onClick={() => setPeriod(shiftPeriod(current, 1))}>
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
            {!inProgress && (
              <button className="btn btn-sm btn-ghost" onClick={() => setPeriod(periodOf(current.unit, current.today))}>
                This {current.unit}
              </button>
            )}
          </div>
        </div>
      </header>
      {inProgress && (
        <p className="analytics-note dim">
          While this {current.unit} is still going, it's compared with the same number of days of {previousName(current)}.
        </p>
      )}

      <div className="analytics-tabbar">
        <TabStrip active={active} onKeyDown={step}>
          {[null, ...shown].map((ext) => {
            const id = ext?.id ?? OVERVIEW;
            const selected = id === active;
            return (
              <button
                key={id}
                id={`analytics-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls={`analytics-${id}`}
                tabIndex={selected ? 0 : -1}
                className={`analytics-tab${selected ? " is-active" : ""}`}
                style={ext ? seriesStyle(ext) : undefined}
                onClick={() => setTab(id)}
              >
                {ext ? <ExtensionIcon ext={ext} size={14} /> : <LayoutGrid size={14} strokeWidth={1.75} />}
                {ext ? nameOf(ext) : "Overview"}
              </button>
            );
          })}
        </TabStrip>
        {area && (
          <button className="btn btn-sm btn-ghost analytics-open" onClick={() => onOpen(area.id)}>
            Open {nameOf(area)} <ArrowUpRight size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {area ? (
        <AreaPanel ext={area} loaded={loaded[area.id]} period={current} onOpen={() => onOpen(area.id)} />
      ) : (
        <section id={`analytics-${OVERVIEW}`} className="analytics-scorecard" role="tabpanel" aria-labelledby={`analytics-tab-${OVERVIEW}`}>
          {shown.map((ext) => {
            const { report, error } = loaded[ext.id] ?? {};
            const head = report === undefined ? null : ext.area!.analytics!.headline(report);
            return (
              <button key={ext.id} className="analytics-score" style={seriesStyle(ext)} onClick={() => setTab(ext.id)}>
                <span className="analytics-score-name">
                  <ExtensionIcon ext={ext} size={14} />
                  {nameOf(ext)}
                </span>
                <span className="analytics-score-value">{head?.value.now == null ? "—" : head.measure.format(head.value.now)}</span>
                <span className="analytics-score-label">{head?.label ?? error ?? "Loading…"}</span>
                {head && <Delta value={head.value} measure={head.measure} period={current} />}
                {head && <Sparkline values={head.value.trend} label={`${head.label}, the last ${head.value.trend.length} ${current.unit}s`} />}
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

/**
 * The row of tabs. When they don't fit it scrolls sideways without a
 * scrollbar: the wheel scrolls it, a fade shows which end has more, and the
 * chosen tab is kept in view.
 */
function TabStrip({ active, onKeyDown, children }: { active: string; onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const strip = ref.current;
    if (!strip) return;
    const before = strip.scrollLeft > 1;
    const after = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    setMore((m) => (m.before === before && m.after === after ? m : { before, after }));
  }, []);

  useEffect(() => {
    const strip = ref.current!;
    const wheel = (e: WheelEvent) => {
      // Only an up-and-down wheel over a strip that can move; a sideways swipe scrolls it already.
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(strip);
    strip.addEventListener("scroll", measure, { passive: true });
    strip.addEventListener("wheel", wheel, { passive: false });
    return () => {
      resize.disconnect();
      strip.removeEventListener("scroll", measure);
      strip.removeEventListener("wheel", wheel);
    };
  }, [measure]);

  useEffect(() => {
    ref.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [active, measure]);

  return (
    <div
      ref={ref}
      className={`analytics-tabs${more.before ? " more-before" : ""}${more.after ? " more-after" : ""}`}
      role="tablist"
      aria-label="Areas"
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/** One area's section, under its tab. */
function AreaPanel({ ext, loaded, period, onOpen }: { ext: ExtensionManifest; loaded?: Loaded; period: Period; onOpen: () => void }) {
  const Section = ext.area!.analytics!.Section;
  const { report, error } = loaded ?? {};
  return (
    <section id={`analytics-${ext.id}`} className="analytics-area" style={seriesStyle(ext)} role="tabpanel" aria-labelledby={`analytics-tab-${ext.id}`}>
      {error ? (
        <p className="analytics-error">{error}</p>
      ) : report === undefined ? (
        <p className="dim analytics-wait">Loading…</p>
      ) : (
        <Section report={report} period={period} onOpen={onOpen} />
      )}
    </section>
  );
}

/** Charts in a section draw in the area's colour. */
const seriesStyle = (ext: ExtensionManifest) => ({ ...extensionStyle(ext), "--series": "var(--extension-accent)" }) as CSSProperties;
