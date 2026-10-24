import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Ellipsis, FilePlus2, FolderClosed, FolderOpen, FolderPlus, Inbox, Notebook, Pencil, StickyNote as StickyIcon, Trash2 } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Dropdown } from "../../shell/ui/Dropdown";
import { Section } from "../../shell/ui/Section";
import { api, errorMessage, type Folder, type Shelf } from "./api";
import { notesChanged, setNotesUi, useNotesState, useNotesUi } from "./notesUi";
import { newNote } from "./parts";

/** The Notes side panel: shelves, folders and tags. */
export function NotesSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useNotesUi();
  const { data: state } = useNotesState();
  const [adding, setAdding] = useState<{ parent: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (change: Parameters<typeof setNotesUi>[0]) => {
    setNotesUi({ shelf: "all", folder: null, tag: null, search: "", note: null, ...change });
    onOpen();
  };
  const shelf = (id: Shelf, label: string, Icon: typeof Notebook, count?: number, folder: string | null = null) => {
    const on = active && ui.shelf === id && ui.folder === folder && !ui.tag;
    return (
      <button className={`nav-item${on ? " is-active" : ""}`} onClick={() => show({ shelf: id, folder })}>
        <Icon size={14} strokeWidth={1.5} />
        <span className="bs-name">{label}</span>
        {count !== undefined && count > 0 && <span className="ns-count">{count}</span>}
      </button>
    );
  };

  return (
    <>
      <Section title="Notes">
        {shelf("all", "All notes", Notebook, state?.notes)}
        {shelf("stickies", "Sticky notes", StickyIcon, state?.stickies)}
        {shelf("all", "Unfiled", Inbox, state?.unfiled, "none")}
        {shelf("trash", "Trash", Trash2, state?.trash)}
        <button
          className="nav-item"
          onClick={() => {
            onOpen();
            newNote({ folderId: ui.folder && ui.folder !== "none" ? ui.folder : null }).catch(() => {});
          }}
        >
          <FilePlus2 size={14} strokeWidth={1.5} />
          <span className="bs-name">New note</span>
        </button>
      </Section>
      <Section title="Folders" count={state?.folders.length}>
        <div className="ns-folders">
          {state && <Tree folders={state.folders} parent={null} depth={0} active={active} onShow={(id) => show({ folder: id })} onAdd={(parent) => setAdding({ parent })} onError={setError} />}
          {adding && <NameForm placeholder="Folder name" onDone={() => setAdding(null)} onSave={(name) => api.createFolder(name, adding.parent).then(notesChanged)} />}
          {!adding && (
            <button className="ns-add" onClick={() => setAdding({ parent: null })}>
              <FolderPlus size={14} strokeWidth={1.5} /> New folder
            </button>
          )}
          {error && <p className="nt-error ns-error">{error}</p>}
        </div>
      </Section>
      {state && state.tags.length > 0 && (
        <Section title="Tags" count={state.tags.length}>
          <div className="ns-tags">
            {state.tags.map((t) => (
              <button key={t.tag} className={`ns-tag${active && ui.tag === t.tag ? " is-active" : ""}`} onClick={() => show({ tag: ui.tag === t.tag ? null : t.tag })}>
                #{t.tag} <span className="dim">{t.count}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

interface TreeProps {
  folders: Folder[];
  parent: string | null;
  depth: number;
  active: boolean;
  onShow: (id: string) => void;
  onAdd: (parent: string) => void;
  onError: (message: string | null) => void;
}

function Tree({ folders, parent, depth, ...rest }: TreeProps) {
  const ids = new Set(folders.map((f) => f.id));
  const here = folders.filter((f) => (f.parentId && ids.has(f.parentId) ? f.parentId : null) === parent);
  return (
    <>
      {here.map((f) => (
        <FolderRow key={f.id} folder={f} folders={folders} depth={depth} {...rest} />
      ))}
    </>
  );
}

function FolderRow({ folder, folders, depth, active, onShow, onAdd, onError }: Omit<TreeProps, "parent"> & { folder: Folder }) {
  const ui = useNotesUi();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const children = folders.some((f) => f.parentId === folder.id);
  const on = active && ui.folder === folder.id && ui.shelf === "all" && !ui.tag;
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = on ? FolderOpen : FolderClosed;
  const act = (p: Promise<unknown>) =>
    p.then(
      () => {
        onError(null);
        notesChanged();
      },
      (err) => onError(errorMessage(err)),
    );

  return (
    <>
      {renaming ? (
        <NameForm initial={folder.name} placeholder="Folder name" depth={depth} onDone={() => setRenaming(false)} onSave={(name) => api.renameFolder(folder.id, name).then(notesChanged)} />
      ) : (
        <div className={`ns-folder${on ? " is-active" : ""}`} style={{ paddingLeft: 12 + depth * 14 }}>
          <button className="ns-chevron" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} style={{ visibility: children ? "visible" : "hidden" }}>
            <Chevron size={12} strokeWidth={1.75} />
          </button>
          <button className="ns-folder-name" onClick={() => onShow(folder.id)}>
            <Icon size={14} strokeWidth={1.5} />
            <span>{folder.name}</span>
            {folder.count > 0 && <span className="ns-count">{folder.count}</span>}
          </button>
          <Dropdown label={`${folder.name} options`} icon={<Ellipsis size={14} strokeWidth={1.75} />}>
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    close();
                    onShow(folder.id);
                    newNote({ folderId: folder.id }).catch(() => {});
                  }}
                >
                  <FilePlus2 size={14} strokeWidth={1.5} /> New note here
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    close();
                    setOpen(true);
                    setAdding(true);
                  }}
                >
                  <FolderPlus size={14} strokeWidth={1.5} /> New folder inside
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    close();
                    setRenaming(true);
                  }}
                >
                  <Pencil size={14} strokeWidth={1.5} /> Rename
                </button>
                {folder.parentId && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      act(api.moveFolder(folder.id, null));
                    }}
                  >
                    <FolderClosed size={14} strokeWidth={1.5} /> Move to the top
                  </button>
                )}
                <button
                  className="menu-item is-danger"
                  title="Its notes and folders move up to where it was"
                  onClick={() => {
                    close();
                    if (ui.folder === folder.id) setNotesUi({ folder: folder.parentId });
                    act(api.deleteFolder(folder.id));
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} /> Delete folder (keeps its notes)
                </button>
              </>
            )}
          </Dropdown>
        </div>
      )}
      {adding && <NameForm placeholder="Folder name" depth={depth + 1} onDone={() => setAdding(false)} onSave={(name) => api.createFolder(name, folder.id).then(notesChanged)} />}
      {open && <Tree folders={folders} parent={folder.id} depth={depth + 1} active={active} onShow={onShow} onAdd={onAdd} onError={onError} />}
    </>
  );
}

/** Naming a folder in place: Enter saves, Escape (or leaving it empty) cancels. */
function NameForm({ initial = "", placeholder, depth = 0, onSave, onDone }: { initial?: string; placeholder: string; depth?: number; onSave: (name: string) => Promise<unknown>; onDone: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || name.trim() === initial) return onDone();
    onSave(name).then(onDone, (err) => setError(errorMessage(err)));
  };
  return (
    <form className="ns-name" style={{ paddingLeft: 30 + depth * 14 }} onSubmit={submit}>
      <input
        autoFocus
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => submit()}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        aria-label={placeholder}
      />
      {error && <p className="nt-error">{error}</p>}
    </form>
  );
}
