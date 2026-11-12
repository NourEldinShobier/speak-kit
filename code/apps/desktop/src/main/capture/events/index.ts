/** What can be noted while recording. Each is only a kind and a time: no key names, no typed text, no window contents. */
export const EVENT_KINDS = ["ink-start", "ink-end", "pen-on", "pen-off", "target-switch"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface InputEvent {
  /** Milliseconds from the start of the recording, on the clock of the picture. */
  atMs: number;
  kind: EventKind;
}

export interface EventLogDeps {
  now(): number;
  /** When the recording on now started; undefined when none is. */
  startedAt(): number | undefined;
  /** "off" keeps nothing at all. */
  mode(): "events" | "off";
}

/** A cap that keeps an hours-long recording with a nervous pen from growing without end. */
export const MAX_EVENTS = 20_000;

/** The log of input events of the recording on now: drawing, the pen and target switches. It notes nothing when the setting is off or nothing is recording. */
export function createEventLog(d: EventLogDeps) {
  let events: InputEvent[] = [];
  return {
    add(kind: EventKind): void {
      const start = d.startedAt();
      if (d.mode() === "off" || start === undefined || events.length >= MAX_EVENTS) return;
      events.push({ atMs: Math.max(0, d.now() - start), kind });
    },
    /** The events so far, and a clean log for the next recording. */
    take(): InputEvent[] {
      const taken = events;
      events = [];
      return taken;
    },
    /** A new recording starts: whatever was left is dropped. */
    reset(): void {
      events = [];
    },
  };
}
