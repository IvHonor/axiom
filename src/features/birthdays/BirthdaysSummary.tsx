import { countdown, emojiOf, milestone } from "./api";
import { setBirthdaysUi, usePeople } from "./birthdaysUi";
import { Avatar } from "./parts";

/** The overview tile: today's celebrations, then who's next. */
export function BirthdaysSummary({ onOpen }: { onOpen: () => void }) {
  const { data: people } = usePeople();
  if (!people) return <p className="dim">Loading…</p>;
  if (people.length === 0) {
    return (
      <p className="dim">
        No birthdays yet.{" "}
        <button
          className="rd-link"
          onClick={() => {
            setBirthdaysUi({ dialog: { kind: "person", id: null } });
            onOpen();
          }}
        >
          Add someone
        </button>
      </p>
    );
  }
  const show = (id: string) => {
    setBirthdaysUi({ page: "upcoming", person: id });
    onOpen();
  };
  const todays = people.filter((p) => p.days === 0);
  const next = people.filter((p) => p.days > 0).slice(0, todays.length ? 3 : 4);

  return (
    <div className="bt-summary">
      {todays.map((p) => (
        <button key={p.id} className="bt-today" onClick={() => show(p.id)}>
          <span className="bt-today-emoji">{emojiOf(p.occasion)}</span>
          <span>
            <b>{p.occasion === "anniversary" ? `${p.name}'s anniversary` : `${p.name}'s birthday`}</b>
            <span className="dim">{milestone(p) ? `${milestone(p)} today` : "Today"}</span>
          </span>
        </button>
      ))}
      <div className="bt-list">
        {next.map((p) => (
          <button key={p.id} className="bt-row" onClick={() => show(p.id)}>
            <Avatar person={p} size={26} />
            <span className="bt-name">
              {p.name}
              {milestone(p) && <span className="dim"> · {milestone(p)}</span>}
            </span>
            <span className={`bt-when${p.days <= 7 ? " is-soon" : ""}`}>{countdown(p.days)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
