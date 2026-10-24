import { useState, type FormEvent } from "react";
import { Cake } from "lucide-react";
import { Modal } from "../../shell/ui/Modal";
import { today } from "../daily_plan/time";
import { MONTHS, RELATIONS, REMINDERS, api, daysIn, errorMessage, type Occasion, type Person, type PersonFields } from "./api";
import { birthdaysChanged, setBirthdaysUi } from "./birthdaysUi";

const blank = (): PersonFields => {
  const [, m] = today().split("-").map(Number);
  return { name: "", occasion: "birthday", month: m, day: 1, year: null, relation: "friend", notes: "", remindDays: 7 };
};

/** Adding someone, or changing their details. */
export function PersonDialog({ person }: { person: Person | null }) {
  const [fields, setFields] = useState<PersonFields>(() =>
    person
      ? { name: person.name, occasion: person.occasion, month: person.month, day: person.day, year: person.year, relation: person.relation, notes: person.notes, remindDays: person.remindDays }
      : blank(),
  );
  const [yearText, setYearText] = useState(person?.year ? String(person.year) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setBirthdaysUi({ dialog: null });
  const set = (change: Partial<PersonFields>) => setFields((f) => ({ ...f, ...change }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const year = yearText.trim() ? Number(yearText.trim()) : null;
    if (year !== null && !Number.isInteger(year)) return setError("The year is four digits, like 1996.");
    setBusy(true);
    try {
      const saved = person ? await api.update(person.id, { ...fields, year }, today()) : await api.create({ ...fields, year }, today());
      setBirthdaysUi({ dialog: null, person: saved.id });
      birthdaysChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const anniversary = fields.occasion === "anniversary";
  return (
    <Modal title={person ? `Edit ${person.name}` : "Add someone"} icon={<Cake size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="bd-form" onSubmit={submit}>
        <div className="bd-seg" role="radiogroup" aria-label="Occasion">
          {(["birthday", "anniversary"] as Occasion[]).map((o) => (
            <button type="button" key={o} role="radio" aria-checked={fields.occasion === o} className={fields.occasion === o ? "is-on" : ""} onClick={() => set({ occasion: o })}>
              {o === "birthday" ? "🎂 Birthday" : "💍 Anniversary"}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">{anniversary ? "Whose anniversary" : "Name"}</span>
          <input autoFocus value={fields.name} placeholder={anniversary ? "Mum & Dad" : "Sam Taylor"} onChange={(e) => set({ name: e.currentTarget.value })} />
        </label>
        <div className="bd-date-fields">
          <label className="field">
            <span className="field-label">Day</span>
            <select className="bd-select" value={fields.day} onChange={(e) => set({ day: Number(e.currentTarget.value) })}>
              {Array.from({ length: daysIn(fields.month) }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field bd-grow">
            <span className="field-label">Month</span>
            <select className="bd-select" value={fields.month} onChange={(e) => {
              const month = Number(e.currentTarget.value);
              set({ month, day: Math.min(fields.day, daysIn(month)) });
            }}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Year (optional)</span>
            <input inputMode="numeric" maxLength={4} value={yearText} placeholder={anniversary ? "2001" : "1996"} onChange={(e) => setYearText(e.currentTarget.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <p className="field-hint bd-hint">{anniversary ? "With the year, you'll see how many years it's been." : "With the year, you'll see how old they're turning."}{fields.month === 2 && fields.day === 29 && " In years without a 29th, it comes on the 28th."}</p>
        <div className="bd-pair">
          <label className="field">
            <span className="field-label">Who they are</span>
            <select className="bd-select" value={fields.relation} onChange={(e) => set({ relation: e.currentTarget.value as PersonFields["relation"] })}>
              {RELATIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Remind me</span>
            <select className="bd-select" value={fields.remindDays} onChange={(e) => set({ remindDays: Number(e.currentTarget.value) })}>
              {REMINDERS.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea className="bd-textarea" rows={3} value={fields.notes} placeholder="Likes, sizes, their partner's name…" onChange={(e) => set({ notes: e.currentTarget.value })} />
        </label>
        {error && <p className="bd-error">{error}</p>}
        <div className="bd-form-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={busy || !fields.name.trim()}>
            {busy ? "Saving…" : person ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
