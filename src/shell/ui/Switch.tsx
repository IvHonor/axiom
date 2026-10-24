/** An on/off switch. */
export function Switch({ on, onChange, label, disabled, title }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title ?? label}
      className={`switch${on ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="switch-thumb" />
    </button>
  );
}
