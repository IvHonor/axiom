// Stands in for @tauri-apps/api/event on the web: the same listen/emit, on an
// in-page bus. The web runtime emits what Rust would ("data-changed",
// "sync-status", "account-changed", "vault-changed"…).

export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}
export type EventCallback<T> = (event: Event<T>) => void;
export type UnlistenFn = () => void;

const handlers = new Map<string, Set<EventCallback<unknown>>>();
let nextId = 1;

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(handler as EventCallback<unknown>);
  return () => void set.delete(handler as EventCallback<unknown>);
}

export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  const stop = await listen<T>(event, (e) => {
    stop();
    handler(e);
  });
  return stop;
}

/** Delivers straight away (and synchronously), like an event Rust sent. */
export function emitNow(event: string, payload?: unknown) {
  const id = nextId++;
  for (const handler of [...(handlers.get(event) ?? [])]) {
    try {
      handler({ event, id, payload });
    } catch (e) {
      console.error(e);
    }
  }
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  emitNow(event, payload);
}

export async function emitTo(_target: unknown, event: string, payload?: unknown): Promise<void> {
  emitNow(event, payload);
}
