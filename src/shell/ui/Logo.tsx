/** Supplied Axiom artwork, tinted with the surrounding theme's text colour. Size is its height. */
export function Logo({ size = 22, variant = "mark" }: {
  size?: number;
  variant?: "mark" | "wordmark" | "lockup";
}) {
  return <span className={`brand-art brand-${variant}`} style={{ height: size }}
    role="img" aria-label="Axiom" />;
}
