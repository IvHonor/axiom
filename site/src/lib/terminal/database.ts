import { visibleRecords, readableTable, type Change, type Pending, type Pull, type SyncRecord } from "./protocol";

const databases = new Map<string, Promise<IDBDatabase>>();
function database(accountId: string) {
  let opened = databases.get(accountId);
  if (!opened) {
    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`axiom-terminal-${accountId}`, 5);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("records")) {
          request.result.createObjectStore("records", { keyPath: ["table", "id"] });
          request.result.createObjectStore("pending", { keyPath: "operation" });
          request.result.createObjectStore("meta");
        } else {
          // Pull again when adding previously excluded tables; preserve every queued edit.
          request.transaction!.objectStore("meta").put(0, "cursor");
        }
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); databases.delete(accountId); }; resolve(request.result); };
      request.onerror = () => reject(new Error("Browser storage is unavailable. Allow site storage to use the terminal."));
      request.onblocked = () => reject(new Error("Close other Axiom tabs and try again."));
    });
    databases.set(accountId, opened);
    opened.catch(() => databases.delete(accountId));
  }
  return opened;
}
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const committed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Your change could not be saved in this browser.")); });

export async function readWorkspace(accountId: string) {
  const db = await database(accountId);
  const tx = db.transaction(["records", "pending", "meta"]);
  const [records, pending, cursor] = await Promise.all([
    result<SyncRecord[]>(tx.objectStore("records").getAll()), result<Pending[]>(tx.objectStore("pending").getAll()), result<number | undefined>(tx.objectStore("meta").get("cursor")),
  ]);
  const allRecords = visibleRecords(records, pending, true);
  return { records: allRecords.filter(row => !row.data.deleted_at), allRecords, pending, cursor: cursor ?? 0 };
}

export async function queueChanges(accountId: string, changes: Change[]) {
  const db = await database(accountId);
  const tx = db.transaction("pending", "readwrite");
  const done = committed(tx);
  for (const change of changes) tx.objectStore("pending").put({ ...change, operation: crypto.randomUUID() } satisfies Pending);
  await done;
}

async function applyPull(accountId: string, page: Pull, acknowledged: string[]) {
  const db = await database(accountId);
  const tx = db.transaction(["records", "pending", "meta"], "readwrite");
  const done = committed(tx);
  // The cache only holds ported plaintext tables; encrypted areas stay on the server.
  for (const row of page.records) if (readableTable(row.table)) tx.objectStore("records").put(row);
  for (const operation of acknowledged) tx.objectStore("pending").delete(operation);
  tx.objectStore("meta").put(page.cursor, "cursor");
  await done;
}

export class SessionChanged extends Error {}
async function request<T>(accountId: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/terminal/sync${path}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify({ accountId, changes: body }) : undefined, cache: "no-store", signal: AbortSignal.timeout(90_000) });
  const answer = await response.json();
  if (response.status === 401 || response.status === 409) throw new SessionChanged("Your sign-in changed. Reload this page to continue.");
  if (!response.ok) throw new Error(answer.message ?? "Sync failed. Your changes are saved in this browser.");
  if (answer.accountId !== accountId) throw new SessionChanged("Your sign-in changed. Reload this page to continue.");
  return answer as T;
}

/** Serialize sync across tabs. Edits remain separate durable operations until pull completes. */
export async function syncWorkspace(accountId: string) {
  const sync = async () => {
    const snapshot = await readWorkspace(accountId);
    const pending = snapshot.pending.sort((a, b) => a.changed_at - b.changed_at || a.operation.localeCompare(b.operation));
    let batch: Pending[] = [], bytes = 0;
    for (const change of pending) {
      const size = new TextEncoder().encode(JSON.stringify(change)).length;
      if (batch.length && (batch.length === 100 || bytes + size > 400_000)) { await request(accountId, "", batch); batch = []; bytes = 0; }
      batch.push(change); bytes += size;
    }
    if (batch.length) await request(accountId, "", batch);
    let cursor = snapshot.cursor;
    let more = true;
    while (more) {
      const page = await request<Pull>(accountId, `?since=${cursor}`);
      if (!Array.isArray(page.records) || !Number.isSafeInteger(page.cursor) || page.cursor < cursor || (page.more && page.cursor <= cursor)) throw new Error("The sync server sent an invalid response.");
      cursor = page.cursor;
      more = page.more;
      // Acknowledge only on the final page, atomically with the last server rows.
      // If interrupted, replay uses the original timestamps and is safe.
      await applyPull(accountId, page, more ? [] : pending.map(change => change.operation));
    }
  };
  if (navigator.locks) await navigator.locks.request(`axiom-terminal-sync-${accountId}`, sync);
  else await sync();
}
