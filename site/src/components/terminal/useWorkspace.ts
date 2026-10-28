"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { queueChanges, readWorkspace, SessionChanged, syncWorkspace } from "@/lib/terminal/database";
import { coalesceEdits, validateChanges, type Fields, type SyncRecord } from "@/lib/terminal/protocol";

export interface Edit { table: string; id: string; fields: Fields }
export function useWorkspace(accountId: string) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [allRecords, setAllRecords] = useState<SyncRecord[]>([]);
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [state, setState] = useState<"loading" | "syncing" | "synced" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const repeat = useRef(false);
  const mounted = useRef(false);
  const clock = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    const snapshot = await readWorkspace(accountId);
    if (!mounted.current) return;
    setRecords(snapshot.records);
    setAllRecords(snapshot.allRecords);
    setPending(snapshot.pending.length);
    setReady(true);
  }, [accountId]);

  const sync = useCallback(async function run() {
    if (busy.current) { repeat.current = true; return; }
    busy.current = true;
    if (mounted.current) setState("syncing");
    try {
      await syncWorkspace(accountId);
      if (mounted.current) { setState("synced"); setError(null); }
      channel.current?.postMessage("changed");
    } catch (cause) {
      if (mounted.current) { setState("error"); setError(cause instanceof Error ? cause.message : "Sync failed. Try again."); if (cause instanceof SessionChanged) setExpired(true); }
    } finally {
      await refresh().catch(cause => { if (mounted.current) setError(String(cause)); });
      busy.current = false;
      if (repeat.current && mounted.current) { repeat.current = false; void run(); }
    }
  }, [accountId, refresh]);

  useEffect(() => {
    mounted.current = true;
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(`axiom-terminal-${accountId}`);
      channel.current.onmessage = () => void refresh().catch(() => {});
    }
    void refresh().then(sync).catch(cause => { setState("error"); setError(String(cause)); });
    const visible = () => { if (!document.hidden) void sync(); };
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("online", visible); document.removeEventListener("visibilitychange", visible); channel.current?.close(); channel.current = null; };
  }, [accountId, refresh, sync]);

  const save = useCallback(async (edits: Edit[]) => {
    if (!ready || expired) throw new Error(expired ? "Reload this page to sign in again." : "Wait for browser storage to finish opening.");
    clock.current = Math.max(Date.now(), clock.current + 1);
    const stamped = coalesceEdits(edits).map(edit => ({ ...edit, fields: { ...edit.fields, updated_at: new Date(clock.current).toISOString() }, changed_at: clock.current }));
    const changes = stamped.flatMap((_, i) => i % 100 === 0 ? validateChanges(stamped.slice(i, i + 100)) : []);
    await queueChanges(accountId, changes);
    await refresh();
    channel.current?.postMessage("changed");
    void sync();
  }, [accountId, expired, ready, refresh, sync]);

  return { accountId, records, allRecords, pending, ready: ready && !expired, expired, state, error, sync, save };
}
export type Workspace = ReturnType<typeof useWorkspace>;
