// How tabs and activity-bar icons are picked up to be moved. With a mouse, a
// small drag moves them, as always. On a touch screen a swipe is scrolling (a
// phone's bottom bar and tab strip scroll sideways), so moving one takes a
// press and hold first; otherwise trying to scroll rearranged the icons, and
// the new order synced to every device.
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type KeyboardSensorOptions } from "@dnd-kit/core";

/** Hold this long (without moving more than `TOLERANCE_PX`) to pick an item up by touch. */
export const HOLD_MS = 300;
const TOLERANCE_PX = 8;

export function useReorderSensors(keyboard?: KeyboardSensorOptions) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: TOLERANCE_PX } }),
    useSensor(KeyboardSensor, keyboard),
  );
}
