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

/** A top hat: the tall crown, its band and the brim. */
export const TopHatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 18c3 1.6 15 1.6 18 0" />
    <path d="M7 17.6 6.5 5h11L17 17.6" />
    <path d="M6.9 13.5h10.2" />
  </Icon>
);

/** A watchmaker's loupe: a toothed eyepiece and its strap. */
export const LoupeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="14" cy="12" r="4" />
    <circle cx="14" cy="12" r="7" strokeDasharray="2 1.7" />
    <path d="M7 12c-1.7-.8-3.2-.8-5 0" />
  </Icon>
);

/** A bolo tie: a cord through a gear clasp, with two ends. */
export const CogBoloIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3c1 4 3.6 6 5 7.5M19 3c-1 4-3.6 6-5 7.5" />
    <circle cx="12" cy="13" r="3.2" strokeDasharray="1.6 1.2" />
    <path d="M10.8 16.2 10 22M13.2 16.2 14 22" />
  </Icon>
);

/** A soft scribe's cap with a feather. */
export const ScribeCapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16c-1.4-3.4 1.6-7 7.5-7 5.8 0 9.5 2.8 8.5 7" />
    <path d="M4 16c4.8 1.6 11.2 1.6 16 0" />
    <path d="M8 11C6.5 7.8 7 4.5 9.5 3c1.2 2.4 1 5.4-.2 7.4" />
  </Icon>
);

/** A ribbon bookmark with a split end. */
export const RibbonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h6v18l-3-3-3 3Z" />
    <path d="M9 7h6" />
  </Icon>
);

/** A deerstalker: a rounded crown with a peak front and back. */
export const DeerstalkerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 15c-.5-5.5 2-9 6-9s6.500 3.500 6 9" />
    <path d="M2 16c2-1.500 4-1.500 5-1 3 1 7 1 10 0 1-.5 3-.5 5 1-2 .8-4 .8-5.500 0-3 .8-7 .8-10 0-1.500.8-3.500.8-4.500 0Z" />
    <path d="M12 6v8" />
  </Icon>
);

/** A helm with a dragon's crest. */
export const DragonHelmIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 19v-6a7 7 0 0 1 14 0v6" />
    <path d="M4 19h16M5 15h14" />
    <path d="M10 6c.5-2 2-3.500 5-3.500-1 1-.5 2-1.500 4" />
  </Icon>
);

/** Heavy round goggles and their strap. */
export const GogglesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.500" cy="12" r="4.500" />
    <circle cx="16.500" cy="12" r="4.500" />
    <path d="M12 11.500h0M3 12H1.500M21 12h1.500" />
    <circle cx="7.500" cy="12" r="1.800" fill="currentColor" fillOpacity=".5" />
    <circle cx="16.500" cy="12" r="1.800" fill="currentColor" fillOpacity=".5" />
  </Icon>
);

/** A Renaissance half-mask. */
export const MaskIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.500 8c6-2.500 13-2.500 19 0 0 5-2.500 8.500-6 8.500-1.800 0-2.700-1.800-3.500-1.800s-1.700 1.800-3.500 1.800c-3.500 0-6-3.500-6-8.500Z" />
    <ellipse cx="8" cy="11" rx="2" ry="1.400" />
    <ellipse cx="16" cy="11" rx="2" ry="1.400" />
  </Icon>
);

/** A tall, winged collar with a jewel at its clasp. */
export const CollarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16C8 16 4 12 3 5c2.500 2.500 5 3.500 6 3 .3 2.500 1.500 4 3 4.500 1.500-.5 2.700-2 3-4.500 1 .5 3.500-.5 6-3-1 7-5 11-9 11Z" />
    <circle cx="12" cy="18.500" r="1.800" />
  </Icon>
);

export const BucketHatIcon = (p: IconProps) => <Icon {...p}><path d="M7.500 14 8.500 7c.2-1 1-1.500 2-1.500h3c1 0 1.800.5 2 1.500l1 7" /><path d="M7.500 14 3 18c5.500 1.800 12.500 1.800 18 0l-4.500-4" /><path d="M7.500 14c2.800.8 6.200.8 9 0" /></Icon>;
export const BeretIcon = (p: IconProps) => <Icon {...p}><path d="M4.500 15C1.800 11 6 6.500 12 6.500s11 3.500 7.800 8.500" /><path d="M4.500 15c4.500 1.800 10.500 1.800 15.300 0" /><path d="M5.500 15.500v1.800c4 1.400 9.500 1.400 13.300 0v-1.800M12 6.500V4.500" /></Icon>;
export const FlatCapIcon = (p: IconProps) => <Icon {...p}><path d="M3.500 14c.2-4.500 4-7 9-7 4.500 0 8 2.300 8 7" /><path d="M20.500 14c-.2 2-4 3.500-8 3.500-2.500 0-5-.8-6-2" /><path d="M3.500 14c3.500-.8 11.500-.8 17 0" /></Icon>;
export const HeadbandIcon = (p: IconProps) => <Icon {...p}><path d="M4 12c0-5 3.500-8 8-8s8 3 8 8" /><path d="M3.500 12c4.500-2.500 12.500-2.500 17 0v3.500c-4.500-2.500-12.500-2.500-17 0Z" /><path d="M20.500 15l1 4M19 14.500 19 18.500" /></Icon>;
export const SunHatIcon = (p: IconProps) => <Icon {...p}><ellipse cx="12" cy="15.500" rx="10" ry="3" /><path d="M6.500 14C6.800 9 9 6.500 12 6.500S17.200 9 17.500 14" /><path d="M6.700 11.800c3 1 7.600 1 10.600 0" /></Icon>;
export const ScarfIcon = (p: IconProps) => <Icon {...p}><path d="M4 6c4 3.500 12 3.500 16 0v4c-4 3.500-12 3.500-16 0Z" /><path d="M13.500 12.500V21h4l-.5-9.500M13.500 17h3.800" /></Icon>;
export const BandanaIcon = (p: IconProps) => <Icon {...p}><path d="M3 7c5 2.500 13 2.500 18 0L12 21Z" /><circle cx="12" cy="12.500" r=".7" /><circle cx="9" cy="10.500" r=".5" /><circle cx="15" cy="10.500" r=".5" /></Icon>;
export const ChainIcon = (p: IconProps) => <Icon {...p}><path d="M4 4c1 7 4.500 10.500 8 11 3.500-.5 7-4 8-11" strokeDasharray="2 1.700" /><circle cx="12" cy="18" r="2.700" /></Icon>;
export const LanyardIcon = (p: IconProps) => <Icon {...p}><path d="M5 3l7 9 7-9" /><rect x="8" y="12" width="8" height="9.500" rx="1" /><path d="M10.500 15h3M10 18h4" /></Icon>;
export const BeadsIcon = (p: IconProps) => <Icon {...p}>{[[4, 6], [5.500, 11], [8.500, 15.500], [12, 17.500], [15.500, 15.500], [18.500, 11], [20, 6]].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="1.700" />)}</Icon>;
export const RoundGlassesIcon = (p: IconProps) => <Icon {...p}><circle cx="7" cy="13" r="4" /><circle cx="17" cy="13" r="4" /><path d="M11 12c.7-.7 1.300-.7 2 0M3 12 1.500 9M21 12l1.500-3" /></Icon>;
export const AviatorsIcon = (p: IconProps) => <Icon {...p}><path d="M3 9h7.500c.3 4-1 7.500-4 7.500S2.500 13 3 9Z" /><path d="M21 9h-7.500c-.3 4 1 7.500 4 7.500S21.500 13 21 9Z" /><path d="M10.500 10.500c1-.7 2-.7 3 0M10 8c1.300-.8 2.700-.8 4 0" /></Icon>;
export const CatEyeIcon = (p: IconProps) => <Icon {...p}><path d="M2 8c3 2 6 2.500 8.500 2.500.3 3.500-1.500 6-4 6S2 13 2 8Z" /><path d="M22 8c-3 2-6 2.500-8.500 2.500-.3 3.500 1.500 6 4 6S22 13 22 8Z" /><path d="M10.500 11.500h3" /></Icon>;
export const TiedGlassesIcon = (p: IconProps) => <Icon {...p}><rect x="2.500" y="9" width="8" height="6.500" rx="2" fill="currentColor" fillOpacity=".3" /><rect x="13.500" y="9" width="8" height="6.500" rx="2" fill="currentColor" fillOpacity=".3" /><path d="M10.500 11h3" /></Icon>;

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
