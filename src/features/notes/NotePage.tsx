import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, ArrowUpRight, Link2, Pin, PinOff, StickyNote as StickyIcon, Trash2 } from "lucide-react";
import { RichTextEditor, SaveLabel, type SaveState } from "../../lib/richtext/Editor";
import { linksIn } from "../../lib/richtext/wikiLinks";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { TagInput } from "../../shell/ui/TagInput";
import { COLORS, api, colorOf, edited, errorMessage, nameOf, type Folder, type NoteChange } from "./api";
import { notesChanged, setNotesUi, useTitles } from "./notesUi";
import { FolderSelect } from "./parts";
import { useNoteDoc } from "./useNoteDoc";

/** One note: where it's filed, its title, tags and text, and the notes it
 * links to and from. */
export function NotePage({ id, folders }: { id: string; folders: Folder[] }) {
  const { detail, doc, error: loadError, save } = useNoteDoc(id);
  const titles = useTitles().data ?? [];
  const [title, setTitle] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const titleTimer = useRef<number | null>(null);
  const typingTitle = useRef(false);

  // Follow the saved title, except while it's being typed.
  useEffect(() => {
    if (detail && !typingTitle.current) setTitle(detail.note.title);
  }, [detail]);

  if (loadError && !detail) return <p className="nt-error nt-pad">{loadError}</p>;
  if (!detail || !doc || title === null) return <p className="dim nt-pad">Opening…</p>;
  const note = detail.note;

  const change = (c: NoteChange) =>
    api.change(id, c).then(
      () => {
        setError(null);
        notesChanged();
      },
      (err) => setError(errorMessage(err)),
    );

  const typeTitle = (value: string) => {
    setTitle(value);
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      titleTimer.current = null;
      change({ title: value });
    }, 500);
  };

  // A [[link]] opens its note, or starts one by that name.
  const openLink = (name: string) => {
    const found = titles.find((t) => t.title.toLowerCase() === name.toLowerCase());
    if (found) return setNotesUi({ note: found.id });
    api.create({ title: name, folderId: note.folderId }).then((n) => {
      setNotesUi({ note: n.id });
      notesChanged();
    }, (err) => setError(errorMessage(err)));
  };
  const outgoing = linksIn(note.text);

  return (
    <article className="nt-page">
      <div className="nt-page-main">
        {note.trashedAt && (
          <div className="nt-trashed">
            <Trash2 size={15} strokeWidth={1.75} />
            <span>This note is in the trash, and goes for good 30 days after it was put there.</span>
            <button className="btn btn-sm" onClick={() => api.restore(id).then(notesChanged, (err) => setError(errorMessage(err)))}>
              <ArchiveRestore size={14} strokeWidth={1.75} /> Restore
            </button>
          </div>
        )}
        <header className="nt-page-head">
          <FolderSelect folders={folders} value={note.folderId} onChange={(f) => change({ folderId: f ?? "" })} />
          <span className="nt-grow" />
          {note.sticky && (
            <div className="nt-swatches" role="radiogroup" aria-label="Sticky note colour">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={c.id === colorOf(note.color).id}
                  aria-label={c.label}
                  title={c.label}
                  className={c.id === colorOf(note.color).id ? "is-on" : ""}
                  style={{ background: c.paper, borderColor: c.band }}
                  onClick={() => change({ color: c.id })}
                />
              ))}
            </div>
          )}
          {note.sticky ? (
            <button
              className={`btn btn-sm btn-ghost${note.onOverview ? " is-on" : ""}`}
              onClick={() => change({ onOverview: !note.onOverview })}
              title={note.onOverview ? "Take it off your overview" : "Show it on your overview"}
            >
              <StickyIcon size={14} strokeWidth={1.75} /> {note.onOverview ? "On overview" : "Show on overview"}
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => change({ sticky: true })} title="Make it a sticky note you can put on the overview">
              <StickyIcon size={14} strokeWidth={1.75} /> Make sticky
            </button>
          )}
          <button className="icon-btn" title={note.pinned ? "Unpin" : "Pin to the top"} aria-label={note.pinned ? "Unpin" : "Pin"} aria-pressed={note.pinned} onClick={() => change({ pinned: !note.pinned })}>
            {note.pinned ? <PinOff size={15} strokeWidth={1.75} /> : <Pin size={15} strokeWidth={1.75} />}
          </button>
        </header>

        <input
          className="nt-title"
          value={title}
          placeholder={nameOf({ title: "", text: note.text }) || "Untitled"}
          onFocus={() => (typingTitle.current = true)}
          onBlur={() => (typingTitle.current = false)}
          onChange={(e) => typeTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.closest(".nt-page-main")?.querySelector(".rx-prose") as HTMLElement | null)?.focus();
            }
          }}
          aria-label="Title"
        />
        <TagInput tags={detail.tags} onChange={(tags) => change({ tags })} onPick={(t) => setNotesUi({ tag: t, shelf: "all", folder: null, note: null })} placeholder="Add tags" />

        <RichTextEditor
          doc={doc}
          placeholder="Start writing. Type [[ to link another note."
          onSave={save}
          onState={setSaveState}
          autofocus={!note.words && !!note.title}
          links={{ titles: titles.filter((t) => t.id !== id).map((t) => t.title), open: openLink }}
        />

        <footer className="nt-page-foot">
          <span className="dim">
            {note.words} {note.words === 1 ? "word" : "words"} · Edited {edited(note.updatedAt).toLowerCase()}
          </span>
          <SaveLabel state={saveState} />
          {error && <span className="nt-error">{error}</span>}
          <span className="nt-grow" />
          {note.trashedAt ? (
            <ConfirmButton
              className="btn btn-sm btn-ghost nt-delete"
              confirmText="Delete it for good?"
              onConfirm={() =>
                api.remove(id).then(() => {
                  setNotesUi({ note: null });
                  notesChanged();
                }, (err) => setError(errorMessage(err)))
              }
            >
              <Trash2 size={13} strokeWidth={1.75} /> Delete for good
            </ConfirmButton>
          ) : (
            <button
              className="btn btn-sm btn-ghost nt-delete"
              onClick={() =>
                api.trash(id).then(() => {
                  setNotesUi({ note: null });
                  notesChanged();
                }, (err) => setError(errorMessage(err)))
              }
            >
              <Trash2 size={13} strokeWidth={1.75} /> Move to the trash
            </button>
          )}
        </footer>
      </div>

      {(detail.backlinks.length > 0 || outgoing.length > 0) && (
        <aside className="nt-links" aria-label="Links">
          {detail.backlinks.length > 0 && (
            <section>
              <h3>
                <ArrowUpRight size={13} strokeWidth={1.75} className="nt-flip" /> Linked from
              </h3>
              {detail.backlinks.map((l) => (
                <button key={l.id} className="nt-link" onClick={() => setNotesUi({ note: l.id })}>
                  {l.title}
                </button>
              ))}
            </section>
          )}
          {outgoing.length > 0 && (
            <section>
              <h3>
                <Link2 size={13} strokeWidth={1.75} /> Links to
              </h3>
              {outgoing.map((name) => {
                const there = titles.some((t) => t.title.toLowerCase() === name.toLowerCase());
                return (
                  <button key={name} className={`nt-link${there ? "" : " is-new"}`} title={there ? undefined : "No note by that name yet: click to start it"} onClick={() => openLink(name)}>
                    {name}
                  </button>
                );
              })}
            </section>
          )}
        </aside>
      )}
    </article>
  );
}
