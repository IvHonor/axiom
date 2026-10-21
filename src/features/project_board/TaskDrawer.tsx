import { useEffect, useState, type CSSProperties } from "react";
import Markdown, { type Components } from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Archive, Check, CornerLeftUp, History, LayoutTemplate, ListTree, Plus, Tag, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type Board, type Recurrence, type TaskDetail, type TaskFields } from "./api";
import { colorOf, COLORS, PRIORITIES, RECURRENCES, timeAgo } from "./palette";

interface TaskDrawerProps {
  taskId: string;
  board: Board;
  onClose: () => void;
  /** Switches the drawer to another task (a parent or sub-task). */
  onOpenTask: (id: string) => void;
  /** Runs a change, reports any error, then reloads the board. */
  act: (change: () => Promise<unknown>) => Promise<void>;
  onError: (message: string) => void;
}

const fieldsOf = (t: TaskDetail): TaskFields => ({
  title: t.title,
  description: t.description,
  priority: t.priority,
  startDate: t.startDate,
  dueDate: t.dueDate,
  estimate: t.estimate,
  recurrence: t.recurrence,
});

/** The back of a card: every detail of one task, edited in place. */
export function TaskDrawer({ taskId, board, onClose, onOpenTask, act, onError }: TaskDrawerProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);

  const refresh = () =>
    api
      .getTask(taskId)
      .then(setTask)
      .catch((e) => onError(errorMessage(e)));

  useEffect(() => {
    setTask(null);
    refresh();
  }, [taskId]);
  useDataChanged(refresh);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Runs a change, then refreshes both this drawer and the board. */
  const change = (fn: () => Promise<unknown>) => act(fn).then(refresh);

  const save = (patch: Partial<TaskFields>) => {
    if (!task) return;
    const next = { ...fieldsOf(task), ...patch };
    setTask({ ...task, ...patch }); // show it straight away
    change(() => api.updateTask(task.id, next));
  };

  return (
    <>
      <div className="pb-scrim" onClick={onClose} />
      <aside className="pb-drawer" aria-label="Task details">
        <header className="pb-drawer-head">
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </header>
        {!task ? (
          <p className="dim pb-drawer-body">Loading…</p>
        ) : (
          <div className="pb-drawer-body">
            {task.parent && (
              <button className="pb-parent-link" onClick={() => onOpenTask(task.parent!.id)}>
                <CornerLeftUp size={12} strokeWidth={1.75} /> Sub-task of {task.parent.title}
              </button>
            )}
            <TitleField key={task.id} value={task.title} onSave={(title) => title !== task.title && save({ title })} />

            <div className="pb-fields">
              <label>
                <span>Status</span>
                <select
                  value={task.columnId}
                  onChange={(e) => change(() => api.moveTask(task.id, e.currentTarget.value, null))}
                >
                  {board.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select value={task.priority} onChange={(e) => save({ priority: Number(e.currentTarget.value) })}>
                  {PRIORITIES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Start</span>
                <input
                  type="date"
                  value={task.startDate ?? ""}
                  max={task.dueDate ?? undefined}
                  onChange={(e) => save({ startDate: e.currentTarget.value || null })}
                />
              </label>
              <label>
                <span>Due</span>
                <input
                  type="date"
                  value={task.dueDate ?? ""}
                  min={task.startDate ?? undefined}
                  onChange={(e) => save({ dueDate: e.currentTarget.value || null })}
                />
              </label>
              <label>
                <span>Estimate (h)</span>
                <input
                  key={`${task.id}-${task.estimate}`}
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="—"
                  defaultValue={task.estimate ?? ""}
                  onBlur={(e) => {
                    const value = e.currentTarget.value.trim();
                    const estimate = value === "" ? null : Number(value);
                    if (estimate !== task.estimate) save({ estimate });
                  }}
                />
              </label>
              <label>
                <span>Repeat</span>
                <select
                  value={task.recurrence ?? ""}
                  onChange={(e) => save({ recurrence: (e.currentTarget.value || null) as Recurrence | null })}
                >
                  <option value="">Never</option>
                  {RECURRENCES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {task.recurrence && (
              <p className="pb-hint">
                When this card is completed, the next one is created with its dates moved forward.
              </p>
            )}

            <LabelsSection task={task} board={board} change={change} />

            <section className="pb-section">
              <h4 className="pb-section-title">Description</h4>
              <DescriptionField
                key={task.id}
                value={task.description}
                onSave={(description) => description !== task.description && save({ description })}
              />
            </section>

            {!task.parent && <SubtasksSection task={task} board={board} change={change} onOpenTask={onOpenTask} />}

            <ChecklistSection task={task} change={change} />

            <section className="pb-section">
              <h4 className="pb-section-title">
                <History size={14} strokeWidth={1.75} /> Activity
              </h4>
              <ul className="pb-activity">
                {task.events.map((event) => (
                  <li key={event.id}>
                    <span>{event.detail || event.kind[0].toUpperCase() + event.kind.slice(1)}</span>
                    <time className="dim" title={new Date(event.createdAt).toLocaleString()}>
                      {timeAgo(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>

            <footer className="row pb-drawer-actions">
              <SaveTemplate taskTitle={task.title} onSave={(name) => change(() => api.saveTemplate(task.id, name))} />
              <ConfirmButton
                className="btn btn-sm btn-ghost"
                confirmText="Archive: click again"
                onConfirm={() => act(() => api.archiveTask(task.id, true)).then(onClose)}
              >
                <Archive size={12} strokeWidth={1.75} /> Archive
              </ConfirmButton>
              <ConfirmButton
                className="btn btn-sm btn-ghost is-danger"
                confirmText="Delete: click again"
                onConfirm={() => act(() => api.deleteTask(task.id)).then(onClose)}
              >
                <Trash2 size={12} strokeWidth={1.75} /> Delete
              </ConfirmButton>
            </footer>
          </div>
        )}
      </aside>
    </>
  );
}

/** "Save as template" that expands into a name field. */
function SaveTemplate({ taskTitle, onSave }: { taskTitle: string; onSave: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!naming) {
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => (setName(taskTitle), setNaming(true))}>
        <LayoutTemplate size={12} strokeWidth={1.75} /> Save as template
      </button>
    );
  }
  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setNaming(false);
  };
  return (
    <span className="pb-template-name">
      <input
        autoFocus
        value={name}
        aria-label="Template name"
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            e.stopPropagation();
            setNaming(false);
          }
        }}
      />
      <button className="btn btn-sm" onClick={submit}>
        Save
      </button>
    </span>
  );
}

function TitleField({ value, onSave }: { value: string; onSave: (title: string) => void }) {
  const [title, setTitle] = useState(value);
  return (
    <textarea
      className="pb-title-input"
      rows={1}
      value={title}
      aria-label="Title"
      onChange={(e) => setTitle(e.currentTarget.value)}
      onBlur={() => (title.trim() ? onSave(title.trim()) : setTitle(value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Links in descriptions open in the system browser. Followed inside the app,
 * they would replace Axiom's own window with the website. Only web and email
 * links are opened; anything else is shown as plain text.
 */
const MARKDOWN: Components = {
  a: ({ href, children }) => {
    if (!href || !/^(https?:|mailto:)/i.test(href)) return <span>{children}</span>;
    return (
      <a
        href={href}
        title={href}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't also open the editor
          void openUrl(href);
        }}
      >
        {children}
      </a>
    );
  },
};

/** Shows the description as formatted Markdown; click to edit the source. */
function DescriptionField({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (!editing) {
    return (
      <div className="pb-markdown" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
        {value ? <Markdown components={MARKDOWN}>{value}</Markdown> : <p className="dim">Add a more detailed description…</p>}
      </div>
    );
  }

  return (
    <div className="pb-description-edit">
      <textarea
        autoFocus
        rows={7}
        value={text}
        placeholder="Markdown works: **bold**, - lists, [links](https://…)"
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setText(value);
            setEditing(false);
          }
        }}
      />
      <div className="row">
        <button className="btn btn-sm" onClick={() => (onSave(text), setEditing(false))}>
          Save
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => (setText(value), setEditing(false))}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Change = (fn: () => Promise<unknown>) => Promise<unknown>;

function LabelsSection({ task, board, change }: { task: TaskDetail; board: Board; change: Change }) {
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("green");
  const assigned = board.labels.filter((l) => task.labelIds.includes(l.id));

  const toggle = (id: string) => {
    const ids = task.labelIds.includes(id) ? task.labelIds.filter((x) => x !== id) : [...task.labelIds, id];
    change(() => api.setTaskLabels(task.id, ids));
  };

  const create = () =>
    change(async () => {
      const label = await api.createLabel(board.project.id, name, color);
      await api.setTaskLabels(task.id, [...task.labelIds, label.id]);
      setName("");
    });

  return (
    <section className="pb-section">
      <h4 className="pb-section-title">
        <Tag size={14} strokeWidth={1.75} /> Labels
      </h4>
      <div className="pb-card-labels">
        {assigned.map((l) => (
          <span key={l.id} className="pb-label" style={{ "--label": colorOf(l.color) } as CSSProperties}>
            {l.name}
          </span>
        ))}
        <button className="pb-label-add" onClick={() => setPicking(!picking)} aria-expanded={picking}>
          {picking ? "Done" : <Plus size={12} strokeWidth={2} />}
        </button>
      </div>

      {picking && (
        <div className="pb-picker">
          {board.labels.map((l) => (
            <div key={l.id} className="pb-picker-row">
              <button className="pb-picker-toggle" onClick={() => toggle(l.id)} aria-pressed={task.labelIds.includes(l.id)}>
                <span className="pb-check">{task.labelIds.includes(l.id) && <Check size={12} strokeWidth={2.5} />}</span>
                <span className="pb-label" style={{ "--label": colorOf(l.color) } as CSSProperties}>
                  {l.name || " "}
                </span>
              </button>
              <ConfirmButton className="icon-btn" confirmText="Delete?" onConfirm={() => change(() => api.deleteLabel(l.id))}>
                <Trash2 size={13} strokeWidth={1.5} />
              </ConfirmButton>
            </div>
          ))}
          <div className="pb-picker-new">
            <input
              value={name}
              placeholder="New label"
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <div className="pb-swatches">
              {Object.entries(COLORS).map(([key, hex]) => (
                <button
                  key={key}
                  className={key === color ? "pb-swatch is-active" : "pb-swatch"}
                  style={{ background: hex }}
                  aria-label={key}
                  title={key}
                  onClick={() => setColor(key)}
                />
              ))}
            </div>
            <button className="btn btn-sm" onClick={create}>
              Create label
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Sub-tasks are real tasks with their own card; ticking one moves it to the done column. */
function SubtasksSection({
  task,
  board,
  change,
  onOpenTask,
}: {
  task: TaskDetail;
  board: Board;
  change: Change;
  onOpenTask: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const done = task.subtasks.filter((t) => t.completedAt).length;
  const total = task.subtasks.length;
  const doneColumn = board.columns.find((c) => c.isDone);
  const openColumn = board.columns.find((c) => !c.isDone);
  const columnName = new Map(board.columns.map((c) => [c.id, c.name]));

  const add = () => {
    const value = title.trim();
    if (!value) return;
    setTitle("");
    change(() => api.createSubtask(task.id, value));
  };

  const toggle = (id: string, isDone: boolean) => {
    const target = isDone ? openColumn : doneColumn;
    if (target) change(() => api.moveTask(id, target.id, null));
  };

  return (
    <section className="pb-section">
      <h4 className="pb-section-title">
        <ListTree size={14} strokeWidth={1.75} /> Sub-tasks{total > 0 && <span className="dim">{done}/{total}</span>}
      </h4>
      {total > 0 && (
        <div className="pb-progress" aria-hidden="true">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul className="pb-checklist pb-subtasks">
        {task.subtasks.map((sub) => {
          const isDone = sub.completedAt !== null;
          return (
            <li key={sub.id} className={isDone ? "is-done" : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={!doneColumn}
                  title={doneColumn ? `Move to ${isDone ? openColumn?.name : doneColumn.name}` : "Mark a column as done first"}
                  onChange={() => toggle(sub.id, isDone)}
                />
              </label>
              <button className="pb-subtask-title" onClick={() => onOpenTask(sub.id)}>
                <span>{sub.title}</span>
                <span className="ext-meta">{columnName.get(sub.columnId)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pb-checklist-add">
        <input
          value={title}
          placeholder="Add a sub-task"
          onChange={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-sm btn-ghost" onClick={add}>
          Add
        </button>
      </div>
    </section>
  );
}

function ChecklistSection({ task, change }: { task: TaskDetail; change: Change }) {
  const [text, setText] = useState("");
  const done = task.checklist.filter((i) => i.done).length;
  const total = task.checklist.length;

  const add = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    change(() => api.addChecklistItem(task.id, value));
  };

  return (
    <section className="pb-section">
      <h4 className="pb-section-title">
        Checklist{total > 0 && <span className="dim">{done}/{total}</span>}
      </h4>
      {total > 0 && (
        <div className="pb-progress" aria-hidden="true">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul className="pb-checklist">
        {task.checklist.map((item) => (
          <li key={item.id} className={item.done ? "is-done" : undefined}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => change(() => api.updateChecklistItem(item.id, item.text, e.currentTarget.checked))}
              />
              <span>{item.text}</span>
            </label>
            {!task.parent && (
              <button
                className="icon-btn"
                aria-label="Make sub-task"
                title="Make this a sub-task"
                onClick={() => change(() => api.convertChecklistItem(item.id))}
              >
                <ListTree size={13} strokeWidth={1.5} />
              </button>
            )}
            <button className="icon-btn" aria-label="Remove item" onClick={() => change(() => api.deleteChecklistItem(item.id))}>
              <X size={13} strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
      <div className="pb-checklist-add">
        <input
          value={text}
          placeholder="Add an item"
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-sm btn-ghost" onClick={add}>
          Add
        </button>
      </div>
    </section>
  );
}
