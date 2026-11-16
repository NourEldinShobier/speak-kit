import type { DictationStatus } from "../../../shared/dictation/contract";

export type ListenerLabel = "Running" | "Stopped" | "No microphone" | "Needs permission" | "Starting" | "Not available";

export interface Listener {
  label: ListenerLabel;
  /** One plain sentence on why. */
  detail: string;
  /** "ok" is the only state in which pressing the shortcut dictates. */
  tone: "ok" | "off" | "problem";
}

type Input = Pick<DictationStatus, "supported" | "enabled" | "hotkeyReady" | "mic" | "platform"> & { hotkeyFailed?: boolean | undefined };

/** What the shortcut is doing right now, kept apart from the last failure: the listener can be running while the last dictation failed. */
export function listenerStatus(s: Input): Listener {
  if (!s.supported) return { label: "Not available", detail: "Dictation needs a system-wide key hook that this system does not have yet.", tone: "off" };
  if (!s.enabled) return { label: "Stopped", detail: "Dictation is off. Turn it on to use the shortcut in any app.", tone: "off" };
  if (s.hotkeyFailed) {
    return s.platform === "darwin"
      ? { label: "Needs permission", detail: "Allow Speak Kit in Privacy & Security, Input Monitoring and Accessibility, then try again.", tone: "problem" }
      : { label: "Stopped", detail: "The shortcut could not start or stopped working. Turn dictation off and on again.", tone: "problem" };
  }
  switch (s.mic.kind) {
    case "blocked":
      return { label: "Needs permission", detail: "The system is not giving Speak Kit the microphone. Check the microphone privacy setting.", tone: "problem" };
    case "none":
    case "built-in-off":
    case "lost":
      return { label: "No microphone", detail: "No usable microphone is connected. Plug one in or pick another below.", tone: "problem" };
    case "reconnecting":
      return { label: "Starting", detail: "Reconnecting the microphone.", tone: "off" };
    default:
      return s.hotkeyReady ? { label: "Running", detail: "Press your shortcut in any app to dictate.", tone: "ok" } : { label: "Starting", detail: "The shortcut is starting.", tone: "off" };
  }
}

/** "10:32" for a failure from today, else the date too. */
export function failureTime(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}
