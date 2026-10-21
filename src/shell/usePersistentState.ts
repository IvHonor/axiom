import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * useState that survives restarts by saving to the webview's local storage.
 * `parse` turns whatever was saved (or undefined) into a valid value.
 */
export function usePersistentState<T>(
  key: string,
  parse: (saved: unknown) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return parse(raw === null ? undefined : JSON.parse(raw));
    } catch {
      return parse(undefined);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: the value lasts for this session only.
    }
  }, [key, value]);

  return [value, setValue];
}
