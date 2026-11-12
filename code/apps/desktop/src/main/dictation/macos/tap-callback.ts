import type { TapEvent } from "./native";

/** CGEventType values macOS sends instead of a key when it switched the tap off (callback too slow, or user input timeout). */
export const TAP_DISABLED_TYPES: readonly number[] = [0xfffffffe, 0xffffffff];

interface Deps<E> {
  /** Turns the tap back on. */
  reenable(): void;
  read(event: E, type: number): TapEvent;
  onEvent(e: TapEvent): boolean;
}

/** What the tap callback hands back to macOS: the event, or null to swallow it. A "tap disabled" notice turns the tap back on and passes through. */
export function handleTapEvent<E>(type: number, event: E, d: Deps<E>): E | null {
  if (TAP_DISABLED_TYPES.includes(type)) {
    d.reenable();
    return event;
  }
  return d.onEvent(d.read(event, type)) ? null : event;
}
