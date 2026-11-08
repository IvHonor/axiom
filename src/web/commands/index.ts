// Every desktop command, answered on the web. Each area's handlers mirror its
// Rust commands (src-tauri/src/**/commands.rs) over the account's synced rows.
import { ready } from "../runtime";
import type { InvokeOptions } from "../tauri/core";
import { accountHandlers } from "./account";
import { board } from "./board";
import { learning } from "./learning";
import { pending } from "./pending";
import { plan } from "./plan";
import { reading } from "./reading";
import { system } from "./system";
import type { Args, Handlers } from "./types";
import { uni } from "./uni";

const handlers: Handlers = { ...pending, ...system, ...accountHandlers, ...plan, ...board, ...reading, ...uni, ...learning };

/** Commands the web doesn't answer at all (yet), for checking coverage. */
export const handled = (command: string) => Object.hasOwn(handlers, command);

export async function run(command: string, args: unknown, options?: InvokeOptions): Promise<unknown> {
  const handler = handlers[command];
  if (!handler) throw `This isn't available on the web yet (${command}).`;
  await ready;
  const plain = args && typeof args === "object" && !ArrayBuffer.isView(args) && !(args instanceof ArrayBuffer) && !Array.isArray(args);
  return handler((plain ? args : {}) as Args, options, args);
}
