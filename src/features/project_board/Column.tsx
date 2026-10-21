import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Ellipsis, LayoutTemplate, Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Dropdown } from "../../shell/ui/Dropdown";
import type { Column, ColumnFields, Label, TaskCard, Template } from "./api";
import { SortableCard, taskKey } from "./Card";

export const columnKey = (id: string) => `col-${id}`;

interface BoardColumnProps {
  column: Column;
  tasks: TaskCard[];
  labels: Label[];
  templates: Template[];
  isFirst: boolean;
  isLast: boolean;
  onOpenTask: (id: string) => void;
  onAddTask: (title: string) => Promise<void>;
  onAddFromTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onUpdate: (fields: ColumnFields) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

export function BoardColumn({
  column,
  tasks,
  labels,
  templates,
  isFirst,
  isLast,
  onOpenTask,
  onAddTask,
  onAddFromTemplate,
  onDeleteTemplate,
  onUpdate,
  onMove,
  onDelete,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey(column.id) });
  const [renaming, setRenaming] = useState(false);
  const overLimit = column.wipLimit !== null && tasks.length > column.wipLimit;
  const fields: ColumnFields = { name: column.name, isDone: column.isDone, wipLimit: column.wipLimit };

  return (
    <section className={`pb-column panel${isOver ? " is-over" : ""}`}>
      <header className="pb-column-head">
        {renaming ? (
          <InlineInput
            initial={column.name}
            onSubmit={(name) => {
              setRenaming(false);
              if (name !== column.name) onUpdate({ ...fields, name });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h3 className="pb-column-name" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {column.name}
          </h3>
        )}
        <span className={`pb-count${overLimit ? " is-over-limit" : ""}`} title={column.wipLimit ? "Cards / card limit" : "Cards"}>
          {tasks.length}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>
        <Dropdown label={`${column.name} column actions`} icon={<Ellipsis size={16} strokeWidth={1.5} />}>
          {(close) => (
            <>
              <button className="menu-item" onClick={() => (setRenaming(true), close())}>
                Rename
              </button>
              <label className="menu-item menu-check">
                <input
                  type="checkbox"
                  checked={column.isDone}
                  onChange={(e) => onUpdate({ ...fields, isDone: e.currentTarget.checked })}
                />
                Tasks here count as done
              </label>
              <label className="menu-item menu-field">
                Card limit
                <input
                  type="number"
                  min={1}
                  placeholder="None"
                  defaultValue={column.wipLimit ?? ""}
                  onBlur={(e) => {
                    const value = e.currentTarget.value.trim();
                    const wipLimit = value ? Math.max(1, Math.round(Number(value))) : null;
                    if (wipLimit !== column.wipLimit) onUpdate({ ...fields, wipLimit });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              </label>
              <div className="menu-sep" />
              <button className="menu-item" disabled={isFirst} onClick={() => (onMove(-1), close())}>
                Move left
              </button>
              <button className="menu-item" disabled={isLast} onClick={() => (onMove(1), close())}>
                Move right
              </button>
              <div className="menu-sep" />
              <ConfirmButton className="menu-item is-danger" onConfirm={() => (onDelete(), close())}>
                Delete column
              </ConfirmButton>
            </>
          )}
        </Dropdown>
      </header>

      <SortableContext items={tasks.map((t) => taskKey(t.id))} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="pb-cards">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} labels={labels} onOpen={onOpenTask} />
          ))}
        </div>
      </SortableContext>

      <div className="pb-add-row">
        <Composer onAdd={onAddTask} />
        {templates.length > 0 && (
          <Dropdown label="Add a card from a template" icon={<LayoutTemplate size={15} strokeWidth={1.5} />}>
            {(close) => (
              <>
                <p className="menu-heading">Templates</p>
                {templates.map((t) => (
                  <div key={t.id} className="menu-row">
                    <button className="menu-item" onClick={() => (onAddFromTemplate(t.id), close())}>
                      {t.name}
                    </button>
                    <ConfirmButton className="icon-btn" confirmText="Delete?" onConfirm={() => onDeleteTemplate(t.id)}>
                      <Trash2 size={13} strokeWidth={1.5} />
                    </ConfirmButton>
                  </div>
                ))}
              </>
            )}
          </Dropdown>
        )}
      </div>
    </section>
  );
}

/** Trello-style quick add: type a title, Enter to add and keep going, Escape to stop. */
function Composer({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function submit() {
    const text = title.trim();
    if (!text) return;
    setTitle("");
    await onAdd(text);
    input.current?.focus();
  }

  if (!open) {
    return (
      <button className="pb-add" onClick={() => setOpen(true)}>
        <Plus size={14} strokeWidth={1.75} /> Add a card
      </button>
    );
  }

  return (
    <div className="pb-composer">
      <textarea
        ref={input}
        value={title}
        rows={2}
        placeholder="Enter a title for this card"
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <div className="row">
        <button className="btn btn-sm" onClick={submit}>
          Add card
        </button>
        <button className="icon-btn" aria-label="Cancel" onClick={() => (setOpen(false), setTitle(""))}>
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/** A text input that submits on Enter or blur and cancels on Escape. */
export function InlineInput({
  initial,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const finish = (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = value.trim();
    if (submit && text) onSubmit(text);
    else onCancel();
  };

  return (
    <input
      className="pb-inline-input"
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}
