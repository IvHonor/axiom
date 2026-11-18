// Icons for what Lemma can wear, drawn like Lucide's (24×24, round strokes in
// the current colour), for the things Lucide has no icon for.
import type { SVGProps } from "react";

type IconProps = { size?: number; strokeWidth?: number };

function Icon({ size = 20, strokeWidth = 1.5, children, ...rest }: IconProps & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** A baseball cap: the crown, its seam and button, and the peak. */
export const CapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 15a8 8 0 0 1 16 0" />
    <path d="M12 7c-1.8 2-2.6 4.8-2.6 8" />
    <path d="M3 15h18.2c1.1 0 1.4 1.8.3 2.1-3.1.8-6.2.9-9.5.9" />
    <circle cx="12" cy="6.6" r=".6" />
  </Icon>
);

/** A knitted beanie: the crown, a ribbed cuff and a bobble. */
export const BeanieIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="4.5" r="1.5" />
    <path d="M5 15c0-5 3-8.5 7-8.5s7 3.5 7 8.5" />
    <rect x="4" y="15" width="16" height="4" rx="1" />
    <path d="M8.5 15v4M12 15v4M15.5 15v4" />
  </Icon>
);

/** A fedora: the pinched crown, its band and a wide brim. */
export const FedoraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 16.5c3 2 17 2 20 0" />
    <path d="M6 16.5 7.4 9.2c.4-1.6 1.9-2.2 3.1-1.2l1.5 1 1.5-1c1.2-1 2.7-.4 3.1 1.2L18 16.5" />
    <path d="M6.6 13.4h10.8" />
  </Icon>
);

/** A bow tie: two wings and the knot. */
export const BowTieIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 10.6 4 7.5v9l6.5-3.1" />
    <path d="M13.5 10.6 20 7.5v9l-6.5-3.1" />
    <rect x="10.5" y="10" width="3" height="4" rx=".8" />
  </Icon>
);

/** A tie: the knot and the blade. */
export const TieIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3H16L14 8H10ZM10 8H14L17 18L12 22L7 18Z" />
  </Icon>
);

/** Sunglasses: Lucide's glasses with dark lenses. */
export const SunglassesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="15" r="4" fill="currentColor" fillOpacity=".55" />
    <circle cx="18" cy="15" r="4" fill="currentColor" fillOpacity=".55" />
    <path d="M14 15a2 2 0 0 0-4 0" />
    <path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2" />
    <path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2" />
  </Icon>
);
