import { useState, type FormEvent } from "react";
import { BookOpen, CalendarPlus, CalendarRange, GraduationCap, Trash2 } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { mondayOf, today } from "../daily_plan/time";
import { Dialog, Segmented } from "../reading/AddBook";
import {
  api,
  COLORS,
  CONFIDENCE,
  errorMessage,
  KINDS,
  WEEKDAYS,
  type Color,
  type Confidence,
  type Kind,
  type Lecture,
  type Module,
  type TermCard,
} from "./api";
import { setUniUi, uniChanged } from "./uniUi";

/** Runs a save, showing its error in the dialog instead of closing. */
function useSave(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      uniChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const int = (text: string) => {
  const n = Number.parseInt(text, 10);
  return Number.isNaN(n) ? null : n;
};

export function TermDialog({ term, onClose }: { term: TermCard | null; onClose: () => void }) {
  const [name, setName] = useState(term?.name ?? "");
  const [startsOn, setStartsOn] = useState(term?.startsOn ?? mondayOf(today()));
  const [weeks, setWeeks] = useState(String(term?.weeks ?? 12));
  const { busy, error, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { name, startsOn, weeks: int(weeks) ?? 0 };
    run(async () => {
      if (term) await api.updateTerm(term.id, fields, today());
      else setUniUi({ term: (await api.addTerm(fields, today())).id, module: null });
    });
  };

  return (
    <Dialog title={term ? "Edit term" : "New term"} icon={<CalendarRange size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <label className="rd-field">
          <span>Name</span>
          <input required autoFocus value={name} placeholder="Year 2 · Autumn" onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <div className="un-pair">
          <label className="rd-field">
            <span>Starts</span>
            <input required type="date" value={startsOn} onChange={(e) => setStartsOn(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>Teaching weeks</span>
            <input className="rd-num" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.currentTarget.value)} />
          </label>
        </div>
        <small className="dim">Week 1 is the week the term starts in. Count reading week if your timetable does.</small>
        <footer className="rd-dialog-foot un-foot">
          {term && (
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Delete the term, its modules and lectures? Click again"
              onConfirm={() =>
                run(async () => {
                  await api.deleteTerm(term.id);
                  setUniUi({ term: null, module: null });
                })
              }
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </ConfirmButton>
          )}
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {term ? "Save" : "Add term"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function ModuleDialog({ module, terms, termId, onClose }: { module: Module | null; terms: TermCard[]; termId: string; onClose: () => void }) {
  const [code, setCode] = useState(module?.code ?? "");
  const [name, setName] = useState(module?.name ?? "");
  const [color, setColor] = useState<Color>(module?.color ?? "blue");
  const [credits, setCredits] = useState(module?.credits?.toString() ?? "");
  const [link, setLink] = useState(module?.link ?? "");
  const [term, setTerm] = useState(module?.termId ?? termId);
  const { busy, error, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { termId: term, code, name, color, credits: int(credits), link: link || null };
    run(async () => {
      if (module) await api.updateModule(module.id, fields, today());
      else await api.addModule(fields, today());
    });
  };

  return (
    <Dialog title={module ? "Edit module" : "New module"} icon={<GraduationCap size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <div className="un-pair">
          <label className="rd-field un-code">
            <span>Code</span>
            <input value={code} placeholder="COMP1001" onChange={(e) => setCode(e.currentTarget.value)} />
          </label>
          <label className="rd-field rd-fill">
            <span>Name</span>
            <input required autoFocus value={name} placeholder="Algorithms" onChange={(e) => setName(e.currentTarget.value)} />
          </label>
        </div>
        <div className="rd-field">
          <span>Colour</span>
          <span className="un-swatches" role="radiogroup" aria-label="Colour">
            {(Object.keys(COLORS) as Color[]).map((c) => (
              <button
                key={c}
                type="button"
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
        <div className="un-pair">
          <label className="rd-field">
            <span>Credits</span>
            <input className="rd-num" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.currentTarget.value)} />
          </label>
          {terms.length > 1 && (
            <label className="rd-field rd-fill">
              <span>Term</span>
              <select value={term} onChange={(e) => setTerm(e.currentTarget.value)}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="rd-field">
          <span>Module page (optional)</span>
          <input type="url" value={link} placeholder="https://moodle…" onChange={(e) => setLink(e.currentTarget.value)} />
        </label>
        {module && term !== module.termId && <small className="dim">Its lectures keep their weeks but lose their dates, which were the old term's.</small>}
        <footer className="rd-dialog-foot un-foot">
          {module && (
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Delete the module and its lectures? Click again"
              onConfirm={() =>
                run(async () => {
                  await api.deleteModule(module.id);
                  setUniUi({ module: null });
                })
              }
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </ConfirmButton>
          )}
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {module ? "Save" : "Add module"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Adds a run of lectures: "every Tuesday and Thursday, weeks 1 to 11". */
export function ScheduleDialog({ moduleId, term, onClose }: { moduleId: string; term: TermCard; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("lecture");
  const [title, setTitle] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [fromWeek, setFromWeek] = useState("1");
  const [toWeek, setToWeek] = useState(String(term.weeks));
  const [skip, setSkip] = useState("");
  const [recorded, setRecorded] = useState(true);
  const { busy, error, run } = useSave(onClose);

  const skipWeeks = skip.split(/[\s,]+/).map(int).filter((n): n is number => n !== null);
  const from = int(fromWeek) ?? 1;
  const to = int(toWeek) ?? term.weeks;
  const weeks = Math.max(0, to - from + 1) - skipWeeks.filter((w) => w >= from && w <= to).length;
  const count = weeks * weekdays.length;
  const kindLabel = KINDS.find((k) => k.id === kind)!.label;

  const toggle = (d: number) => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => api.addSchedule(moduleId, { kind, title, weekdays, fromWeek: from, toWeek: to, skipWeeks, recorded }));
  };

  return (
    <Dialog title="Add from timetable" icon={<CalendarPlus size={16} strokeWidth={1.75} />} onClose={onClose}>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <div className="rd-field">
          <span>What</span>
          <Segmented options={KINDS} value={kind} onChange={setKind} />
        </div>
        <div className="rd-field">
          <span>On</span>
          <span className="un-days">
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" aria-pressed={weekdays.includes(i)} className={weekdays.includes(i) ? "is-active" : undefined} onClick={() => toggle(i)}>
                {d}
              </button>
            ))}
          </span>
        </div>
        <div className="un-pair">
          <label className="rd-field">
            <span>From week</span>
            <input className="rd-num" inputMode="numeric" value={fromWeek} onChange={(e) => setFromWeek(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>To week</span>
            <input className="rd-num" inputMode="numeric" value={toWeek} onChange={(e) => setToWeek(e.currentTarget.value)} />
          </label>
          <label className="rd-field rd-fill">
            <span>Skip weeks</span>
            <input value={skip} placeholder="e.g. 6 for reading week" onChange={(e) => setSkip(e.currentTarget.value)} />
          </label>
        </div>
        <label className="rd-field">
          <span>Titles</span>
          <input value={title} placeholder={kindLabel} onChange={(e) => setTitle(e.currentTarget.value)} />
          <small className="dim">Numbered on from any you have: {title.trim() || kindLabel} 1, {title.trim() || kindLabel} 2… Rename them as you go.</small>
        </label>
        <label className="un-check">
          <input type="checkbox" checked={recorded} onChange={(e) => setRecorded(e.currentTarget.checked)} /> Recorded, so you can catch up if you miss one
        </label>
        <footer className="rd-dialog-foot">
          <button className="btn" type="submit" disabled={busy || count <= 0}>
            {count > 0 ? `Add ${count} ${kindLabel.toLowerCase()}${count === 1 ? "" : "s"}` : "Pick the days"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

const CONFIDENCE_OPTIONS: { id: "none" | `${Confidence}`; label: string }[] = [
  { id: "none", label: "Not set" },
  { id: "1", label: CONFIDENCE[1] },
  { id: "2", label: CONFIDENCE[2] },
  { id: "3", label: CONFIDENCE[3] },
];

export function LectureDialog({ lecture, moduleId, term, onClose }: { lecture: Lecture | null; moduleId: string; term: TermCard; onClose: () => void }) {
  const [title, setTitle] = useState(lecture?.title ?? "");
  const [kind, setKind] = useState<Kind>(lecture?.kind ?? "lecture");
  const [day, setDay] = useState(lecture?.day ?? "");
  const [week, setWeek] = useState(lecture?.week?.toString() ?? (term.week?.toString() || ""));
  const [topics, setTopics] = useState(lecture?.topics ?? "");
  const [recorded, setRecorded] = useState(lecture?.recorded ?? true);
  const [confidence, setConfidence] = useState<Confidence | null>(lecture?.confidence ?? null);
  const [notes, setNotes] = useState(lecture?.notes ?? "");
  const { busy, error, run } = useSave(onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title, kind, day: day || null, week: day ? null : int(week), topics, recorded, confidence, notes };
    run(() => (lecture ? api.updateLecture(lecture.id, fields) : api.addLecture(moduleId, fields)));
  };

  return (
    <Dialog title={lecture ? "Edit" : "Add one"} icon={<BookOpen size={16} strokeWidth={1.75} />} onClose={onClose} wide>
      <form className="rd-dialog-body" onSubmit={submit}>
        {error && <p className="rd-error">{error}</p>}
        <label className="rd-field">
          <span>Title</span>
          <input required autoFocus value={title} placeholder="Dynamic programming" onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <div className="rd-field">
          <span>What</span>
          <Segmented options={KINDS} value={kind} onChange={setKind} />
        </div>
        <div className="un-pair">
          <label className="rd-field">
            <span>Date</span>
            <input type="date" value={day} onChange={(e) => setDay(e.currentTarget.value)} />
          </label>
          <label className="rd-field">
            <span>Week</span>
            <input className="rd-num" inputMode="numeric" value={day ? "" : week} disabled={!!day} placeholder={day ? "From date" : ""} onChange={(e) => setWeek(e.currentTarget.value)} />
          </label>
        </div>
        <label className="rd-field">
          <span>Topics</span>
          <input value={topics} placeholder="Memoisation, knapsack, edit distance" onChange={(e) => setTopics(e.currentTarget.value)} />
        </label>
        <div className="rd-field">
          <span>How well you get it</span>
          <Segmented
            options={CONFIDENCE_OPTIONS}
            value={confidence ? (`${confidence}` as const) : "none"}
            onChange={(v) => setConfidence(v === "none" ? null : (Number(v) as Confidence))}
          />
        </div>
        <label className="un-check">
          <input type="checkbox" checked={recorded} onChange={(e) => setRecorded(e.currentTarget.checked)} /> There's a recording
        </label>
        <label className="rd-field">
          <span>Notes</span>
          <textarea className="rd-textarea" rows={4} value={notes} placeholder="Questions to ask, slides to reread…" onChange={(e) => setNotes(e.currentTarget.value)} />
        </label>
        <footer className="rd-dialog-foot un-foot">
          {lecture && (
            <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Delete it? Click again" onConfirm={() => run(() => api.deleteLecture(lecture.id))}>
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </ConfirmButton>
          )}
          <span className="rd-fill" />
          <button className="btn" type="submit" disabled={busy || !title.trim()}>
            {lecture ? "Save" : "Add"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
