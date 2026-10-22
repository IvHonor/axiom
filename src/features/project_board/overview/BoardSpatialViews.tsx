import { useState, type CSSProperties } from "react";
import { colorOf, shortDate } from "../palette";
import { addDays, dayIndex, isDone, type BoardTilePreferences, type OverviewCard } from "./model";
import { CardRow, PagedRows, Pager, type CardActions, type WorkflowColumn } from "./BoardOverviewParts";

export function MiniKanban({ columns, width, height, prefs, today, actions }: { columns: WorkflowColumn[]; width: number; height: number; prefs: BoardTilePreferences; today: string; actions: CardActions }) {
  const [requested, setPage] = useState(0);
  const count = Math.max(2, Math.floor(width / 185));
  const pages = Math.max(1, Math.ceil(columns.length / count));
  const page = Math.min(requested, pages - 1);
  const row = prefs.density === "compact" ? 42 : 60;
  const laneHeight = height - (pages > 1 ? 25 : 0);
  return <div className="pb-ov-kanban">
    <div className="pb-ov-lanes" style={{ gridTemplateColumns: `repeat(${Math.min(count, Math.max(1, columns.length))}, minmax(0, 1fr))` }}>
      {columns.slice(page * count, (page + 1) * count).map((entry) => <section className="pb-ov-lane" key={entry.column.id} style={{ "--project": colorOf(entry.board.project.color) } as CSSProperties}>
        <header title={`${entry.board.project.name} · ${entry.column.name}`}><strong className="pb-ov-ellipsis">{entry.column.name}</strong><span className={entry.column.wipLimit !== null && entry.actual > entry.column.wipLimit ? "is-overdue" : ""}>{entry.actual}{entry.column.wipLimit !== null && `/${entry.column.wipLimit}`}</span><small className="pb-ov-ellipsis">{entry.board.project.name}</small></header>
        <PagedRows key={`${entry.column.id}-${prefs.completed}-${prefs.subtasks}-${prefs.sort}-${prefs.label}-${prefs.priority}-${row}`} rows={entry.cards.map((card) => ({ id: card.id, node: <CardRow card={card} today={today} prefs={prefs} row={row} actions={actions} /> }))}
          height={laneHeight - 48} row={row} empty={entry.column.isDone && !prefs.completed ? "Completed cards hidden" : "No matching cards"} label={`${entry.board.project.name} ${entry.column.name} cards`} />
      </section>)}
      {!columns.length && <p className="pb-ov-empty">No columns in this project. Open the board to add one.</p>}
    </div>
    {pages > 1 && <Pager page={page} pages={pages} start={page * count + 1} end={Math.min(columns.length, (page + 1) * count)} total={columns.length} label="columns" onPage={setPage} />}
  </div>;
}

export function DeadlineTimeline({ cards, today, prefs, height, row, open, showUndated }: { cards: OverviewCard[]; today: string; prefs: BoardTilePreferences; height: number; row: number; open: CardActions["open"]; showUndated: () => void }) {
  const from = addDays(today, -3);
  const to = addDays(today, prefs.horizon - 1);
  const start = dayIndex(from), end = dayIndex(to), span = end - start + 1;
  const dated = cards.filter((card) => card.dueDate || card.startDate);
  const included = dated.filter((card) => (card.startDate ?? card.dueDate!) <= to || (card.dueDate && card.dueDate <= to));
  const position = (day: string) => Math.max(0, Math.min(100, (dayIndex(day) - start) / span * 100));
  const ticks = Array.from({ length: 5 }, (_, i) => Math.floor(i * (span - 1) / 4));
  return <div className="pb-ov-timeline">
    <div className="pb-ov-timeline-note"><span>{shortDate(from)}–{shortDate(to)} · older overdue cards stay visible</span><button onClick={showUndated}>{cards.length - dated.length} undated ↗</button></div>
    <div className="pb-ov-timeline-axis"><span>Card</span><div>{ticks.map((offset) => <time key={offset} style={{ left: `${offset / span * 100}%` }}>{shortDate(addDays(from, offset))}</time>)}</div></div>
    <PagedRows height={height - 44 - (dated.length > included.length ? 18 : 0)} row={row} label="timeline" empty={dated.length ? "Dated cards fall beyond this range. Increase the deadline range in display options." : "No dated cards. Set start or due dates in the board."}
      rows={included.map((card) => {
        const last = card.dueDate ?? card.startDate!;
        const first = card.startDate && card.startDate <= last ? card.startDate : last;
        const left = Math.min(98, position(first));
        const right = Math.min(100, (dayIndex(last) - start + 1) / span * 100);
        const overdue = !!card.dueDate && card.dueDate < today && !isDone(card);
        return { id: card.id, node: <button className="pb-ov-timeline-row" onClick={() => open(card.projectId, card.id)} title={`${card.title}\n${card.project.name}\n${card.startDate ? `Start ${card.startDate}` : "No start date"} · ${card.dueDate ? `Due ${card.dueDate}` : "No due date"}`}>
          <span className="pb-ov-ellipsis">{card.title}</span><div className="pb-ov-timeline-track">
            <i className="pb-ov-today" style={{ left: `${position(today)}%` }} />
            <span className={`pb-ov-timeline-bar ${overdue ? "is-overdue" : ""}`} style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%`, "--project": colorOf(card.project.color) } as CSSProperties}>{overdue ? "Overdue" : !card.dueDate ? "Start" : shortDate(card.dueDate)}</span>
          </div>
        </button> };
      })} />
    {dated.length > included.length && <small className="pb-ov-range-excluded">{dated.length - included.length} cards beyond this range</small>}
  </div>;
}
