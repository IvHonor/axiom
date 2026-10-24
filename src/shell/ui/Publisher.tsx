import { BadgeCheck } from "lucide-react";

/** Publishers whose extensions Axiom vouches for. For now, that's Axiom itself. */
const VERIFIED = new Set(["Axiom"]);

/** "Made by Axiom ✓": who made an extension, with a blue tick when verified. */
export function Publisher({ name, short }: { name: string; short?: boolean }) {
  const verified = VERIFIED.has(name);
  return (
    <span className={`publisher${verified ? " is-verified" : ""}`} title={verified ? `Made by ${name}. Verified: it ships with Axiom.` : `Made by ${name}`}>
      {short ? name : `Made by ${name}`}
      {verified && <BadgeCheck size={13} strokeWidth={2} className="publisher-tick" aria-label="Verified" />}
    </span>
  );
}
