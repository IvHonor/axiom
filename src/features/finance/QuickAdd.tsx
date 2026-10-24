import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CornerDownLeft, SlidersHorizontal, Tag, Wallet } from "lucide-react";
import { mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, type FinanceState, type QuickEntry } from "./api";
import { financeChanged, setFinanceUi } from "./financeUi";
import { money, monthFirst } from "./money";

const HINTS = ["12.50 coffee", "+2400 salary", "€30 dinner yesterday", "45 train friday #transport", "9.99 netflix @amex"];

/** One line to add a transaction: "12.50 coffee yesterday". Shows what it
 * read as you type; Enter adds it. */
export function QuickAdd({ state }: { state: FinanceState }) {
  const [text, setText] = useState("");
  const [entry, setEntry] = useState<QuickEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!text.trim()) {
      setEntry(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api.quick(text, today(), monthFirst()).then((e) => live && setEntry(e), () => live && setEntry(null));
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [text]);

  const open = state.accounts.filter((a) => !a.archived);
  // The account: the one named, else one in the currency typed, else the first.
  const account = entry ? (open.find((a) => a.id === entry.accountId) ?? open.find((a) => a.currency === entry.currency) ?? open[0]) : open[0];
  const category = state.categories.find((c) => c.id === entry?.categoryId);
  const mismatch = !!entry && !!account && entry.currency !== account.currency;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!entry || entry.amount === null || !account || mismatch) return;
    setBusy(true);
    try {
      await api.addTransaction({ accountId: account.id, day: entry.day, amount: entry.amount, payee: entry.payee, categoryId: entry.categoryId, notes: "" });
      setText("");
      setError(null);
      financeChanged();
      input.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fin-quick" onSubmit={submit}>
      <div className="fin-quick-bar">
        <input
          ref={input}
          value={text}
          placeholder={`Add a transaction: ${hint}`}
          aria-label="Quick add a transaction"
          onChange={(e) => setText(e.currentTarget.value)}
          disabled={busy}
        />
        <button type="submit" className="btn btn-sm" disabled={busy || !entry || entry.amount === null || mismatch} title="Add (Enter)">
          <CornerDownLeft size={14} strokeWidth={1.75} /> Add
        </button>
        <button type="button" className="icon-btn" title="Add with all the details" aria-label="Add with all the details" onClick={() => setFinanceUi({ dialog: { kind: "transaction", transaction: null } })}>
          <SlidersHorizontal size={15} strokeWidth={1.75} />
        </button>
      </div>
      {entry && (
        <div className="fin-quick-preview" aria-live="polite">
          {entry.amount === null ? (
            <span className="dim">Type an amount, like 12.50</span>
          ) : (
            <span className={`fin-chip fin-chip-amount${entry.amount > 0 ? " is-in" : ""}`}>{money(entry.amount, entry.currency, { sign: true })}</span>
          )}
          {entry.payee && <span className="fin-chip">{entry.payee}</span>}
          <span className="fin-chip">
            <Tag size={12} strokeWidth={1.75} /> {category ? `${category.icon} ${category.name}` : "Uncategorised"}
          </span>
          <span className="fin-chip">
            <CalendarDays size={12} strokeWidth={1.75} /> {entry.day === today() ? "Today" : mediumDay(entry.day)}
          </span>
          {account && (
            <span className="fin-chip">
              <Wallet size={12} strokeWidth={1.75} /> {account.name}
            </span>
          )}
          {mismatch && <span className="fin-quick-warn">No {entry.currency} account yet: add one under Accounts, or type it in {account?.currency}.</span>}
        </div>
      )}
      {error && <p className="fin-error">{error}</p>}
    </form>
  );
}
