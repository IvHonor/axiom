import { AlertTriangle, CalendarClock, LayoutGrid } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { Progress } from "../reading/Cover";
import { COLORS } from "./api";
import { setUniUi, showPage, useUniUi, type UniPage } from "./uniUi";
import { useSummary } from "./useSummary";

/** University's side panel: the term's week, its modules, and what needs doing. */
export function UniSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useUniUi();
  const { summary } = useSummary();
  const current = summary?.terms.find((t) => t.id === summary.current);

  const go = (page: UniPage) => {
    setUniUi({ term: null });
    showPage(page);
    onOpen();
  };
  const navItem = (id: UniPage, label: string, icon: React.ReactNode, count?: number) => (
    <button key={id} className={`nav-item${active && ui.page === id && !ui.module ? " is-active" : ""}`} onClick={() => go(id)}>
      {icon}
      <span className="bs-name">{label}</span>
      {count !== undefined && count > 0 && <span className={id === "behind" ? "un-count-warn" : "rd-count"}>{count}</span>}
    </button>
  );

  return (
    <>
      <Section title={current ? current.name : "University"}>
        {current?.week !== null && current && (
          <div className="us-week">
            <span>
              Week <b>{current.week}</b> of {current.weeks}
            </span>
            <Progress percent={(current.week! / current.weeks) * 100} label="Through the term" />
          </div>
        )}
        {navItem("modules", "Modules", <LayoutGrid size={14} strokeWidth={1.5} />)}
        {navItem("behind", "Behind", <AlertTriangle size={14} strokeWidth={1.5} />, summary?.behind.length)}
        {navItem("upcoming", "Coming up", <CalendarClock size={14} strokeWidth={1.5} />, summary?.upcoming.length)}
      </Section>

      {summary && summary.modules.length > 0 && (
        <Section title="Modules" count={summary.modules.length}>
          <div className="us-modules">
            {summary.modules.map((m) => (
              <button
                key={m.id}
                className={`us-module${active && ui.module === m.id ? " is-active" : ""}`}
                style={{ ["--module" as string]: COLORS[m.color] }}
                onClick={() => {
                  setUniUi({ term: null, module: m.id });
                  onOpen();
                }}
              >
                <span className="us-module-name">
                  <span className="us-dot" />
                  {m.code || m.name}
                  {m.behind > 0 && <span className="un-count-warn">{m.behind}</span>}
                </span>
                <Progress percent={m.percent} label={`${m.name} progress`} />
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
