import { useEffect, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { api, type Board, type TaskCard } from "./api";
import { Card, taskKey } from "./Card";
import { BoardColumn, InlineInput } from "./Column";

/** Tasks grouped by column id, in display order. */
type Lanes = Record<string, TaskCard[]>;

function lanesOf(board: Board, visible: (task: TaskCard) => boolean): Lanes {
  const lanes: Lanes = {};
  for (const column of board.columns) lanes[column.id] = [];
  for (const task of board.tasks) if (visible(task)) lanes[task.columnId]?.push(task);
  return lanes;
}

interface BoardColumnsProps {
  board: Board;
  /** Which tasks the filter bar lets through. */
  visible: (task: TaskCard) => boolean;
  /** Runs a change, reports any error, then reloads the board. */
  act: (change: () => Promise<unknown>) => Promise<void>;
  onOpenTask: (id: string) => void;
}

/** The columns and cards, with drag and drop between and within columns. */
export function BoardColumns({ board, visible, act, onOpenTask }: BoardColumnsProps) {
  // Local copy of the lanes so cards can move instantly while dragging; it
  // resets whenever a fresh board arrives from Rust.
  const [lanes, setLanes] = useState<Lanes>(() => lanesOf(board, visible));
  const [active, setActive] = useState<TaskCard | null>(null);
  const [startColumn, setStartColumn] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

  useEffect(() => setLanes(lanesOf(board, visible)), [board, visible]);

  const sensors = useSensors(
    // A 5px threshold keeps a plain click as "open the card".
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space picks up and drops; Enter is left free to open the card.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  /** Which column a draggable or droppable id belongs to. */
  function laneOf(id: UniqueIdentifier): string | undefined {
    const key = String(id);
    if (key.startsWith("col-")) return key.slice(4);
    for (const [column, tasks] of Object.entries(lanes)) {
      if (tasks.some((t) => taskKey(t.id) === key)) return column;
    }
  }

  function onDragStart({ active }: DragStartEvent) {
    const column = laneOf(active.id);
    setStartColumn(column ?? null);
    setActive(column === undefined ? null : (lanes[column].find((t) => taskKey(t.id) === active.id) ?? null));
  }

  // Crossing into another column moves the card there right away, so the
  // column opens a gap for it.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = laneOf(active.id);
    const to = laneOf(over.id);
    if (from === undefined || to === undefined || from === to) return;
    setLanes((prev) => {
      const task = prev[from].find((t) => taskKey(t.id) === active.id);
      if (!task) return prev;
      const target = prev[to];
      const overIndex = target.findIndex((t) => taskKey(t.id) === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((t) => t.id !== task.id),
        [to]: [...target.slice(0, index), { ...task, columnId: to }, ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const column = laneOf(active.id);
    const task = column === undefined ? undefined : lanes[column].find((t) => taskKey(t.id) === active.id);
    setActive(null);
    if (!over || !task || column === undefined) {
      setLanes(lanesOf(board, visible));
      return;
    }

    // Reorder inside the final column.
    let list = lanes[column];
    const from = list.findIndex((t) => t.id === task.id);
    const overIndex = list.findIndex((t) => taskKey(t.id) === over.id);
    if (overIndex >= 0 && overIndex !== from) list = arrayMove(list, from, overIndex);
    setLanes({ ...lanes, [column]: list });

    const index = list.findIndex((t) => t.id === task.id);
    const original = startColumn === null ? [] : (lanesOf(board, visible)[startColumn] ?? []);
    const unchanged =
      column === startColumn && original.findIndex((t) => t.id === task.id) === index;
    if (unchanged) return;

    const before = list[index + 1]?.id ?? null;
    act(() => api.moveTask(task.id, column, before));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => (setActive(null), setLanes(lanesOf(board, visible)))}
    >
      <div className="pb-board">
        {board.columns.map((column, i) => (
          <BoardColumn
            key={column.id}
            column={column}
            tasks={lanes[column.id] ?? []}
            labels={board.labels}
            templates={board.templates}
            isFirst={i === 0}
            isLast={i === board.columns.length - 1}
            onOpenTask={onOpenTask}
            onAddTask={(title) => act(() => api.createTask(column.id, title))}
            onAddFromTemplate={(templateId) => act(() => api.createFromTemplate(templateId, column.id))}
            onDeleteTemplate={(templateId) => act(() => api.deleteTemplate(templateId))}
            onUpdate={(fields) => act(() => api.updateColumn(column.id, fields))}
            onMove={(direction) => act(() => api.moveColumn(column.id, direction))}
            onDelete={() => act(() => api.deleteColumn(column.id))}
          />
        ))}

        <div className="pb-new-column">
          {addingColumn ? (
            <InlineInput
              initial=""
              placeholder="Column name"
              onSubmit={(name) => {
                setAddingColumn(false);
                act(() => api.createColumn(board.project.id, name));
              }}
              onCancel={() => setAddingColumn(false)}
            />
          ) : (
            <button className="pb-add" onClick={() => setAddingColumn(true)}>
              <Plus size={14} strokeWidth={1.75} /> Add column
            </button>
          )}
        </div>
      </div>

      <DragOverlay>{active && <Card task={active} labels={board.labels} overlay />}</DragOverlay>
    </DndContext>
  );
}
