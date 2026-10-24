import "./richtext.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Bold, FileText, Heading2, Italic, List, ListChecks, ListOrdered, Plus, Quote, Redo2, Strikethrough, Undo2 } from "lucide-react";
import type * as Y from "yjs";
import { REMOTE, Saver } from "./doc";
import { WikiLinks, type LinkQuery } from "./wikiLinks";
import { shortcut } from "../shortcut";

/** How long typing pauses before the text is saved. */
const SAVE_AFTER_MS = 800;

export type SaveState = "saved" | "saving" | "unsaved" | "failed";

/** [[Links]] to other notes: the names to suggest, and opening one. */
export interface LinkSupport {
  titles: string[];
  open: (title: string) => void;
}

interface Props {
  doc: Y.Doc;
  placeholder: string;
  /** Saves the edits since last time, with the plain text. */
  onSave: (update: string | null, text: string, words: number) => Promise<void>;
  onState?: (state: SaveState) => void;
  autofocus?: boolean;
  /** Leave out for a bare page (a sticky note): Markdown shortcuts still work. */
  toolbar?: boolean;
  links?: LinkSupport;
  className?: string;
}

export const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** A rich-text editor over a Yjs document, saving itself as you type.
 * Markdown shortcuts work as you type (# heading, - list, [] task, > quote,
 * **bold**). */
export function RichTextEditor({ doc, placeholder, onSave, onState, autofocus, toolbar = true, links, className }: Props) {
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  // Kept up to date as you type: the editor may be gone by the final save.
  const lastText = useRef("");
  const latest = useRef({ onSave, onState, links });
  latest.current = { onSave, onState, links };

  const [query, setQuery] = useState<LinkQuery | null>(null);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const suggestions = useMemo(() => {
    if (!query || !links || dismissed === query.from) return [];
    const q = query.text.trim().toLowerCase();
    const found = links.titles.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
    const exact = links.titles.some((t) => t.toLowerCase() === q);
    return q && !exact ? [...found, `\u0000${query.text.trim()}`] : found;
  }, [query, links, dismissed]);
  const menu = useRef({ suggestions, pick, query });
  menu.current = { suggestions, pick, query };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
        Collaboration.configure({ document: doc }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder }),
        WikiLinks.configure({
          open: (title) => latest.current.links?.open(title),
          query: (q) => setQuery((old) => (old?.from === q?.from && old?.text === q?.text ? old : q)),
          key: (event) => {
            const { suggestions: items, pick: at, query: q } = menu.current;
            if (!items.length || !q) return false;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setPick((at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              choose(items[at] ?? items[0], q);
              return true;
            }
            if (event.key === "Escape") {
              setDismissed(q.from);
              return true;
            }
            return false;
          },
        }),
      ],
      autofocus: autofocus ? "end" : false,
      editorProps: { attributes: { class: "rx-prose", spellcheck: "true" } },
    },
    [doc],
  );
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  function choose(item: string, q: LinkQuery) {
    const title = item.startsWith("\u0000") ? item.slice(1) : item;
    editorRef.current?.chain().focus().insertContentAt({ from: q.from, to: q.to }, `${title}]]`).run();
    setQuery(null);
  }

  useEffect(() => setPick(0), [query?.text]);

  // Save after a pause in typing, and whatever's left when the page closes.
  useEffect(() => {
    if (!editor) return;
    const s = new Saver(doc);
    const flush = () => {
      timer.current = null;
      const update = s.next();
      if (!update) return saving.current;
      const text = lastText.current;
      latest.current.onState?.("saving");
      saving.current = saving.current
        .then(() => latest.current.onSave(update, text, countWords(text)))
        .then(
          () => latest.current.onState?.(s.dirty ? "unsaved" : "saved"),
          () => {
            s.retry(update);
            latest.current.onState?.("failed");
          },
        );
      return saving.current;
    };
    const changed = (_: Uint8Array, origin: unknown) => {
      if (!s.dirty || origin === REMOTE) return;
      lastText.current = editor.getText({ blockSeparator: "\n" });
      latest.current.onState?.("unsaved");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_AFTER_MS);
    };
    doc.on("update", changed);
    return () => {
      doc.off("update", changed);
      if (timer.current) window.clearTimeout(timer.current);
      flush();
      s.stop();
    };
  }, [editor, doc]);

  // Where the suggestions open: just under the "[[".
  const box = useRef<HTMLDivElement>(null);
  let at: { left: number; top: number } | null = null;
  if (editor && query && suggestions.length && box.current) {
    try {
      const c = editor.view.coordsAtPos(query.from);
      const r = box.current.getBoundingClientRect();
      at = { left: c.left - r.left, top: c.bottom - r.top + 4 };
    } catch {
      at = null;
    }
  }

  return (
    <div ref={box} className={`rx-editor${className ? ` ${className}` : ""}`}>
      {editor && toolbar && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {at && query && (
        <div className="rx-suggest" style={at} role="listbox" aria-label="Link to a note">
          {suggestions.map((s, i) => (
            <button
              key={s}
              role="option"
              aria-selected={i === pick}
              className={i === pick ? "is-on" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s, query);
              }}
            >
              {s.startsWith("\u0000") ? (
                <>
                  <Plus size={13} strokeWidth={1.75} /> Link to a new note “{s.slice(1)}”
                </>
              ) : (
                <>
                  <FileText size={13} strokeWidth={1.75} /> {s}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      heading: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();
  const button = (label: string, Icon: typeof Bold, active: boolean, act: () => void, disabled = false) => (
    <button
      type="button"
      className={`rx-tool${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={act}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
  return (
    <div className="rx-toolbar" role="toolbar" aria-label="Formatting">
      {button(shortcut("Bold (Ctrl+B)"), Bold, on.bold, () => run().toggleBold().run())}
      {button(shortcut("Italic (Ctrl+I)"), Italic, on.italic, () => run().toggleItalic().run())}
      {button("Strikethrough", Strikethrough, on.strike, () => run().toggleStrike().run())}
      <span className="rx-tool-gap" />
      {button("Heading", Heading2, on.heading, () => run().toggleHeading({ level: 2 }).run())}
      {button("Bulleted list", List, on.bullet, () => run().toggleBulletList().run())}
      {button("Numbered list", ListOrdered, on.ordered, () => run().toggleOrderedList().run())}
      {button("Checklist", ListChecks, on.task, () => run().toggleTaskList().run())}
      {button("Quote", Quote, on.quote, () => run().toggleBlockquote().run())}
      <span className="rx-tool-gap" />
      {button(shortcut("Undo (Ctrl+Z)"), Undo2, false, () => run().undo().run(), !on.undo)}
      {button(shortcut("Redo (Ctrl+Shift+Z)"), Redo2, false, () => run().redo().run(), !on.redo)}
    </div>
  );
}

/** "Saved", "Saving…", for a page's footer. */
export function SaveLabel({ state }: { state: SaveState }) {
  const [shown, setShown] = useState(state);
  // Don't flash "Saving…" for quick saves.
  useEffect(() => {
    if (state !== "saving") return setShown(state);
    const t = window.setTimeout(() => setShown("saving"), 300);
    return () => window.clearTimeout(t);
  }, [state]);
  const label = { saved: "Saved", saving: "Saving…", unsaved: "Editing…", failed: "Couldn't save. Retrying when you type." }[shown];
  return <span className={`rx-save${shown === "failed" ? " is-failed" : ""}`}>{label}</span>;
}
