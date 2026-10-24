// Small pieces shared across Finance's views and dialogs.
import { useEffect, useState } from "react";
import { COLORS, type AccountCard, type Category } from "./api";
import { exponent, money, parseMoney, toInput } from "./money";

/** An amount coloured by direction: money in green, out in the normal colour. */
export function Amount({ minor, currency, sign = true, className }: { minor: number; currency: string; sign?: boolean; className?: string }) {
  return <span className={`fin-amount${minor > 0 ? " is-in" : ""}${className ? ` ${className}` : ""}`}>{money(minor, currency, { sign })}</span>;
}

/** Typing an amount: always a positive number, with a toggle for in or out. */
export function MoneyInput({
  value,
  currency,
  onChange,
  direction,
  onDirection,
  autoFocus,
  label = "Amount",
}: {
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  direction?: "out" | "in";
  onDirection?: (d: "out" | "in") => void;
  autoFocus?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(value === null ? "" : toInput(value, currency));
  useEffect(() => {
    // Follow outside changes (a new currency) without fighting the typing.
    setText((current) => (parseMoney(current, currency) === (value === null ? null : Math.abs(value)) ? current : value === null ? "" : toInput(value, currency)));
  }, [value, currency]);
  return (
    <span className="fin-money-input">
      {onDirection && (
        <span className="fin-direction" role="radiogroup" aria-label="Money in or out">
          <button type="button" role="radio" aria-checked={direction === "out"} className={direction === "out" ? "is-active is-out" : ""} onClick={() => onDirection("out")}>
            − Out
          </button>
          <button type="button" role="radio" aria-checked={direction === "in"} className={direction === "in" ? "is-active is-in" : ""} onClick={() => onDirection("in")}>
            + In
          </button>
        </span>
      )}
      <span className="fin-money-field">
        <span className="fin-money-code">{currency}</span>
        <input
          inputMode="decimal"
          value={text}
          autoFocus={autoFocus}
          aria-label={label}
          placeholder={exponent(currency) ? "0.00" : "0"}
          onChange={(e) => {
            setText(e.currentTarget.value);
            const parsed = parseMoney(e.currentTarget.value, currency);
            onChange(parsed === null ? null : Math.abs(parsed));
          }}
        />
      </span>
    </span>
  );
}

export function CategorySelect({
  categories,
  value,
  onChange,
  kind,
  label = "Category",
  className,
  emptyLabel = "Uncategorised",
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
  kind?: "expense" | "income";
  label?: string;
  className?: string;
  emptyLabel?: string;
}) {
  const shown = categories.filter((c) => !c.archived || c.id === value);
  const group = (k: "expense" | "income") => shown.filter((c) => c.kind === k);
  const order: ("expense" | "income")[] = kind === "income" ? ["income", "expense"] : ["expense", "income"];
  return (
    <select className={className ?? "fin-select"} value={value ?? ""} aria-label={label} onChange={(e) => onChange(e.currentTarget.value || null)}>
      <option value="">{emptyLabel}</option>
      {order.map((k) => (
        <optgroup key={k} label={k === "expense" ? "Spending" : "Income"}>
          {group(k).map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function AccountSelect({ accounts, value, onChange, label = "Account", exclude }: { accounts: AccountCard[]; value: string; onChange: (id: string) => void; label?: string; exclude?: string }) {
  return (
    <select className="fin-select" value={value} aria-label={label} onChange={(e) => onChange(e.currentTarget.value)}>
      {accounts
        .filter((a) => (!a.archived || a.id === value) && a.id !== exclude)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency})
          </option>
        ))}
    </select>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <span className="fin-swatches" role="radiogroup" aria-label="Colour">
      {Object.entries(COLORS).map(([name, hex]) => (
        <button key={name} type="button" role="radio" aria-checked={name === value} aria-label={name} className={name === value ? "is-active" : undefined} style={{ background: hex }} onClick={() => onChange(name)} />
      ))}
    </span>
  );
}

/** A thin bar: `percent` filled, red past 100. */
export function Bar({ percent, color }: { percent: number; color?: string }) {
  const over = percent > 100;
  return (
    <span className={`fin-bar${over ? " is-over" : ""}`} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: over ? undefined : color }} />
    </span>
  );
}

export const dot = (color: string) => ({ background: COLORS[color] ?? COLORS.slate });
