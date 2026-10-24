import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Shuffle, Sun, Trash2, X } from "lucide-react";
import * as Y from "yjs";
import { useDataChanged } from "../../lib/sync";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { TagInput } from "../../shell/ui/TagInput";
import { longDay } from "../daily_plan/time";
import { ENERGY, MOODS, api, errorMessage, type EntryDetail, type EntryFields } from "./api";
import { COMPACT_AFTER, loadDoc, snapshot } from "../../lib/richtext/doc";
import { RichTextEditor, SaveLabel, type SaveState } from "../../lib/richtext/Editor";
import { journalChanged, setJournalUi } from "./journalUi";

const fieldsOf = (d: EntryDetail): EntryFields => ({
  day: d.entry.day,
  title: d.entry.title,
  mood: d.entry.mood,
  energy: d.entry.energy,
  tags: d.tags,
  prompt: d.entry.prompt,
});

/** One entry: its date, title, mood and energy, tags, prompt and text, with
 * the day's Daily Plan beside it. */
export function EntryPage({ id, prompts }: { id: string; prompts: string[] }) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [fields, setFields] = useState<EntryFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [words, setWords] = useState(0);
  const docRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    let live = true;
    api.get(id).then(
      (d) => {
        if (!live) return;
        const loaded = loadDoc(d.edits);
        docRef.current = loaded;
        setDoc(loaded);
        setDetail(d);
        setFields(fieldsOf(d));
        setWords(d.entry.words);
        // Many small saves read slowly: squash the ones read here into one.
        if (d.edits.length > COMPACT_AFTER) {
          api.compact(id, snapshot(loaded), d.edits.flatMap((e) => e.ids)).catch(() => {});
        }
      },
      (err) => live && setError(errorMessage(err)),
    );
    return () => {
      live = false;
      docRef.current = null;
    };
  }, [id]);

  // Edits synced from another computer merge into what's open.
  useDataChanged(
    useCallback(() => {
      api.get(id).then((d) => {
        if (!docRef.current) return;
        loadDoc(d.edits, docRef.current);
        setDetail(d);
        // Keep a title that's being typed.
        const typing = document.activeElement?.classList.contains("jr-title");
        setFields((f) => (f && typing ? { ...fieldsOf(d), title: f.title } : fieldsOf(d)));
      }, () => setJournalUi({ entry: null }));
    }, [id]),
  );

  const saveText = useCallback(
    async (update: string | null, text: string, count: number) => {
      await api.save(id, update, text, count);
      setWords(count);
      journalChanged();
    },
    [id],
  );

  const saveFields = useRef<number | null>(null);
  const change = (next: Partial<EntryFields>, wait = 0) => {
    if (!fields) return;
    const merged = { ...fields, ...next };
    setFields(merged);
    if (saveFields.current) window.clearTimeout(saveFields.current);
    saveFields.current = window.setTimeout(() => {
      saveFields.current = null;
      api.update(id, merged).then(
        (e) => {
          setFields((f) => (f ? { ...f, tags: e.tags ? e.tags.split(",") : [] } : f));
          setError(null);
          journalChanged();
        },
        (err) => setError(errorMessage(err)),
      );
    }, wait);
  };

  if (error && !detail) return <p className="jr-error jr-pad">{error}</p>;
  if (!detail || !doc || !fields) return <p className="dim jr-pad">Opening…</p>;

  const shuffle = () => {
    const others = prompts.filter((p) => p !== fields.prompt);
    if (others.length) change({ prompt: others[Math.floor(Math.random() * others.length)] });
  };
  const plan = detail.plan;

  return (
    <article className="jr-entry">
      <div className="jr-entry-main">
        <header className="jr-entry-head">
          <label className="jr-date" title="Change the day">
            <CalendarDays size={14} strokeWidth={1.75} />
            <span>{longDay(fields.day)}</span>
            <input type="date" value={fields.day} onChange={(e) => e.currentTarget.value && change({ day: e.currentTarget.value })} aria-label="Day" />
          </label>
          <input className="jr-title" value={fields.title} placeholder="Title (optional)" onChange={(e) => change({ title: e.currentTarget.value }, 600)} aria-label="Title" />
        </header>

        <div className="jr-feel">
          <div className="jr-moods" role="radiogroup" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m.value}
                role="radio"
                aria-checked={fields.mood === m.value}
                className={`jr-mood${fields.mood === m.value ? " is-on" : ""}`}
                title={m.label}
                onClick={() => change({ mood: fields.mood === m.value ? null : m.value })}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <div className="jr-energy" role="radiogroup" aria-label="Energy">
            <span className="jr-feel-label">Energy</span>
            {ENERGY.map((e) => (
              <button
                key={e.value}
                role="radio"
                aria-checked={fields.energy === e.value}
                className={`jr-bolt${fields.energy !== null && e.value <= fields.energy ? " is-on" : ""}`}
                title={e.label}
                onClick={() => change({ energy: fields.energy === e.value ? null : e.value })}
              />
            ))}
            {fields.energy && <span className="dim">{ENERGY[fields.energy - 1].label}</span>}
          </div>
        </div>

        {fields.prompt ? (
          <blockquote className="jr-prompt">
            <span>{fields.prompt}</span>
            <button className="icon-btn" title="Another prompt" aria-label="Another prompt" onClick={shuffle}>
              <Shuffle size={14} strokeWidth={1.75} />
            </button>
            <button className="icon-btn" title="No prompt" aria-label="No prompt" onClick={() => change({ prompt: "" })}>
              <X size={14} strokeWidth={1.75} />
            </button>
          </blockquote>
        ) : (
          <button className="jr-add-prompt" onClick={shuffle}>
            <Shuffle size={13} strokeWidth={1.75} /> Need a prompt?
          </button>
        )}

        <RichTextEditor doc={doc} placeholder={fields.prompt ? "Start with the prompt, or anything on your mind…" : "What's on your mind?"} onSave={saveText} onState={setSaveState} autofocus={!detail.entry.words} />

        <TagInput tags={fields.tags} onChange={(tags) => change({ tags })} onPick={(t) => setJournalUi({ tag: t, entry: null, page: "journal" })} placeholder="Add tags, like #uni or #family" />

        <footer className="jr-entry-foot">
          <span className="dim">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <SaveLabel state={saveState} />
          {error && <span className="jr-error">{error}</span>}
          <span className="jr-grow" />
          <ConfirmButton
            className="btn btn-sm btn-ghost jr-delete"
            confirmText="Delete this entry?"
            onConfirm={() =>
              api.remove(id).then(() => {
                setJournalUi({ entry: null });
                journalChanged();
              }, (err) => setError(errorMessage(err)))
            }
          >
            <Trash2 size={13} strokeWidth={1.75} /> Delete
          </ConfirmButton>
        </footer>
      </div>

      {plan && (plan.intention || plan.wentWell || plan.doBetter) && (
        <aside className="jr-plan" aria-label="From your Daily Plan">
          <h3>
            <Sun size={13} strokeWidth={1.75} /> From your Daily Plan
          </h3>
          {plan.intention && <PlanLine label="Intention" text={plan.intention} />}
          {plan.wentWell && <PlanLine label="Went well" text={plan.wentWell} />}
          {plan.doBetter && <PlanLine label="Do better" text={plan.doBetter} />}
        </aside>
      )}
    </article>
  );
}

function PlanLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="jr-plan-line">
      <span className="jr-feel-label">{label}</span>
      <p>{text}</p>
    </div>
  );
}
