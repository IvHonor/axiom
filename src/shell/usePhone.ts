// Axiom on the web on a small screen. Always "desktop" in the desktop app,
// whose window can't be this narrow.
//
// - phone (up to 760px): a bottom bar, the sidebar over what's open, a
//   two-column overview.
// - tablet (761–1100px, which is also a phone held sideways and a narrow
//   browser window): the side bar stays, the sidebar slides over what's open,
//   and the overview has four columns.
import { useEffect, useState } from "react";
import { isWeb } from "../lib/platform";

export type Screen = "phone" | "tablet" | "desktop";

const PHONE = "(max-width: 760px)";
const TABLET = "(min-width: 761px) and (max-width: 1100px)";
/** A phone held sideways: too little height for the status bar. */
const SHORT = "(max-height: 520px) and (orientation: landscape)";

const query = (media: string) => isWeb && typeof window !== "undefined" && window.matchMedia(media).matches;
const screenNow = (): Screen => (query(PHONE) ? "phone" : query(TABLET) ? "tablet" : "desktop");

function useMedia<T>(read: () => T, queries: string[]): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    if (!isWeb) return;
    const lists = queries.map((q) => window.matchMedia(q));
    const change = () => setValue(read);
    lists.forEach((list) => list.addEventListener("change", change));
    return () => lists.forEach((list) => list.removeEventListener("change", change));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export const useScreen = (): Screen => useMedia(screenNow, [PHONE, TABLET]);

export const usePhone = (): boolean => useScreen() === "phone";

/** The sidebar slides over what's open (phones and tablets), rather than sitting beside it. */
export const useOverlaySidebar = (): boolean => useScreen() !== "desktop";

/** Little height to spare (a phone held sideways). */
export const useShortScreen = (): boolean => useMedia(() => query(SHORT), [SHORT]);

/** Whether it's a phone right now, for a first value. */
export const isPhone = () => query(PHONE);

/** Whether the sidebar slides over what's open right now, for a first value. */
export const isOverlaySidebar = () => screenNow() !== "desktop";
