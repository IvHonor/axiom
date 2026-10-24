import type { Profile } from "../../lib/account";

/** A round profile picture, or the first letter of the name when there isn't one. */
export function Avatar({ email, profile, size }: { email: string; profile: Profile | null; size: number }) {
  const letter = (profile?.displayName || email).trim()[0]?.toUpperCase() ?? "?";
  return profile?.avatar ? (
    <img className="avatar" src={profile.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} draggable={false} />
  ) : (
    <span className="avatar avatar-letter" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {letter}
    </span>
  );
}
