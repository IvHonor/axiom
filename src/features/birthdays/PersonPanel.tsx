import { useState, type FormEvent } from "react";
import { Bell, ExternalLink, Gift as GiftIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { today } from "../daily_plan/time";
import { BIRTHSTONES, RELATIONS, REMINDERS, api, countdown, dateOf, emojiOf, errorMessage, milestone, starSign, type Gift, type GiftStatus, type Person } from "./api";
import { birthdaysChanged, setBirthdaysUi, usePerson } from "./birthdaysUi";
import { Avatar } from "./parts";

const STATUS: { id: GiftStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "bought", label: "Bought" },
  { id: "given", label: "Given" },
];

/** Someone: when it is, how old they're turning, a few fun facts, notes, and
 * gift ideas through to given. */
export function PersonPanel({ id }: { id: string }) {
  const { data, error } = usePerson(id);
  if (error && !data) return <p className="bd-error bd-pad">{error}</p>;
  if (!data) return <p className="dim bd-pad">Opening…</p>;
  const p = data.person;
  const sign = p.occasion === "birthday" ? starSign(p.month, p.day) : null;
  const what = milestone(p);
  const [, nm, nd] = p.next.split("-").map(Number);
  const weekday = new Date(Number(p.next.slice(0, 4)), nm - 1, nd, 12).toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <article className="bd-person">
      <header className="bd-person-head">
        <Avatar person={p} size={64} />
        <div className="bd-person-name">
          <h2>{p.name}</h2>
          <p className="dim">
            {p.occasion === "anniversary" ? "Anniversary" : "Birthday"} · {dateOf(p)} · {RELATIONS.find((r) => r.id === p.relation)?.label}
          </p>
        </div>
        <button className="icon-btn" title="Edit" aria-label="Edit" onClick={() => setBirthdaysUi({ dialog: { kind: "person", id: p.id } })}>
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button className="icon-btn" title="Close" aria-label="Close" onClick={() => setBirthdaysUi({ person: null })}>
          <X size={15} strokeWidth={1.75} />
        </button>
      </header>

      <section className={`bd-next${p.days === 0 ? " is-today" : ""}`}>
        <span className="bd-next-emoji">{emojiOf(p.occasion)}</span>
        <div>
          <b>{p.days === 0 ? (p.occasion === "anniversary" ? "It's their anniversary today!" : `It's ${p.name}'s birthday today!`) : `${countdown(p.days)}, on ${weekday}`}</b>
          <span className="dim">
            {what ? `${p.occasion === "anniversary" ? "It'll be " : "They "}${what}` : "Add the year to see their age"}
            {p.age !== null && p.days !== 0 && p.occasion === "birthday" && ` · ${p.age} now`}
          </span>
        </div>
      </section>

      <div className="bd-facts">
        {sign && (
          <span className="bd-fact" title="Star sign">
            <span className="bd-fact-icon">{sign.symbol}</span> {sign.name}
          </span>
        )}
        {p.occasion === "birthday" && (
          <span className="bd-fact" title="Birthstone">
            <span className="bd-fact-icon">💎</span> {BIRTHSTONES[p.month - 1]}
          </span>
        )}
        <span className="bd-fact" title="Reminder">
          <Bell size={13} strokeWidth={1.75} /> {REMINDERS.find((r) => r.days === p.remindDays)?.label ?? "On the day"}
        </span>
      </div>

      {p.notes && <p className="bd-notes">{p.notes}</p>}

      <Gifts person={p} gifts={data.gifts} />

      <footer className="bd-person-foot">
        <ConfirmButton
          className="btn btn-sm btn-ghost bd-delete"
          confirmText={`Delete ${p.name}?`}
          onConfirm={() =>
            api.remove(p.id).then(() => {
              setBirthdaysUi({ person: null });
              birthdaysChanged();
            })
          }
        >
          <Trash2 size={13} strokeWidth={1.75} /> Delete
        </ConfirmButton>
      </footer>
    </article>
  );
}

function Gifts({ person, gifts }: { person: Person; gifts: Gift[] }) {
  const [idea, setIdea] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const act = (p: Promise<unknown>) => p.then(() => (setError(null), birthdaysChanged()), (err) => setError(errorMessage(err)));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    act(api.addGift(person.id, { idea, url, status: "idea" }, today()).then(() => (setIdea(""), setUrl(""))));
  };
  const given = gifts.filter((g) => g.status === "given");
  const open = gifts.filter((g) => g.status !== "given");

  return (
    <section className="bd-gifts">
      <h3>
        <GiftIcon size={14} strokeWidth={1.75} /> Gift ideas
      </h3>
      {open.length === 0 && <p className="dim bd-empty">Jot ideas down as you think of them, and they'll be here when the day comes.</p>}
      {open.map((g) => (
        <GiftRow key={g.id} gift={g} act={act} />
      ))}
      <form className="bd-gift-add" onSubmit={add}>
        <input value={idea} placeholder="Add an idea…" onChange={(e) => setIdea(e.currentTarget.value)} aria-label="Gift idea" />
        <input value={url} placeholder="Link (optional)" onChange={(e) => setUrl(e.currentTarget.value)} aria-label="Link" />
        <button className="btn btn-sm" type="submit" disabled={!idea.trim()}>
          <Plus size={13} strokeWidth={2} /> Add
        </button>
      </form>
      {error && <p className="bd-error">{error}</p>}
      {given.length > 0 && (
        <>
          <h4 className="bd-given-head">Given before</h4>
          {given.map((g) => (
            <GiftRow key={g.id} gift={g} act={act} />
          ))}
        </>
      )}
    </section>
  );
}

function GiftRow({ gift, act }: { gift: Gift; act: (p: Promise<unknown>) => void }) {
  return (
    <div className={`bd-gift is-${gift.status}`}>
      <div className="bd-seg bd-seg-sm" role="radiogroup" aria-label={`${gift.idea}: status`}>
        {STATUS.map((s) => (
          <button key={s.id} role="radio" aria-checked={gift.status === s.id} className={gift.status === s.id ? "is-on" : ""} onClick={() => gift.status !== s.id && act(api.updateGift(gift.id, { idea: gift.idea, url: gift.url, status: s.id }, today()))}>
            {s.label}
          </button>
        ))}
      </div>
      <span className="bd-gift-idea">
        {gift.idea}
        {gift.year && <span className="dim"> · {gift.year}</span>}
      </span>
      {gift.url && (
        <button className="icon-btn" title={gift.url} aria-label="Open the link" onClick={() => void openUrl(gift.url)}>
          <ExternalLink size={13} strokeWidth={1.75} />
        </button>
      )}
      <button className="icon-btn" title="Remove" aria-label={`Remove ${gift.idea}`} onClick={() => act(api.removeGift(gift.id))}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
