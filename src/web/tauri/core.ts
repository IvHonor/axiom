// Stands in for @tauri-apps/api/core on the web. `invoke` runs the desktop
// command's web handler (src/web/commands) instead of asking Rust. Like
// Tauri, a failed command rejects with a message that's ready to show.
import { run } from "../commands";

export interface InvokeOptions {
  headers?: Record<string, string> | Headers;
}
export type InvokeArgs = Record<string, unknown> | number[] | ArrayBuffer | Uint8Array;

export async function invoke<T>(command: string, args: InvokeArgs = {}, options?: InvokeOptions): Promise<T> {
  try {
    return (await run(command, args, options)) as T;
  } catch (e) {
    throw typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  }
}

/** Not the desktop app. Code that needs to know about the web asks src/lib/platform.ts. */
export const isTauri = () => false;

export const convertFileSrc = (path: string) => path;

/** Rust → JS streams; nothing on the web streams through one yet. */
export class Channel<T = unknown> {
  id = 0;
  onmessage: (message: T) => void = () => {};
}

export const transformCallback = () => 0;
