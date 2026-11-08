// Stands in for @tauri-apps/api/window on the web. A browser tab has one
// window and can't be moved or focused by the page, so these do nothing.

let pointer = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => (pointer = { x: e.screenX, y: e.screenY }), { passive: true });
}

/** Where the pointer last was, in screen pixels. */
export async function cursorPosition() {
  return { ...pointer, toLogical: () => ({ ...pointer }) };
}

const noop = async () => {};
const current = new Proxy(
  {
    label: "main",
    isVisible: async () => !document.hidden,
    isFocused: async () => document.hasFocus(),
    isFullscreen: async () => !!document.fullscreenElement,
    scaleFactor: async () => window.devicePixelRatio || 1,
    innerSize: async () => ({ width: window.innerWidth, height: window.innerHeight }),
    outerSize: async () => ({ width: window.outerWidth, height: window.outerHeight }),
    outerPosition: async () => ({ x: window.screenX, y: window.screenY }),
    listen: async () => () => {},
    onFocusChanged: async () => () => {},
    onResized: async () => () => {},
    onMoved: async () => () => {},
    onCloseRequested: async () => () => {},
  } as Record<string, unknown>,
  { get: (target, key: string) => (key in target ? target[key] : noop) },
);

export const getCurrentWindow = () => current;
export const getAllWindows = async () => [current];
export class LogicalPosition {
  constructor(
    public x: number,
    public y: number,
  ) {}
}
export class LogicalSize {
  constructor(
    public width: number,
    public height: number,
  ) {}
}
export class PhysicalPosition extends LogicalPosition {}
export class PhysicalSize extends LogicalSize {}
