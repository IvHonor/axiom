import { useRef, useState, type FormEvent } from "react";
import { Camera, Pencil, ShieldCheck } from "lucide-react";
import { updateProfile } from "../../lib/account";
import { rememberProfile, shownName, useProfile } from "../useProfile";
import { Avatar } from "../ui/Avatar";
import { ErrorNote, useAction } from "./fields";

/** Pictures are cut to a square this size before uploading, so they stay small. */
const PICTURE_SIZE = 256;

/** The top of the Account panel: picture, name and email, each editable in place. */
export function ProfileHeader({ email, admin }: { email: string; admin: boolean }) {
  const profile = useProfile(email);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();

  const save = (displayName: string | null, avatar: string | null) =>
    run(async () => rememberProfile(email, await updateProfile(displayName, avatar)));

  const pick = async (chosen: File | undefined) => {
    if (!chosen) return;
    await run(async () => {
      const picture = await squarePicture(chosen);
      rememberProfile(email, await updateProfile(profile?.displayName ?? null, picture));
    });
  };

  const submitName = async (e: FormEvent) => {
    e.preventDefault();
    await save(name.trim() || null, profile?.avatar ?? null);
    setEditingName(false);
  };

  return (
    <header className="profile">
      <button className="profile-picture" onClick={() => file.current?.click()} disabled={busy} title="Change your picture">
        <Avatar email={email} profile={profile} size={72} />
        <span className="profile-picture-edit" aria-hidden>
          <Camera size={14} strokeWidth={2} />
        </span>
      </button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.currentTarget.files?.[0]).then(() => (e.target.value = ""))} />

      {editingName ? (
        <form className="profile-name-form" onSubmit={submitName}>
          <input
            autoFocus
            value={name}
            maxLength={60}
            placeholder={email.split("@")[0]}
            aria-label="Your name"
            disabled={busy}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditingName(false)}
          />
          <button className="btn btn-sm" type="submit" disabled={busy}>
            Save
          </button>
        </form>
      ) : (
        <button
          className="profile-name"
          title="Change the name you show"
          onClick={() => {
            setName(profile?.displayName ?? "");
            setEditingName(true);
          }}
        >
          <span>{shownName(email, profile)}</span>
          <Pencil size={12} strokeWidth={1.75} />
        </button>
      )}
      <span className="profile-email" title={email}>
        {email}
      </span>
      {admin && (
        <span className="profile-badge">
          <ShieldCheck size={12} strokeWidth={2} /> Admin
        </span>
      )}
      {profile?.avatar && !editingName && (
        <button className="link profile-remove" onClick={() => void save(profile.displayName, null)} disabled={busy}>
          Remove picture
        </button>
      )}
      <ErrorNote error={error} />
    </header>
  );
}

/** Reads a picture, crops the middle square and shrinks it, as a data URL. */
async function squarePicture(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't a picture Axiom can read."));
    img.src = source;
  });
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PICTURE_SIZE;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
  // WebP keeps transparency and is small; JPEG if the browser can't make it.
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}
