import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Clicking a tag: show what else has it. */
  onPick?: (tag: string) => void;
  placeholder?: string;
}

/** Tags as chips: type and press Enter (or a comma) to add one; Backspace in
 * the empty box removes the last. Colour with `--tag-accent`. */
export function TagInput({ tags, onChange, onPick, placeholder = "Add tags" }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().replace(/^#/, "");
    setDraft("");
    if (tag && !tags.includes(tag.toLowerCase())) onChange([...tags, tag]);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          <button className="tag-chip-name" title={onPick ? `Everything tagged #${t}` : undefined} onClick={() => onPick?.(t)}>
            #{t}
          </button>
          <button className="tag-chip-x" aria-label={`Remove #${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X size={11} strokeWidth={2} />
          </button>
        </span>
      ))}
      <input value={draft} placeholder={tags.length ? "Add a tag" : placeholder} onChange={(e) => setDraft(e.currentTarget.value)} onKeyDown={key} onBlur={add} aria-label="Add a tag" />
    </div>
  );
}
