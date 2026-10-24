import s from "./account.module.css";

/** The account's picture, or its first letter. */
export function Avatar({ name, email, avatar, size = 56 }: { name: string | null; email: string; avatar: string | null; size?: number }) {
  const letter = (name || email).trim().charAt(0).toUpperCase();
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {/* A data: URL from the server, so next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatar ? <img src={avatar} alt="" width={size} height={size} /> : letter}
    </span>
  );
}

export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className={s.skeleton} style={{ height }} aria-hidden="true" />;
}
