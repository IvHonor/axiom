/** Axiom's mark, the geometric "A", in the current text colour. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 772) / 751} viewBox="-3 -3 751 772" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M372 0 623 168 372 339 120 168Z" />
        <path d="M0 464 274 292V598L0 766Z" />
        <path d="M470 292 744 464V766L470 598Z" />
      </g>
    </svg>
  );
}

/** The mark with the name beside it. */
export function Lockup() {
  return (
    <span className="lockup">
      <Mark size={22} />
      <span className="lockup-name">AXIOM</span>
    </span>
  );
}
