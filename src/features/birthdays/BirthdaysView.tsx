import { useMemo, useRef, useState } from "react";
import { CalendarArrowDown, Cake, Search, UserPlus, Users, X } from "lucide-react";
import { VaultLockBanner } from "../../shell/account/Encryption";
import { today } from "../daily_plan/time";
import { MONTHS, RELATIONS, api, emojiOf, errorMessage, milestone, type Person } from "./api";
import { PAGES, birthdaysChanged, setBirthdaysUi, useBirthdaysUi, usePeople, type BirthdaysPage } from "./birthdaysUi";
import { Avatar, PersonRow } from "./parts";
import { PersonDialog } from "./PersonDialog";
import { PersonPanel } from "./PersonPanel";

const LABELS: Record<BirthdaysPage, string> = { upcoming: "Upcoming", calendar: "Calendar", everyone: "Everyone" };

/** Birthdays: who's next, a calendar of the year, and everyone you remember. */
export function BirthdaysView() {
  const ui = useBirthdaysUi();
  const { data: people, error } = usePeople();
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await api.importContacts(await file.text(), today());
      const parts = [`Added ${r.added} ${r.added === 1 ? "date" : "dates"}`];
      if (r.already) parts.push(`${r.already} already here`);
      if (r.withoutDate) parts.push(`${r.withoutDate} ${r.withoutDate === 1 ? "contact" : "contacts"} without a birthday`);
      setNote(parts.join(" · "));
      birthdaysChanged();
    } catch (err) {
      setNote(errorMessage(err));
    }
  };
  const exportAll = () => api.exportCalendar(today()).then((path) => setNote(`Saved to ${path}. Open it to add everyone to your calendar.`), (err) => setNote(errorMessage(err)));
  const editing = ui.dialog?.kind === "person" ? ui.dialog.id : undefined;

  return (
    <div className="bd-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Birthdays">
          {PAGES.map((p) => (
            <button key={p} className={`pb-tab${ui.page === p ? " is-active" : ""}`} onClick={() => setBirthdaysUi({ page: p })}>
              {LABELS[p]}
            </button>
          ))}
        </nav>
        {note && (
          <span className="bd-note dim" title={note}>
            {note}
          </span>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => picker.current?.click()} title="Add birthdays from a contacts file (.vcf) exported from Google Contacts, iCloud, Outlook or your phone">
          <Users size={14} strokeWidth={1.75} /> Import contacts
        </button>
        <input ref={picker} type="file" accept=".vcf,text/vcard" hidden onChange={(e) => void importFile(e.currentTarget.files?.[0]).then(() => (e.target.value = ""))} />
        <button className="btn btn-sm btn-ghost" onClick={exportAll} disabled={!people?.length} title="Save everyone as a calendar file (.ics) for Google Calendar, Outlook or Apple Calendar">
          <CalendarArrowDown size={14} strokeWidth={1.75} /> Export
        </button>
        <button className="btn btn-sm" onClick={() => setBirthdaysUi({ dialog: { kind: "person", id: null } })}>
          <UserPlus size={14} strokeWidth={1.75} /> Add someone
        </button>
      </header>
      <div className="bd-banner">
        <VaultLockBanner subject="birthdays" />
      </div>
      {error && <p className="bd-error bd-pad">{error}</p>}
      {people && (
        <div className={`bd-split${ui.person ? " has-person" : ""}`}>
          <main className="bd-main">
            {people.length === 0 ? (
              <Welcome onImport={() => picker.current?.click()} />
            ) : ui.page === "upcoming" ? (
              <Upcoming people={people} open={ui.person} />
            ) : ui.page === "calendar" ? (
              <Calendar people={people} />
            ) : (
              <Everyone people={people} open={ui.person} />
            )}
          </main>
          {ui.person && (
            <aside className="bd-side">
              <PersonPanel key={ui.person} id={ui.person} />
            </aside>
          )}
        </div>
      )}
      {editing !== undefined && <PersonDialog person={people?.find((p) => p.id === editing) ?? null} />}
    </div>
  );
}

function Welcome({ onImport }: { onImport: () => void }) {
  return (
    <div className="bd-welcome">
      <span className="bd-welcome-emoji">🎂</span>
      <h1>Never miss a birthday</h1>
      <p className="dim">Add the people you care about. You'll see who's next and how old they're turning, keep gift ideas for each, and get a reminder on the day and ahead of it.</p>
      <div className="bd-welcome-actions">
        <button className="btn" onClick={() => setBirthdaysUi({ dialog: { kind: "person", id: null } })}>
          <UserPlus size={14} strokeWidth={1.75} /> Add someone
        </button>
        <button className="btn btn-ghost" onClick={onImport}>
          <Users size={14} strokeWidth={1.75} /> Import contacts
        </button>
      </div>
      <p className="dim bd-small">Import a .vcf file from Google Contacts, iCloud, Outlook or your phone: everyone with a birthday on it comes in.</p>
    </div>
  );
}

/** Today's, then the next month's, then the rest of the year by month. */
function Upcoming({ people, open }: { people: Person[]; open: string | null }) {
  const todays = people.filter((p) => p.days === 0);
  const soon = people.filter((p) => p.days > 0 && p.days <= 30);
  const later = people.filter((p) => p.days > 30);
  const months: { key: string; people: Person[] }[] = [];
  for (const p of later) {
    const key = p.next.slice(0, 7);
    if (months[months.length - 1]?.key !== key) months.push({ key, people: [] });
    months[months.length - 1].people.push(p);
  }
  const monthName = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]}${y !== Number(today().slice(0, 4)) ? ` ${y}` : ""}`;
  };

  return (
    <div className="bd-page">
      {todays.length > 0 && (
        <section className="bd-celebrate">
          <span className="bd-confetti" aria-hidden="true" />
          {todays.map((p) => (
            <button key={p.id} className="bd-celebrate-card" onClick={() => setBirthdaysUi({ person: p.id })}>
              <span className="bd-celebrate-emoji">{emojiOf(p.occasion)}</span>
              <Avatar person={p} size={44} />
              <span>
                <b>{p.occasion === "anniversary" ? `${p.name}'s anniversary` : `${p.name}'s birthday`}</b>
                <span className="dim">{milestone(p) ? `${milestone(p)} today` : "Today"}{p.ideas > 0 && ` · ${p.ideas} gift ${p.ideas === 1 ? "idea" : "ideas"}`}</span>
              </span>
            </button>
          ))}
        </section>
      )}
      <section>
        <h3 className="bd-heading">Next 30 days</h3>
        {soon.length === 0 ? <p className="dim bd-empty">Nothing in the next month.</p> : <div className="bd-rows">{soon.map((p) => <PersonRow key={p.id} person={p} open={open === p.id} />)}</div>}
      </section>
      {months.map((m) => (
        <section key={m.key}>
          <h3 className="bd-heading">{monthName(m.key)}</h3>
          <div className="bd-rows">
            {m.people.map((p) => (
              <PersonRow key={p.id} person={p} open={open === p.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The next twelve months, each a little month grid with everyone on it. */
function Calendar({ people }: { people: Person[] }) {
  const now = today();
  const [y0, m0] = now.split("-").map(Number);
  const byDay = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of people) map.set(p.next, [...(map.get(p.next) ?? []), p]);
    return map;
  }, [people]);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y0, m0 - 1 + i, 1, 12);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="bd-page">
      <div className="bd-months">
        {months.map(({ year, month }) => {
          const first = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
          const days = new Date(year, month, 0, 12).getDate();
          const listed = inMonth(byDay, year, month);
          return (
            <section key={`${year}-${month}`} className="bd-month">
              <h4>
                {MONTHS[month - 1]} {year !== y0 && <span className="dim">{year}</span>}
                {listed.length > 0 && <span className="bd-month-count">{listed.length}</span>}
              </h4>
              <div className="bd-grid">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} className="bd-grid-head">
                    {d}
                  </span>
                ))}
                {Array.from({ length: first }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const key = `${year}-${pad(month)}-${pad(i + 1)}`;
                  const here = byDay.get(key) ?? [];
                  const label = here.map((p) => `${emojiOf(p.occasion)} ${p.name}${milestone(p) ? ` (${milestone(p)})` : ""}`).join("\n");
                  return here.length ? (
                    <button key={key} className={`bd-cell has-people${key === now ? " is-today" : ""}`} title={label} aria-label={`${i + 1} ${MONTHS[month - 1]}: ${label}`} onClick={() => setBirthdaysUi({ person: here[0].id })}>
                      {i + 1}
                      <span className="bd-cell-dots">
                        {here.slice(0, 3).map((p) => (
                          <i key={p.id} />
                        ))}
                      </span>
                    </button>
                  ) : (
                    <span key={key} className={`bd-cell${key === now ? " is-today" : ""}`}>
                      {i + 1}
                    </span>
                  );
                })}
              </div>
              {listed.length > 0 && (
                <ul className="bd-month-list">
                  {listed.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => setBirthdaysUi({ person: p.id })}>
                        <span className="bd-month-day">{Number(p.next.slice(8))}</span> {p.name}
                        {milestone(p) && <span className="dim"> · {milestone(p)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Everyone coming round in a month, in date order. */
function inMonth(byDay: Map<string, Person[]>, year: number, month: number): Person[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return [...byDay.entries()].filter(([day]) => day.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, ps]) => ps);
}

/** Everyone, A to Z, with search and groups. */
function Everyone({ people, open }: { people: Person[]; open: string | null }) {
  const ui = useBirthdaysUi();
  const words = ui.search.trim().toLowerCase();
  const shown = people
    .filter((p) => !ui.relation || p.relation === ui.relation)
    .filter((p) => !words || `${p.name} ${p.notes}`.toLowerCase().includes(words))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bd-page">
      <div className="bd-filters">
        <div className="bd-search">
          <Search size={14} strokeWidth={1.75} />
          <input value={ui.search} placeholder="Search names and notes" onChange={(e) => setBirthdaysUi({ search: e.currentTarget.value })} aria-label="Search" />
          {ui.search && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setBirthdaysUi({ search: "" })}>
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <div className="bd-chips">
          <button className={!ui.relation ? "is-on" : ""} onClick={() => setBirthdaysUi({ relation: null })}>
            Everyone <span>{people.length}</span>
          </button>
          {RELATIONS.map((r) => {
            const n = people.filter((p) => p.relation === r.id).length;
            return (
              n > 0 && (
                <button key={r.id} className={ui.relation === r.id ? "is-on" : ""} onClick={() => setBirthdaysUi({ relation: ui.relation === r.id ? null : r.id })}>
                  {r.label} <span>{n}</span>
                </button>
              )
            );
          })}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="dim bd-empty">
          <Cake size={14} strokeWidth={1.75} /> Nobody matches.
        </p>
      ) : (
        <div className="bd-rows">
          {shown.map((p) => (
            <PersonRow key={p.id} person={p} open={open === p.id} />
          ))}
        </div>
      )}
    </div>
  );
}
