"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { saveProfile } from "@/app/account/actions";
import { Avatar } from "./Avatar";
import s from "./account.module.css";

/** Same size the app makes: a 256×256 picture, well under the server's limit. */
const PICTURE_SIZE = 256;

export function ProfileForm({ email, name, avatar }: { email: string; name: string | null; avatar: string | null }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(name ?? "");
  const [picture, setPicture] = useState(avatar);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    try {
      setPicture(await square(chosen));
      setMessage(null);
    } catch {
      setMessage({ ok: false, text: "That picture couldn't be read. Try another one." });
    }
  }

  function save() {
    start(async () => {
      const result = await saveProfile({ display_name: displayName.trim() || null, avatar: picture });
      setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <form className={s.panelForm} action={save}>
      <div className={s.pictureRow}>
        <Avatar name={displayName} email={email} avatar={picture} size={80} />
        <div className={s.pictureButtons}>
          <button type="button" className="button button-secondary button-md" onClick={() => file.current?.click()}><ImagePlus size={15} /> Choose a picture</button>
          {picture && <button type="button" className={s.textButton} onClick={() => setPicture(null)}><Trash2 size={14} /> Remove</button>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choose(event.target.files?.[0])} />
        </div>
      </div>
      <label className={s.field}>
        <span>Display name</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} placeholder={email.split("@")[0]} />
      </label>
      <p className={s.hint}>Leave it empty to show your email instead.</p>
      {message && <p className={message.ok ? s.notice : s.error} role="status">{message.text}</p>}
      <div><button className="button button-primary button-md" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
    </form>
  );
}

/** Crops the middle square and scales it down, as a WebP data URL. */
async function square(chosen: File): Promise<string> {
  const bitmap = await createImageBitmap(chosen);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PICTURE_SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}
