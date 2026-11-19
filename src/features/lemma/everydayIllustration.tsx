// The everyday clothes in Lemma's small flat drawing, used where 3D isn't.
import type { Look } from "./look";

export function EverydayIllustration({ look, paint }: { look: Look; paint: (colour: string, fallback: string) => string }) {
  const hat = (fallback: string) => paint(look.headwearColor, fallback), neck = (fallback: string) => paint(look.neckwearColor, fallback), frame = (fallback: string) => paint(look.facewearColor, fallback);
  return <>
    {look.neckwear === "scarf" && <g fill={neck("#b4493c")}><path d="M-34 34Q0 52 34 34L36 44Q0 62 -36 44Z" /><path d="M7 50H21L23 78H9Z" /><path d="M9 68H22M9 72H22" stroke="#efe6d4" strokeWidth="1.5" /></g>}
    {look.neckwear === "bandana" && <g fill={neck("#b5362f")}><path d="M-25 39Q0 46 25 39L0 67Z" /><circle cy="51" r="1.8" fill="#f4efe6" /><circle cx="-9" cy="46" r="1.2" fill="#f4efe6" /><circle cx="9" cy="46" r="1.2" fill="#f4efe6" /></g>}
    {look.neckwear === "chain-necklace" && <g fill="none" stroke={neck("#d8b25c")} strokeWidth="1.8"><path d="M-28 36Q0 60 28 36" strokeDasharray="2.5 1.2" /><circle cy="53" r="3.5" fill={neck("#d8b25c")} /></g>}
    {look.neckwear === "lanyard" && <g><path d="M-24 36L0 54L24 36" fill="none" stroke={neck("#2f6fb0")} strokeWidth="3" /><rect x="-8" y="54" width="16" height="21" rx="1.5" fill="#f4f3ef" stroke="#8a9098" /><rect x="-8" y="54" width="16" height="4.5" fill={neck("#2f6fb0")} /></g>}
    {look.neckwear === "bead-necklace" && <g>{[-24, -16, -8, 0, 8, 16, 24].map((x, i) => <circle key={x} cx={x} cy={52 - x * x / 42} r="3.2" fill={i === 3 ? neck("#e6dfd0") : ["#d94f4f", "#f2b544", "#3fa7a0", "#5b6fd6"][i % 4]} />)}</g>}
    {look.accessory === "bucket-hat" && <g fill={hat("#7f8c69")} stroke="#4e5742" strokeWidth="1.3"><path d="M-30 -55Q-28 -85 0 -85Q28 -85 30 -55L46 -44Q0 -36 -46 -44Z" /><path d="M-31 -54Q0 -47 31 -54" fill="none" /></g>}
    {look.accessory === "beret" && <g fill={hat("#2c3a56")} stroke="#1b2438" strokeWidth="1.3"><path d="M-36 -53C-50 -72 -18 -84 12 -80C40 -76 50 -60 34 -52Q0 -46 -36 -53Z" /><path d="M9 -80V-85" /></g>}
    {look.accessory === "flat-cap" && <g fill={hat("#6e5c47")} stroke="#463a2c" strokeWidth="1.3"><path d="M-36 -52C-38 -72 -14 -78 8 -74C26 -71 36 -64 36 -52Q0 -46 -36 -52Z" /><path d="M-34 -52Q0 -46 34 -52Q18 -40 0 -41Q-18 -40 -34 -52Z" /></g>}
    {look.accessory === "headband" && <g><path d="M-38 -44Q0 -56 38 -44L37 -33Q0 -45 -37 -33Z" fill={hat("#ece7dc")} /><path d="M-38 -39Q0 -51 38 -39" fill="none" stroke="#c8452f" strokeWidth="2.5" /></g>}
    {look.accessory === "sun-hat" && <g fill={hat("#e2cc98")} stroke="#bfa66f" strokeWidth="1.2"><ellipse cy="-50" rx="58" ry="10" /><path d="M-29 -52Q-27 -80 0 -80Q27 -80 29 -52Q0 -46 -29 -52Z" /><path d="M-29 -59Q0 -53 29 -59L29 -52Q0 -46 -29 -52Z" fill="#b5473c" stroke="none" /></g>}
    {look.facewear === "round-glasses" && <g fill="none" stroke={frame("#b58a4c")} strokeWidth="1.5"><circle cx="-15" cy="2" r="10" /><circle cx="15" cy="2" r="10" /><path d="M-6 -2Q0 -6 6 -2" /></g>}
    {look.facewear === "aviators" && <g fill="#24313a" fillOpacity=".85" stroke={frame("#c9ccd2")} strokeWidth="1.4"><path d="M-27 -6H-5Q-3 10 -15 13Q-28 12 -27 -6Z" /><path d="M27 -6H5Q3 10 15 13Q28 12 27 -6Z" /><path d="M-5 -4Q0 -7 5 -4" fill="none" /></g>}
    {look.facewear === "cat-eye" && <g fill="none" stroke={frame("#b3344f")} strokeWidth="2.4" strokeLinejoin="round"><path d="M-5 0Q-8 11 -17 10Q-26 8 -30 -9Q-18 -4 -7 -5Z" /><path d="M5 0Q8 11 17 10Q26 8 30 -9Q18 -4 7 -5Z" /><path d="M-5 -2H5" /></g>}
    {look.facewear === "tinted-glasses" && <g fill="var(--lemma-glow)" fillOpacity=".5" stroke={frame("#23262c")} strokeWidth="2.2"><rect x="-27" y="-7" width="22" height="17" rx="5" /><rect x="5" y="-7" width="22" height="17" rx="5" /><path d="M-5 -1H5" fill="none" /></g>}
  </>;
}
