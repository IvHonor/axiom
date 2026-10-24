import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Clock, FileUp, Layers, ListPlus, ListVideo, Pencil, Search, Sparkles, Trash2 } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { parseDuration, today } from "../daily_plan/time";
import { Dialog, Segmented } from "../reading/AddBook";
import { Cover } from "../reading/Cover";
import { api as reading, type Found as Book } from "../reading/api";
import {
  api,
  COLORS,
  errorMessage,
  KINDS,
  kindOf,
  plural,
  unitFields,
  type Color,
  type Draft,
  type Kind,
  type Skill,
  type SkillCard,
  type Source,
  type Unit,
} from "./api";
import { learningChanged, openSource, setLearningUi } from "./learningUi";

/** Runs a save, showing its error in the dialog instead of closing. */
function useSave(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      learningChanged();
      if (close) onClose();
      else setBusy(false);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const int = (text: string) => {
  const n = Number.parseInt(text, 10);
  return Number.isNaN(n) ? null : n;
};

const ICONS = ["📘", "💻", "🦀", "🐍", "🧮", "🔬", "🗣️", "🎸", "🎨", "📈", "🧠", "✍️", "🏛️", "🌍"];

export function SkillDialog({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const [name, setName] = useState(skill?.name ?? "");
  const [icon, setIcon] = useState(skill?.icon ?? "📘");
  const [color, setColor] = useState<Color>(skill?.color ?? "blue");
  const [why, setWhy] = useState(skill?.why ?? "");
  const [archived, setArchived] = useState(skill?.archived ?? false);
  const { busy, error, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { name, icon, color, why, archived };
    run(async () => {
      if (skill) await api.updateSkill(skill.id, fields);
      else {
        const made = await api.addSkill(fields);
        // Straight on to its first source.
        setLearningUi({ dialog: { kind: "source", id: null, skillId: made.id } });
      }
    }, !!skill);
  };

  return (
    <Dialog title={skill ? "Edit skill" : "New skill"} icon={<Sparkles size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <div className="un-pair">
          <label className="rd-field ln-icon-field">
            <span>Icon</span>
            <input value={icon} maxLength={4} aria-label="Emoji" onChange={(e) => setIcon(e.currentTarget.value)} />
          </label>
          <label className="rd-field rd-fill">
            <span>What are you learning?</span>
            <input required autoFocus value={name} placeholder="Rust, Spanish, Machine learning…" onChange={(e) => setName(e.currentTarget.value)} />
          </label>
        </div>
        <div className="ln-icons" role="group" aria-label="Pick an icon">
          {ICONS.map((i) => (
            <button type="button" key={i} className={i === icon ? "is-on" : undefined} onClick={() => setIcon(i)}>
              {i}
            </button>
          ))}
        </div>
        <div className="rd-field">
          <span>Colour</span>
          <span className="un-swatches" role="radiogroup" aria-label="Colour">
            {(Object.keys(COLORS) as Color[]).map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                className={c === color ? "is-active" : undefined}
                style={{ background: COLORS[c] }}
                onClick={() => setColor(c)}
              />
            ))}
          </span>
        </div>
        <label className="rd-field">
          <span>Why it matters to you (optional)</span>
          <textarea rows={2} value={why} placeholder="So I can build my own tools" onChange={(e) => setWhy(e.currentTarget.value)} />
        </label>
        {skill && (
          <label className="ln-check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.currentTarget.checked)} />
            <span>Archived: done with it, or on hold. It's kept, but out of the way.</span>
          </label>
        )}
        <footer className="rd-dialog-foot un-foot">
          {skill && (
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Delete the skill and all its sources? Click again"
              onConfirm={() =>
                run(async () => {
                  await api.deleteSkill(skill.id);
                  setLearningUi({ source: null });
                })
              }
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </ConfirmButton>
          )}
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {skill ? "Save" : "Next: add a source"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Finding a book on Open Library, to fill in its title, author and cover. */
function BookSearch({ onPick }: { onPick: (b: Book) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Book[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setFound(await reading.search(query));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ln-book-search">
      <div className="ln-row">
        <input
          value={query}
          placeholder="Search by title, author or ISBN"
          aria-label="Search for the book"
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={() => void search()} disabled={busy || !query.trim()}>
          <Search size={13} strokeWidth={1.75} /> {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="rd-error">{error}</p>}
      {found && found.length === 0 && <p className="dim">Nothing found. Type the details in below instead.</p>}
      {found && found.length > 0 && (
        <ul className="ln-found">
          {found.slice(0, 6).map((b) => (
            <li key={b.workKey}>
              <button
                type="button"
                onClick={() => {
                  onPick(b);
                  setFound(null);
                }}
              >
                <Cover url={b.coverUrl} title={b.title} size="sm" />
                <span>
                  <b>{b.title}</b>
                  <span className="dim">
                    {[b.authors, b.year].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SourceDialog({ source, skills, skillId, onClose }: { source: Source | null; skills: SkillCard[]; skillId?: string; onClose: () => void }) {
  const [skill, setSkill] = useState(source?.skillId ?? skillId ?? skills.find((s) => !s.archived)?.id ?? "");
  const [kind, setKind] = useState<Kind>(source?.kind ?? "book");
  const [title, setTitle] = useState(source?.title ?? "");
  const [author, setAuthor] = useState(source?.author ?? "");
  const [link, setLink] = useState(source?.link ?? "");
  const [cover, setCover] = useState<string | null>(source?.coverUrl ?? null);
  const [unitName, setUnitName] = useState(source?.unitName ?? "");
  const [finishBy, setFinishBy] = useState(source?.finishBy ?? "");
  const [notes, setNotes] = useState(source?.notes ?? "");
  const { busy, error, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { skillId: skill, kind, title, author, link: link || null, coverUrl: cover, unitName, finishBy: finishBy || null, notes };
    run(async () => {
      if (source) await api.updateSource(source.id, fields);
      else {
        const made = await api.addSource(fields);
        // Open it, and go straight on to its chapters.
        setLearningUi({ source: made.id, dialog: { kind: "units", sourceId: made.id } });
      }
    }, !!source);
  };

  return (
    <Dialog title={source ? "Edit source" : "New source"} icon={<BookOpen size={16} strokeWidth={1.75} />} onClose={onClose} wide>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <div className="ln-kinds" role="radiogroup" aria-label="What is it?">
          {KINDS.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={`ln-kind${kind === k.id ? " is-on" : ""}`} onClick={() => setKind(k.id)}>
              <span aria-hidden="true">{k.emoji}</span>
              <b>{k.label}</b>
              <span className="dim">{k.hint}</span>
            </button>
          ))}
        </div>
        {kind === "book" && !source && (
          <BookSearch
            onPick={(b) => {
              setTitle(b.title);
              setAuthor(b.authors);
              setCover(b.coverUrl);
            }}
          />
        )}
        <div className="un-pair">
          {cover && kind === "book" && <Cover url={cover} title={title} size="sm" />}
          <label className="rd-field rd-fill">
            <span>Title</span>
            <input required value={title} placeholder={kind === "course" ? "The Complete Rust Course" : kind === "video" ? "Rust for beginners" : "The Rust Programming Language"} onChange={(e) => setTitle(e.currentTarget.value)} />
          </label>
        </div>
        <div className="un-pair">
          <label className="rd-field rd-fill">
            <span>{kind === "book" ? "Author" : kind === "course" ? "Instructor or platform" : kind === "video" ? "Channel" : "By (optional)"}</span>
            <input value={author} onChange={(e) => setAuthor(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>Learning for</span>
            <select value={skill} onChange={(e) => setSkill(e.currentTarget.value)}>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="rd-field">
          <span>Link (optional)</span>
          <input value={link} placeholder="https://…" spellCheck={false} onChange={(e) => setLink(e.currentTarget.value)} />
        </label>
        <div className="un-pair">
          <label className="rd-field">
            <span>Its parts are called</span>
            <input value={unitName} placeholder={kindOf(kind).unit} onChange={(e) => setUnitName(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>Finish by (optional)</span>
            <input type="date" value={finishBy} onChange={(e) => setFinishBy(e.currentTarget.value)} />
          </label>
        </div>
        <label className="rd-field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        </label>
        <footer className="rd-dialog-foot un-foot">
          {source && (
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Delete it, with its progress and time? Click again"
              onConfirm={() =>
                run(async () => {
                  await api.deleteSource(source.id);
                  setLearningUi({ source: null });
                })
              }
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </ConfirmButton>
          )}
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !title.trim() || !skill}>
            {source ? "Save" : `Next: add ${plural(unitName.trim() || kindOf(kind).unit, 2)}`}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

type Way = "type" | "paste" | "file" | "youtube";

/** The units found, as they'll be added: nested, with lengths and pages. */
function Preview({ units, unitName }: { units: Draft[]; unitName: string }) {
  if (units.length === 0) return null;
  const shown = units.slice(0, 200);
  return (
    <div className="ln-preview">
      <span className="dim">
        {units.length} {plural(unitName, units.length)} found
        {units.length > shown.length && `, showing the first ${shown.length}`}
      </span>
      <ol>
        {shown.map((u, i) => (
          <li key={i} style={{ paddingLeft: u.level * 16 }} className={i + 1 < shown.length && shown[i + 1].level > u.level ? "is-heading" : undefined}>
            <span>{u.title}</span>
            {(u.minutes || u.page) && <span className="dim">{u.minutes ? `${u.minutes} min` : `p. ${u.page}`}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Adding a source's chapters or lessons: typed, pasted, from the book file, or a playlist. */
export function UnitsDialog({ source, existing, onClose }: { source: Source; existing: number; onClose: () => void }) {
  const unit = source.unitName || kindOf(source.kind).unit;
  const [way, setWay] = useState<Way>(source.kind === "video" ? "youtube" : source.kind === "course" ? "paste" : "type");
  const [youtube, setYoutube] = useState(false);
  const [count, setCount] = useState("");
  const [typed, setTyped] = useState("");
  const [pasted, setPasted] = useState("");
  const [link, setLink] = useState(source.kind === "video" ? source.link ?? "" : "");
  const [found, setFound] = useState<Draft[]>([]);
  const [replace, setReplace] = useState(false);
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { busy, error, setError, run } = useSave(onClose);

  useEffect(() => void api.youtubeAvailable().then(setYoutube, () => setYoutube(false)), []);

  // Typed: a number makes "Chapter 1…n"; lines are taken as they are.
  useEffect(() => {
    if (way !== "type") return;
    const n = int(count);
    const name = unit.charAt(0).toUpperCase() + unit.slice(1);
    if (n && n > 0) setFound(Array.from({ length: Math.min(n, 1000) }, (_, i) => ({ title: `${name} ${i + 1}`, level: 0, minutes: null, page: null })));
    else setFound(typed.split("\n").map((t) => t.trim()).filter(Boolean).map((title) => ({ title, level: 0, minutes: null, page: null })));
  }, [way, count, typed, unit]);

  // Pasted: read on the Rust side, as you type.
  useEffect(() => {
    if (way !== "paste") return;
    const t = window.setTimeout(() => void api.parseText(pasted).then(setFound, () => setFound([])), 200);
    return () => window.clearTimeout(t);
  }, [way, pasted]);

  const switchTo = (next: Way) => {
    setWay(next);
    setFound([]);
    setError(null);
  };

  const read = async (f: File | undefined) => {
    if (!f) return;
    setReading(true);
    setError(null);
    try {
      setFound((await api.readBook(f)).units);
    } catch (e) {
      setFound([]);
      setError(errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const fetchPlaylist = async () => {
    setReading(true);
    setError(null);
    try {
      const got = await api.youtube(link);
      setFound(got.units);
      // Keep the playlist as the source's link.
      if (!source.link) await api.updateSource(source.id, { ...source, link });
    } catch (e) {
      setFound([]);
      setError(errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const ways: { id: Way; label: string }[] = [
    { id: "type", label: "Type or count" },
    { id: "paste", label: "Paste a list" },
    { id: "file", label: "From the book file" },
    ...(youtube ? [{ id: "youtube" as Way, label: "YouTube playlist" }] : []),
  ];

  return (
    <Dialog title={`Add ${plural(unit, 2)}`} icon={<ListPlus size={16} strokeWidth={1.75} />} onClose={onClose} wide>
      <div className="rd-dialog-body">
        <Segmented options={ways} value={way} onChange={switchTo} />
        {way === "type" && (
          <>
            <div className="un-pair">
              <label className="rd-field">
                <span>How many {plural(unit, 2)}?</span>
                <input className="rd-num" inputMode="numeric" value={count} placeholder="24" onChange={(e) => setCount(e.currentTarget.value)} />
              </label>
              <span className="dim ln-or">or type them, one per line</span>
            </div>
            <textarea rows={6} value={typed} disabled={!!int(count)} placeholder={`Getting started\nThe basics\n…`} onChange={(e) => setTyped(e.currentTarget.value)} aria-label={`${unit} titles`} />
          </>
        )}
        {way === "paste" && (
          <>
            <p className="dim ln-help">
              Copy the contents from the publisher's page, or a course's curriculum (Udemy's "Course content", Coursera's syllabus), and paste it here. Numbering like 1, 1.2 and Part II
              nests it; page numbers and lengths are picked up.
            </p>
            <textarea rows={8} autoFocus value={pasted} placeholder={"Part I Foundations\n1 Getting Started ..... 1\n1.1 Installation ..... 2"} onChange={(e) => setPasted(e.currentTarget.value)} aria-label="Contents" />
          </>
        )}
        {way === "file" && (
          <div className="ln-drop">
            <FileUp size={22} strokeWidth={1.5} />
            <p>Most EPUBs and PDFs have their own table of contents. Choose the book and its chapters are read straight from it, on this computer.</p>
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()} disabled={reading}>
              {reading ? "Reading…" : "Choose an EPUB or PDF"}
            </button>
            <input ref={file} type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" hidden onChange={(e) => void read(e.currentTarget.files?.[0]).then(() => (e.target.value = ""))} />
          </div>
        )}
        {way === "youtube" && (
          <>
            <div className="ln-row">
              <input value={link} placeholder="https://www.youtube.com/playlist?list=…" spellCheck={false} aria-label="Playlist link" onChange={(e) => setLink(e.currentTarget.value)} />
              <button type="button" className="btn btn-sm" onClick={() => void fetchPlaylist()} disabled={reading || !link.trim()}>
                <ListVideo size={13} strokeWidth={1.75} /> {reading ? "Fetching…" : "Get videos"}
              </button>
            </div>
            <p className="dim ln-help">Every video in the playlist becomes one to tick off, with its length.</p>
          </>
        )}
        {error && <p className="rd-error">{error}</p>}
        <Preview units={found} unitName={unit} />
        <footer className="rd-dialog-foot un-foot">
          {existing > 0 && (
            <label className="ln-check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.currentTarget.checked)} />
              <span>Replace the {existing} already there</span>
            </label>
          )}
          <span className="rd-fill" />
          <button className="btn" disabled={busy || found.length === 0} onClick={() => run(() => api.addUnits(source.id, found, replace, today()))}>
            <Layers size={14} strokeWidth={1.75} /> Add {found.length || ""} {plural(unit, found.length)}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}

export function SessionDialog({ sourceId, minutes, skills, onClose }: { sourceId: string | null; minutes?: number; skills: SkillCard[]; onClose: () => void }) {
  const sources = skills.filter((s) => !s.archived).flatMap((s) => s.sources.map((src) => ({ ...src, icon: s.icon })));
  const [source, setSource] = useState(sourceId ?? sources[0]?.id ?? "");
  const [day, setDay] = useState(today());
  const [time, setTime] = useState(minutes ? String(minutes) : "");
  const [note, setNote] = useState("");
  const { busy, error, setError, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = parseDuration(time) ?? int(time);
    if (!m) return setError("How long? For example 45, or 1h 30m.");
    run(() => api.addSession({ sourceId: source, day, minutes: m, note }));
  };

  return (
    <Dialog title="Log study time" icon={<Clock size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        {sources.length === 0 ? (
          <p className="dim">Add a source first: a book, course or playlist to log time against.</p>
        ) : (
          <>
            <label className="rd-field">
              <span>Studying</span>
              <select value={source} onChange={(e) => setSource(e.currentTarget.value)}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="un-pair">
              <label className="rd-field">
                <span>Day</span>
                <input type="date" value={day} max={today()} onChange={(e) => setDay(e.currentTarget.value)} />
              </label>
              <label className="rd-field">
                <span>How long</span>
                <input autoFocus={!minutes} value={time} placeholder="45 or 1h 30m" onChange={(e) => setTime(e.currentTarget.value)} />
              </label>
            </div>
            <label className="rd-field">
              <span>What you did (optional)</span>
              <input value={note} placeholder="Chapter 4 exercises" onChange={(e) => setNote(e.currentTarget.value)} />
            </label>
          </>
        )}
        <footer className="rd-dialog-foot un-foot">
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !source || !time.trim()}>
            Log it
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function UnitDialog({ unit, unitName, onClose }: { unit: Unit; unitName: string; onClose: () => void }) {
  const [fields, setFields] = useState(unitFields(unit));
  const [minutes, setMinutes] = useState(unit.minutes?.toString() ?? "");
  const [page, setPage] = useState(unit.page?.toString() ?? "");
  const { busy, error, run } = useSave(onClose);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => api.updateUnit(unit.id, { ...fields, minutes: parseDuration(minutes) ?? int(minutes), page: int(page) }));
  };
  return (
    <Dialog title={`Edit ${unitName}`} icon={<Pencil size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <label className="rd-field">
          <span>Title</span>
          <input required autoFocus value={fields.title} onChange={(e) => setFields({ ...fields, title: e.currentTarget.value })} />
        </label>
        <div className="un-pair">
          <label className="rd-field">
            <span>Nesting</span>
            <select value={fields.level} onChange={(e) => setFields({ ...fields, level: Number(e.currentTarget.value) })}>
              {[0, 1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {l === 0 ? "Top level" : `${"  ".repeat(l)}Level ${l + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="rd-field">
            <span>Length</span>
            <input value={minutes} placeholder="12 or 1h 5m" onChange={(e) => setMinutes(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>Page</span>
            <input className="rd-num" inputMode="numeric" value={page} onChange={(e) => setPage(e.currentTarget.value)} />
          </label>
        </div>
        <label className="rd-field">
          <span>Notes: what you learned, what to come back to</span>
          <textarea rows={5} value={fields.notes} onChange={(e) => setFields({ ...fields, notes: e.currentTarget.value })} />
        </label>
        <footer className="rd-dialog-foot un-foot">
          <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Delete it? Click again" onConfirm={() => run(() => api.deleteUnit(unit.id, today()))}>
            <Trash2 size={14} strokeWidth={1.75} /> Delete
          </ConfirmButton>
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !fields.title.trim()}>
            Save
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Opens a source's page and closes any dialog, e.g. from a review list. */
export const goToSource = (id: string) => {
  openSource(id);
  setLearningUi({ dialog: null });
};
