import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeftRight, Landmark, Repeat, Tags, Trash2, Wallet } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Modal } from "../../shell/ui/Modal";
import { today } from "../daily_plan/time";
import { ACCOUNT_KINDS, api, errorMessage, type AccountKind, type CategoryKind, type Every, type FinanceState, type Transaction } from "./api";
import { financeChanged, setFinanceUi } from "./financeUi";
import { currencies } from "./money";
import { AccountSelect, CategorySelect, ColorPicker, MoneyInput } from "./parts";

/** Runs a save; closes on success, shows the error otherwise. */
function useSave(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      financeChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="fin-field">
      <span className="fin-field-label">{label}</span>
      {children}
      {hint && <small className="dim">{hint}</small>}
    </label>
  );
}

function Foot({ busy, disabled, label, onDelete, deleteText }: { busy: boolean; disabled?: boolean; label: string; onDelete?: () => void; deleteText?: string }) {
  return (
    <footer className="fin-dialog-foot">
      {onDelete && (
        <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText={deleteText ?? "Delete? Click again"} onConfirm={onDelete}>
          <Trash2 size={14} strokeWidth={1.75} /> Delete
        </ConfirmButton>
      )}
      <span className="fin-fill" />
      <button className="btn" type="submit" disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </button>
    </footer>
  );
}

const close = () => setFinanceUi({ dialog: null });

export function TransactionDialog({ state, transaction, accountId }: { state: FinanceState; transaction: Transaction | null; accountId?: string }) {
  const open = state.accounts.filter((a) => !a.archived);
  const pair = transaction?.transferId ? transaction : null;
  const [mode, setMode] = useState<"money" | "transfer">(pair ? "transfer" : "money");
  const [account, setAccount] = useState(transaction?.accountId ?? accountId ?? open[0]?.id ?? "");
  const [direction, setDirection] = useState<"out" | "in">(transaction && transaction.amount > 0 ? "in" : "out");
  const [amount, setAmount] = useState<number | null>(transaction ? Math.abs(transaction.amount) : null);
  const [to, setTo] = useState(open.find((a) => a.id !== account)?.id ?? "");
  const [arrives, setArrives] = useState<number | null>(null);
  const [day, setDay] = useState(transaction?.day ?? today());
  const [payee, setPayee] = useState(transaction?.payee ?? "");
  const [category, setCategory] = useState<string | null>(transaction?.categoryId ?? null);
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const { busy, error, run } = useSave(close);

  const from = state.accounts.find((a) => a.id === account);
  const target = state.accounts.find((a) => a.id === to);
  const currency = from?.currency ?? state.settings?.homeCurrency ?? "GBP";
  const differentCurrency = mode === "transfer" && !!target && target.currency !== currency;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (amount === null || !account) return;
    const signed = mode === "transfer" ? -Math.abs(amount) : direction === "out" ? -amount : amount;
    const fields = {
      accountId: account,
      day,
      amount: signed,
      payee,
      categoryId: mode === "transfer" ? null : category,
      notes,
      transferAccountId: mode === "transfer" && !transaction ? to : null,
      transferAmount: differentCurrency ? arrives : null,
    };
    run(() => (transaction ? api.updateTransaction(transaction.id, fields) : api.addTransaction(fields)));
  };

  return (
    <Modal title={transaction ? (pair ? "Edit transfer" : "Edit transaction") : "Add a transaction"} icon={<Wallet size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="fin-dialog" onSubmit={submit}>
        {error && <p className="fin-error">{error}</p>}
        {!transaction && (
          <span className="pb-segmented fin-mode" role="radiogroup">
            <button type="button" role="radio" aria-checked={mode === "money"} className={mode === "money" ? "is-active" : undefined} onClick={() => setMode("money")}>
              Income or spending
            </button>
            <button type="button" role="radio" aria-checked={mode === "transfer"} className={mode === "transfer" ? "is-active" : undefined} onClick={() => setMode("transfer")} disabled={open.length < 2}>
              <ArrowLeftRight size={13} strokeWidth={1.75} /> Transfer
            </button>
          </span>
        )}
        <Field label="Amount">
          <MoneyInput value={amount} currency={currency} onChange={setAmount} direction={mode === "money" ? direction : undefined} onDirection={mode === "money" ? setDirection : undefined} autoFocus />
        </Field>
        <div className="fin-pair">
          <Field label={mode === "transfer" ? "From" : "Account"}>
            <AccountSelect accounts={state.accounts} value={account} onChange={setAccount} />
          </Field>
          {mode === "transfer" && !transaction && (
            <Field label="To">
              <AccountSelect accounts={state.accounts} value={to} onChange={setTo} exclude={account} label="To account" />
            </Field>
          )}
        </div>
        {differentCurrency && target && (
          <Field label={`Arrives in ${target.name}`} hint="Different currencies: enter what actually arrived.">
            <MoneyInput value={arrives} currency={target.currency} onChange={setArrives} label="Amount that arrives" />
          </Field>
        )}
        <div className="fin-pair">
          <Field label="Date">
            <input type="date" className="fin-input" value={day} onChange={(e) => setDay(e.currentTarget.value)} required />
          </Field>
          {mode === "money" && (
            <Field label="Category">
              <CategorySelect categories={state.categories} value={category} onChange={setCategory} kind={direction === "in" ? "income" : "expense"} />
            </Field>
          )}
        </div>
        <Field label={mode === "transfer" ? "Description (optional)" : "Payee or description"}>
          <input className="fin-input" value={payee} placeholder={mode === "transfer" ? "e.g. Monthly savings" : "e.g. Tesco"} onChange={(e) => setPayee(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="fin-input fin-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <Foot
          busy={busy}
          disabled={amount === null || !account || (differentCurrency && arrives === null)}
          label={transaction ? "Save" : "Add"}
          onDelete={transaction ? () => run(() => api.deleteTransaction(transaction.id)) : undefined}
          deleteText={pair ? "Delete both sides of the transfer? Click again" : undefined}
        />
      </form>
    </Modal>
  );
}

export function AccountDialog({ state, id }: { state: FinanceState; id: string | null }) {
  const existing = state.accounts.find((a) => a.id === id) ?? null;
  const home = state.settings?.homeCurrency ?? "GBP";
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? "current");
  const [currency, setCurrency] = useState(existing?.currency ?? home);
  const [opening, setOpening] = useState<number | null>(existing ? Math.abs(existing.openingBalance) : 0);
  const [owed, setOwed] = useState(existing ? existing.openingBalance < 0 : false);
  const [color, setColor] = useState(existing?.color ?? "blue");
  const { busy, error, run } = useSave(close);
  const locked = !!existing && existing.transactions > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // What's owed on a card, or an overdraft, is money below zero.
    const signed = kind === "credit" || owed ? -(opening ?? 0) : (opening ?? 0);
    const fields = { name, kind, currency, openingBalance: signed, color };
    run(() => (existing ? api.updateAccount(existing.id, fields) : api.addAccount(fields)));
  };

  return (
    <Modal title={existing ? "Edit account" : "Add an account"} icon={<Landmark size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="fin-dialog" onSubmit={submit}>
        {error && <p className="fin-error">{error}</p>}
        <Field label="Name">
          <input className="fin-input" required autoFocus value={name} placeholder="e.g. Monzo, Barclaycard, Cash" onChange={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Kind">
          <span className="pb-segmented" role="radiogroup">
            {ACCOUNT_KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? "is-active" : undefined} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </span>
        </Field>
        <div className="fin-pair">
          <Field label="Currency" hint={locked ? "Fixed once it has transactions." : undefined}>
            <select className="fin-select" value={currency} disabled={locked} onChange={(e) => setCurrency(e.currentTarget.value)}>
              {currencies().map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={kind === "credit" ? "Owed when you started" : "Balance when you started"}>
            <MoneyInput value={opening} currency={currency} onChange={setOpening} label="Starting balance" />
          </Field>
        </div>
        {kind !== "credit" && (
          <label className="fin-check">
            <input type="checkbox" checked={owed} onChange={(e) => setOwed(e.currentTarget.checked)} /> It was overdrawn
          </label>
        )}
        <Field label="Colour">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Foot
          busy={busy}
          disabled={!name.trim()}
          label={existing ? "Save" : "Add account"}
          onDelete={existing ? () => run(() => api.deleteAccount(existing.id)) : undefined}
          deleteText={existing && existing.transactions > 0 ? `Delete it and its ${existing.transactions} transactions? Click again` : undefined}
        />
      </form>
    </Modal>
  );
}

const ICONS = ["🛒", "🍽️", "☕", "🚆", "🚗", "⛽", "🏠", "💡", "📱", "🔁", "🛍️", "👕", "🎬", "🎮", "🩺", "💊", "✈️", "🏨", "🎓", "📚", "🎁", "🐾", "👶", "💇", "🏋️", "🍺", "📦", "💼", "🧾", "🏦", "💰", "↩️", "📈"];

export function CategoryDialog({ state, id, categoryKind }: { state: FinanceState; id: string | null; categoryKind?: CategoryKind }) {
  const existing = state.categories.find((c) => c.id === id) ?? null;
  const home = state.settings?.homeCurrency ?? "GBP";
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? categoryKind ?? "expense");
  const [icon, setIcon] = useState(existing?.icon ?? "📦");
  const [color, setColor] = useState(existing?.color ?? "slate");
  const [budget, setBudget] = useState<number | null>(existing?.budget ?? null);
  const { busy, error, run } = useSave(close);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { name, kind, icon, color, budget: kind === "expense" && budget ? budget : null };
    run(() => (existing ? api.updateCategory(existing.id, fields) : api.addCategory(fields)));
  };

  return (
    <Modal title={existing ? "Edit category" : "Add a category"} icon={<Tags size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="fin-dialog" onSubmit={submit}>
        {error && <p className="fin-error">{error}</p>}
        <div className="fin-pair">
          <Field label="Name">
            <input className="fin-input" required autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
          </Field>
          <Field label="For">
            <span className="pb-segmented" role="radiogroup">
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-active" : undefined} onClick={() => setKind(k)}>
                  {k === "expense" ? "Spending" : "Income"}
                </button>
              ))}
            </span>
          </Field>
        </div>
        <Field label="Icon">
          <span className="fin-icons" role="radiogroup">
            {ICONS.map((i) => (
              <button key={i} type="button" role="radio" aria-checked={icon === i} className={icon === i ? "is-active" : undefined} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </span>
        </Field>
        <Field label="Colour">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        {kind === "expense" && (
          <Field label="Monthly budget (optional)" hint="How much you mean to spend on it each month. Leave empty for no budget.">
            <MoneyInput value={budget} currency={home} onChange={setBudget} label="Monthly budget" />
          </Field>
        )}
        <Foot
          busy={busy}
          disabled={!name.trim()}
          label={existing ? "Save" : "Add category"}
          onDelete={existing ? () => run(() => api.deleteCategory(existing.id)) : undefined}
          deleteText="Delete it? Its transactions become uncategorised. Click again"
        />
      </form>
    </Modal>
  );
}

const EVERY: { id: Every; label: string }[] = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

export function RecurringDialog({ state, id }: { state: FinanceState; id: string | null }) {
  const existing = state.recurring.find((r) => r.id === id) ?? null;
  const open = state.accounts.filter((a) => !a.archived);
  const [name, setName] = useState(existing?.name ?? "");
  const [account, setAccount] = useState(existing?.accountId ?? open[0]?.id ?? "");
  const [direction, setDirection] = useState<"out" | "in">(existing && existing.amount > 0 ? "in" : "out");
  const [amount, setAmount] = useState<number | null>(existing ? Math.abs(existing.amount) : null);
  const [category, setCategory] = useState<string | null>(existing?.categoryId ?? null);
  const [every, setEvery] = useState<Every>(existing?.every ?? "month");
  const [startsOn, setStartsOn] = useState(existing?.startsOn ?? today());
  const [endsOn, setEndsOn] = useState(existing?.endsOn ?? "");
  const { busy, error, run } = useSave(close);
  const currency = state.accounts.find((a) => a.id === account)?.currency ?? "GBP";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (amount === null) return;
    const fields = { name, amount: direction === "out" ? -amount : amount, accountId: account, categoryId: category, every, startsOn, endsOn: endsOn || null };
    run(() => (existing ? api.updateRecurring(existing.id, fields) : api.addRecurring(fields)));
  };

  return (
    <Modal title={existing ? "Edit recurring" : "Add something recurring"} icon={<Repeat size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="fin-dialog" onSubmit={submit}>
        {error && <p className="fin-error">{error}</p>}
        <p className="dim fin-dialog-intro">Salary, rent, subscriptions: each time it comes round, it appears for you to confirm with one click.</p>
        <Field label="Name">
          <input className="fin-input" required autoFocus value={name} placeholder="e.g. Rent, Netflix, Salary" onChange={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Amount" hint="Confirm a different amount any month it varies.">
          <MoneyInput value={amount} currency={currency} onChange={setAmount} direction={direction} onDirection={setDirection} />
        </Field>
        <div className="fin-pair">
          <Field label="Account">
            <AccountSelect accounts={state.accounts} value={account} onChange={setAccount} />
          </Field>
          <Field label="Category">
            <CategorySelect categories={state.categories} value={category} onChange={setCategory} kind={direction === "in" ? "income" : "expense"} />
          </Field>
        </div>
        <Field label="Repeats">
          <span className="pb-segmented" role="radiogroup">
            {EVERY.map((e) => (
              <button key={e.id} type="button" role="radio" aria-checked={every === e.id} className={every === e.id ? "is-active" : undefined} onClick={() => setEvery(e.id)}>
                {e.label}
              </button>
            ))}
          </span>
        </Field>
        <div className="fin-pair">
          <Field label={every === "month" ? "First one (and the day each month)" : "First one"}>
            <input type="date" className="fin-input" value={startsOn} onChange={(e) => setStartsOn(e.currentTarget.value)} required />
          </Field>
          <Field label="Ends (optional)">
            <input type="date" className="fin-input" value={endsOn} onChange={(e) => setEndsOn(e.currentTarget.value)} />
          </Field>
        </div>
        <Foot busy={busy} disabled={!name.trim() || amount === null || !account} label={existing ? "Save" : "Add"} onDelete={existing ? () => run(() => api.deleteRecurring(existing.id)) : undefined} />
      </form>
    </Modal>
  );
}
