// What each version brings, shown once after Axiom updates to it (see
// `WhatsNew.tsx`). Newest first. A release with nothing worth announcing
// needs no entry.

export interface Release {
  /** The version that brought it, e.g. "0.6.2": shown to anyone updating from before it. */
  version: string;
  title: string;
  intro: string;
  points: { title: string; text: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "0.6.2",
    title: "Meet Lemma, your assistant",
    intro: "Ask Lemma about any area you let it see, and it can plan your day, keep track of birthdays, log your reading and more.",
    points: [
      {
        title: "Ask in your own words",
        text: "“Plan my day”, “Whose birthday is next?”, “What have I spent most on this month?”. Its replies appear as they’re written.",
      },
      {
        title: "You stay in charge",
        text: "Every change shows as a card for you to confirm first, or Confirm all at once. Changed your mind? Undo it from the card for 30 days, on the computer where you confirmed it.",
      },
      {
        title: "Talk to it",
        text: "Click the microphone to speak, and have its replies read aloud.",
      },
      {
        title: "Make it yours",
        text: "Choose its name, personality and look with Customise.",
      },
      {
        title: "Private by default",
        text: "Lemma sees nothing until you switch areas on in its settings, and your chats sync end-to-end encrypted. It’s free with your Axiom account, up to a daily allowance, or add your own free AI key.",
      },
    ],
  },
];

/** -1, 0 or 1 as version `a` is older than, the same as or newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

/** The releases someone updating from `seen` to `current` hasn't been told about, newest first. */
export function unseen(seen: string | null, current: string): Release[] {
  return RELEASES.filter((r) => (seen === null || compareVersions(r.version, seen) > 0) && compareVersions(r.version, current) <= 0);
}
