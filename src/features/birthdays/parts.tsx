import { Gift } from "lucide-react";
import { MONTHS, avatarColor, countdown, emojiOf, initials, milestone, type Person } from "./api";
import { setBirthdaysUi } from "./birthdaysUi";

export function Avatar({ person, size = 34 }: { person: Pick<Person, "id" | "name" | "occasion">; size?: number }) {
  return (
    <span className="bd-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(person.id) }} aria-hidden="true">
      {initials(person.name)}
      {person.occasion === "anniversary" && <span className="bd-avatar-ring">💍</span>}
    </span>
  );
}

/** A tear-off calendar page: the day, and the month above it. */
export function DateBadge({ month, day, today }: { month: number; day: number; today?: boolean }) {
  return (
    <span className={`bd-date${today ? " is-today" : ""}`}>
      <span className="bd-date-month">{MONTHS[month - 1].slice(0, 3)}</span>
      <span className="bd-date-day">{day}</span>
    </span>
  );
}

/** Someone in a list: their date, name, what's coming, and the countdown. */
export function PersonRow({ person, open }: { person: Person; open: boolean }) {
  const [, m, d] = person.next.split("-").map(Number);
  const what = milestone(person);
  return (
    <button className={`bd-row${open ? " is-active" : ""}${person.days === 0 ? " is-today" : ""}`} onClick={() => setBirthdaysUi({ person: person.id })}>
      <DateBadge month={m} day={d} today={person.days === 0} />
      <Avatar person={person} />
      <span className="bd-row-text">
        <b>{person.name}</b>
        <span className="dim">
          {person.occasion === "anniversary" ? "Anniversary" : "Birthday"}
          {what && ` · ${what}`}
        </span>
      </span>
      {person.ideas > 0 && (
        <span className="bd-ideas" title={`${person.ideas} gift ${person.ideas === 1 ? "idea" : "ideas"}`}>
          <Gift size={13} strokeWidth={1.75} /> {person.ideas}
        </span>
      )}
      <span className={`bd-countdown${person.days === 0 ? " is-today" : person.days <= 7 ? " is-soon" : ""}`}>
        {person.days === 0 ? `${emojiOf(person.occasion)} Today` : countdown(person.days)}
      </span>
    </button>
  );
}
