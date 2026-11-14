export type MicStatus =
  | { kind: "ready"; label: string }
  | { kind: "none" }
  | { kind: "built-in-off" }
  | { kind: "busy" }
  | { kind: "blocked"; privacyLink: boolean }
  | { kind: "bluetooth"; label: string }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "lost" }
  | { kind: "back"; label: string };

export type MicEvent =
  | { type: "chosen"; label: string; bluetooth: boolean }
  | { type: "no-device"; builtInOff: boolean }
  | { type: "busy" }
  | { type: "blocked" }
  | { type: "silent" }
  | { type: "reopening"; attempt: number }
  | { type: "gave-up" }
  | { type: "recovered"; label: string };

/** What the Audio card shows for the microphone. `canLink` is true where the operating system has a privacy page to open. */
export function micStatus(prev: MicStatus, event: MicEvent, canLink: boolean): MicStatus {
  switch (event.type) {
    case "chosen":
      if (prev.kind === "reconnecting" || prev.kind === "lost") return { kind: "back", label: event.label };
      return event.bluetooth ? { kind: "bluetooth", label: event.label } : { kind: "ready", label: event.label };
    case "no-device":
      return event.builtInOff ? { kind: "built-in-off" } : { kind: "none" };
    case "busy":
      return { kind: "busy" };
    case "blocked":
    case "silent":
      return { kind: "blocked", privacyLink: canLink };
    case "reopening":
      return { kind: "reconnecting", attempt: event.attempt };
    case "gave-up":
      return { kind: "lost" };
    case "recovered":
      return { kind: "back", label: event.label };
  }
}
