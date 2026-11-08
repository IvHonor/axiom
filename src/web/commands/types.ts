import type { InvokeOptions } from "../tauri/core";

// Commands take the desktop's own arguments; each handler checks what it uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Args = Record<string, any>;
export type Handler = (args: Args, options?: InvokeOptions, raw?: unknown) => unknown;
export type Handlers = Record<string, Handler>;
