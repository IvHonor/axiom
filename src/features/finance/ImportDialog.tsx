import { useMemo, useRef, useState, type DragEvent } from "react";
import { CheckCircle2, FileUp, Link2, Upload } from "lucide-react";
import { Modal } from "../../shell/ui/Modal";
import { mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, type FinanceState, type ImportPreview, type Mapping } from "./api";
import { financeChanged, setFinanceUi } from "./financeUi";
import { AccountSelect, Amount, CategorySelect } from "./parts";

const DATE_FORMATS: { id: string; label: string }[] = [
  { id: "%d/%m/%Y", label: "23/10/2026" },
  { id: "%m/%d/%Y", label: "10/23/2026" },
  { id: "%Y-%m-%d", label: "2026-10-23" },
  { id: "%d-%m-%Y", label: "23-10-2026" },
  { id: "%d.%m.%Y", label: "23.10.2026" },
  { id: "%d/%m/%y", label: "23/10/26" },
  { id: "%m/%d/%y", label: "10/23/26" },
  { id: "%d %b %Y", label: "23 Oct 2026" },
  { id: "%d-%b-%Y", label: "23-Oct-2026" },
  { id: "%Y/%m/%d", label: "2026/10/23" },
  { id: "%Y%m%d", label: "20261023" },
];

interface Choice {
  include: boolean;
  categoryId: string | null;
  /** Link to a transaction entered by hand rather than add a new one. */
  link: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
}

/** Import a bank or credit card statement: pick the account and the file,
 * check what it found, then add it. */
export function ImportDialog({ state, accountId }: { state: FinanceState; accountId?: string }) {
  const open = state.accounts.filter((a) => !a.archived);
  const [account, setAccount] = useState(accountId ?? open[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; contents: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const close = () => setFinanceUi({ dialog: null });
  const currency = state.accounts.find((a) => a.id === account)?.currency ?? "GBP";

  const read = async (chosen: { name: string; contents: string }, onto: string, mapping: Mapping | null) => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.importPreview(onto, chosen.name, chosen.contents, mapping);
      setPreview(p);
      setChoices(Object.fromEntries(p.rows.map((r) => [r.importRef, { include: r.duplicate !== "imported", categoryId: r.categoryId, link: r.duplicate === "entered" }])));
      setBank((b) => b || p.profile || chosen.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const take = async (f: File | undefined) => {
    if (!f) return;
    try {
      const chosen = { name: f.name, contents: await fileToBase64(f) };
      setFile(chosen);
      await read(chosen, account, null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remap = (change: Partial<Mapping>) => {
    if (!file || !preview?.mapping) return;
    void read(file, account, { ...preview.mapping, ...change });
  };

  const rows = preview?.rows ?? [];
  const chosen = rows.filter((r) => choices[r.importRef]?.include);
  const counts = useMemo(
    () => ({
      imported: rows.filter((r) => r.duplicate === "imported").length,
      entered: rows.filter((r) => r.duplicate === "entered").length,
    }),
    [rows],
  );

  const commit = async () => {
    if (!preview || !file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importCommit(
        account,
        chosen.map((r) => {
          const c = choices[r.importRef];
          return { importRef: r.importRef, day: r.day, amount: r.amount, payee: r.payee, notes: r.notes, categoryId: c.categoryId, matches: c.link ? r.matches : null };
        }),
        file.name,
        preview.format === "csv" ? file.contents : null,
        preview.mapping,
        bank,
        today(),
      );
      setDone(result);
      financeChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };

  if (done) {
    return (
      <Modal title="Statement imported" icon={<CheckCircle2 size={16} strokeWidth={1.75} />} onClose={close}>
        <div className="fin-import-done">
          <CheckCircle2 size={32} strokeWidth={1.5} />
          <p>
            Added <b>{done[0]}</b> transaction{done[0] === 1 ? "" : "s"}
            {done[1] > 0 && (
              <>
                , and matched <b>{done[1]}</b> you&apos;d already entered
              </>
            )}
            .
          </p>
          <p className="dim">Categories you chose are remembered for those payees next time.</p>
          <button className="btn" onClick={close}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Import a statement" icon={<FileUp size={16} strokeWidth={1.75} />} onClose={close}>
      <div className="fin-import">
        <div className="fin-pair">
          <label className="fin-field">
            <span className="fin-field-label">Into</span>
            <AccountSelect
              accounts={state.accounts}
              value={account}
              onChange={(id) => {
                setAccount(id);
                if (file) void read(file, id, null);
              }}
            />
          </label>
          {preview?.format === "csv" && (
            <label className="fin-field">
              <span className="fin-field-label">Bank (to remember its layout)</span>
              <input className="fin-input" value={bank} onChange={(e) => setBank(e.currentTarget.value)} />
            </label>
          )}
        </div>

        <div
          className={`fin-drop${dragging ? " is-over" : ""}${file ? " has-file" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => picker.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && picker.current?.click()}
        >
          <Upload size={20} strokeWidth={1.5} />
          {file ? (
            <span>
              <b>{file.name}</b> · choose another
            </span>
          ) : (
            <span>
              Drop a statement here, or <u>choose a file</u>
              <small>CSV, OFX, QFX or QIF from your bank or card. PDF isn&apos;t supported yet: download CSV instead.</small>
            </span>
          )}
          <input ref={picker} type="file" accept=".csv,.ofx,.qfx,.qif,.txt" hidden onChange={(e) => void take(e.currentTarget.files?.[0]).then(() => (e.target.value = ""))} />
        </div>

        {error && <p className="fin-error">{error}</p>}
        {busy && !preview && <p className="dim">Reading…</p>}

        {preview && (
          <>
            <div className="fin-import-summary">
              <span className="fin-chip">{preview.format.toUpperCase()}</span>
              <span className="fin-chip">
                {rows.length} transaction{rows.length === 1 ? "" : "s"}
              </span>
              {counts.imported > 0 && <span className="fin-chip is-muted">{counts.imported} imported before</span>}
              {counts.entered > 0 && (
                <span className="fin-chip">
                  <Link2 size={12} strokeWidth={1.75} /> {counts.entered} match ones you entered
                </span>
              )}
              {preview.skipped > 0 && <span className="fin-chip is-muted">{preview.skipped} lines skipped (no date or amount)</span>}
              {preview.profile && <span className="fin-chip">Using your saved {preview.profile} layout</span>}
            </div>

            {preview.mapping && <ColumnMapping preview={preview} onChange={remap} />}

            <div className="fin-import-table">
              <div className="fin-import-row is-head">
                <span>
                  <input
                    type="checkbox"
                    aria-label="Include all"
                    checked={chosen.length === rows.length && rows.length > 0}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setChoices((all) => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v, include: on }])));
                    }}
                  />
                </span>
                <span>Date</span>
                <span>Payee</span>
                <span>Category</span>
                <span className="fin-right">Amount</span>
              </div>
              {rows.map((r) => {
                const c = choices[r.importRef];
                if (!c) return null;
                const set = (change: Partial<Choice>) => setChoices((all) => ({ ...all, [r.importRef]: { ...all[r.importRef], ...change } }));
                return (
                  <div key={r.importRef} className={`fin-import-row${c.include ? "" : " is-off"}`}>
                    <span>
                      <input type="checkbox" aria-label={`Include ${r.payee}`} checked={c.include} onChange={(e) => set({ include: e.currentTarget.checked })} />
                    </span>
                    <span className="dim">{mediumDay(r.day)}</span>
                    <span className="fin-import-payee">
                      <span title={r.notes || r.payee}>{r.payee || r.notes || "—"}</span>
                      {r.duplicate === "imported" && <span className="fin-badge is-muted">Imported before</span>}
                      {r.duplicate === "entered" && (
                        <button type="button" className={`fin-badge${c.link ? "" : " is-muted"}`} title="It looks like one you entered by hand" onClick={() => set({ link: !c.link })}>
                          <Link2 size={11} strokeWidth={1.75} /> {c.link ? "Matches yours: won't add twice" : "Add as new"}
                        </button>
                      )}
                    </span>
                    <span>
                      {c.link ? (
                        <span className="dim">Keeps yours</span>
                      ) : (
                        <CategorySelect categories={state.categories} value={c.categoryId} onChange={(id) => set({ categoryId: id })} kind={r.amount > 0 ? "income" : "expense"} className="fin-select fin-select-sm" />
                      )}
                    </span>
                    <span className="fin-right">
                      <Amount minor={r.amount} currency={currency} />
                    </span>
                  </div>
                );
              })}
              {rows.length === 0 && <p className="dim fin-pad">Nothing to import in that file.</p>}
            </div>

            <footer className="fin-dialog-foot">
              <span className="dim fin-small">{chosen.length} selected</span>
              <span className="fin-fill" />
              <button className="btn" disabled={busy || chosen.length === 0} onClick={() => void commit()}>
                {busy ? "Importing…" : `Import ${chosen.length}`}
              </button>
            </footer>
          </>
        )}
      </div>
    </Modal>
  );
}

/** How the CSV's columns are read, guessed and correctable. */
function ColumnMapping({ preview, onChange }: { preview: ImportPreview; onChange: (change: Partial<Mapping>) => void }) {
  const m = preview.mapping!;
  const [open, setOpen] = useState(false);
  const columns = preview.columns;
  const select = (value: number | null, on: (v: number | null) => void, allowNone = true) => (
    <select className="fin-select fin-select-sm" value={value ?? ""} onChange={(e) => on(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}>
      {allowNone && <option value="">—</option>}
      {columns.map((c, i) => (
        <option key={i} value={i}>
          {c || `Column ${i + 1}`}
        </option>
      ))}
    </select>
  );
  const name = (i: number | null) => (i === null ? "" : columns[i] || `column ${i + 1}`);
  const summary = [
    `Dates from “${name(m.date)}”`,
    m.amount !== null ? `amounts from “${name(m.amount)}”` : `money out “${name(m.debit)}”, in “${name(m.credit)}”`,
    m.invert ? "purchases flipped to spending" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fin-mapping">
      <button type="button" className="fin-mapping-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{summary}</span>
        <span className="link">{open ? "Done" : "Change columns"}</span>
      </button>
      {open && (
        <div className="fin-mapping-grid">
          <label>
            Date {select(m.date, (v) => v !== null && onChange({ date: v }), false)}
          </label>
          <label>
            Date format
            <select className="fin-select fin-select-sm" value={m.dateFormat} onChange={(e) => onChange({ dateFormat: e.currentTarget.value })}>
              {DATE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payee {select(m.description[0] ?? null, (v) => onChange({ description: v === null ? [] : [v, ...m.description.slice(1).filter((d) => d !== v)] }))}
          </label>
          <label>
            Details {select(m.description[1] ?? null, (v) => onChange({ description: [m.description[0], v].filter((d): d is number => d !== null && d !== undefined) }))}
          </label>
          <label>
            Amount {select(m.amount, (v) => onChange({ amount: v }))}
          </label>
          <label>
            Money out {select(m.debit, (v) => onChange({ debit: v }))}
          </label>
          <label>
            Money in {select(m.credit, (v) => onChange({ credit: v }))}
          </label>
          <label className="fin-check">
            <input type="checkbox" checked={m.decimalComma} onChange={(e) => onChange({ decimalComma: e.currentTarget.checked })} /> Decimal comma (12,50)
          </label>
          <label className="fin-check">
            <input type="checkbox" checked={m.invert} onChange={(e) => onChange({ invert: e.currentTarget.checked })} /> Purchases show as positive (credit card)
          </label>
        </div>
      )}
    </div>
  );
}
