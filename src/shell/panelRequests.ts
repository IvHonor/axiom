// Asking for one of the shell's sidebar panels from somewhere that can't
// reach it, e.g. Lemma's chat opening the Account panel to create an account.
import { useEffect, useRef } from "react";

export interface PanelRequest {
  panel: "account" | "extensions";
  /** The Account panel opens on creating an account, not signing in. */
  signUp?: boolean;
}

const listeners = new Set<(request: PanelRequest) => void>();

export function requestPanel(request: PanelRequest) {
  listeners.forEach((listener) => listener(request));
}

/** The shell listens, and opens what's asked for. */
export function usePanelRequests(onRequest: (request: PanelRequest) => void) {
  const latest = useRef(onRequest);
  latest.current = onRequest;
  useEffect(() => {
    const listener = (request: PanelRequest) => latest.current(request);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
