import { useAccount } from "../../shell/useAccount";
import { useInstalled } from "../../shell/useInstalled";
import { useProfile } from "../../shell/useProfile";
import { EXTENSIONS, findExtension } from "../../extensions";
import type { ExtensionManifest } from "../../extensions/types";
import type { LemmaState } from "./state";

/** The areas Lemma can be let into: every area that's on, but itself. */
export function useLemmaAreas(): ExtensionManifest[] {
  const { isOn } = useInstalled();
  return EXTENSIONS.filter((ext) => ext.area && ext.id !== "lemma" && isOn(ext));
}

/** The person's name from their profile, if they've given one. */
export function useName(): string | null {
  const [account] = useAccount();
  return useProfile(account?.state === "signed_in" ? account.email : undefined)?.displayName ?? null;
}

/** "Good evening, Danial" (or a nudge to bed, late at night). */
export function greeting(name: string | null, now = new Date()): string {
  const first = name?.trim().split(/\s+/)[0];
  const hour = now.getHours();
  const hello = hour >= 23 || hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return first ? `${hello}, ${first}${hello === "Still up" ? "?" : ""}` : `${hello}${hello === "Still up" ? "?" : ""}`;
}

/** What Lemma's doing, in words, or null when it's free. */
export function doing(s: LemmaState): string | null {
  const area = s.area ? (findExtension(s.area)?.name ?? s.area) : null;
  switch (s.activity) {
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "looking":
      return area ? `Looking at ${area}…` : "Looking…";
    case "preparing":
      return area ? `Preparing changes in ${area}…` : "Preparing changes…";
    default:
      return s.waiting ? `${s.waiting} change${s.waiting === 1 ? "" : "s"} waiting for you` : null;
  }
}

/** The tool Lemma holds while busy in an area: that area's icon and colour. */
export function toolOf(s: LemmaState) {
  const ext = s.activity !== "idle" && s.area ? findExtension(s.area) : undefined;
  return ext ? { icon: ext.icon, color: ext.color } : null;
}

