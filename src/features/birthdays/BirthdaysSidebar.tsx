import { CalendarDays, PartyPopper, UserPlus, Users } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { RELATIONS, countdown, emojiOf } from "./api";
import { setBirthdaysUi, useBirthdaysUi, usePeople, type BirthdaysPage } from "./birthdaysUi";
import { Avatar } from "./parts";

/** The Birthdays side panel: its pages, who's next, and groups. */
export function BirthdaysSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useBirthdaysUi();
  const { data: people } = usePeople();
  const go = (page: BirthdaysPage, change: Parameters<typeof setBirthdaysUi>[0] = {}) => {
    setBirthdaysUi({ page, ...change });
    onOpen();
  };
  const nav = (page: BirthdaysPage, label: string, Icon: typeof Users) => (
    <button key={page} className={`nav-item${active && ui.page === page && !(page === "everyone" && ui.relation) ? " is-active" : ""}`} onClick={() => go(page, page === "everyone" ? { relation: null } : {})}>
      <Icon size={14} strokeWidth={1.5} />
      <span className="bs-name">{label}</span>
    </button>
  );
  const next = (people ?? []).filter((p) => p.days <= 30).slice(0, 5);

  return (
    <>
      <Section title="Birthdays">
        {nav("upcoming", "Upcoming", PartyPopper)}
        {nav("calendar", "Calendar", CalendarDays)}
        {nav("everyone", "Everyone", Users)}
        <button
          className="nav-item"
          onClick={() => {
            setBirthdaysUi({ dialog: { kind: "person", id: null } });
            onOpen();
          }}
        >
          <UserPlus size={14} strokeWidth={1.5} />
          <span className="bs-name">Add someone</span>
        </button>
      </Section>
      {next.length > 0 && (
        <Section title="Coming up">
          <div className="bs-next">
            {next.map((p) => (
              <button key={p.id} className="bs-person" onClick={() => go("upcoming", { person: p.id })}>
                <Avatar person={p} size={24} />
                <span className="bs-person-name">{p.name}</span>
                <span className={`bs-when${p.days === 0 ? " is-today" : ""}`}>{p.days === 0 ? emojiOf(p.occasion) + " Today" : countdown(p.days)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      {people && people.length > 0 && (
        <Section title="Groups">
          {RELATIONS.map((r) => {
            const n = people.filter((p) => p.relation === r.id).length;
            return (
              n > 0 && (
                <button key={r.id} className={`nav-item${active && ui.page === "everyone" && ui.relation === r.id ? " is-active" : ""}`} onClick={() => go("everyone", { relation: r.id })}>
                  <span className="bs-name">{r.label}</span>
                  <span className="bs-count">{n}</span>
                </button>
              )
            );
          })}
        </Section>
      )}
    </>
  );
}
