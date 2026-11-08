import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../lib/settings";

/**
 * useState that survives restarts by saving to the webview's local storage.
 * `parse` turns whatever was saved (or undefined) into a valid value.
 * Keys that are part of the profile (`SYNCED` in lib/settings) also sync to
 * the person's other computers, and update when they change there.
 */
export function usePersistentState<T>(
  key: string,
  parse: (saved: unknown) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => parse(readSetting(key)));
  // What's saved now, so only a real change is saved (and synced) again.
  const saved = useRef<string | null>(null);

  useEffect(() => {
    const json = JSON.stringify(value);
    if (json === saved.current) return;
    const first = saved.current === null;
    saved.current = json;
    // The first value was read, not chosen: it's kept here but not synced.
    if (first) {
      try {
        localStorage.setItem(key, json);
      } catch {
        // Storage unavailable: the value lasts for this session only.
      }
    } else {
      saveSetting(key, value);
    }
  }, [key, value]);

  const latestParse = useRef(parse);
  latestParse.current = parse;
  useEffect(
    () =>
      onSettingSynced(key, (synced) => {
        const next = latestParse.current(synced);
        saved.current = JSON.stringify(next);
        setValue(next);
      }),
    [key],
  );

  return [value, setValue];
}
