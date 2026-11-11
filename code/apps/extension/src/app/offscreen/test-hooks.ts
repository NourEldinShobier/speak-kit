import type { RealtimeEvent } from "../../features/voicechat";

// Tests aim the connection at a fake server and simulate a blocked microphone; the values live in this extension origin's own storage, out of reach of pages.
export const testValue = (key: string) => {
  try {
    return __TEST__ ? localStorage.getItem(`speakkit.voice.${key}`) : null;
  } catch {
    return null;
  }
};

/** Tests: "missing" is a computer without a microphone, any other value a refusal. */
export const simulatedMicError = () => {
  const v = testValue("mic");
  if (!v) return null;
  return v === "missing" ? "NotFoundError" : "NotAllowedError";
};

/** Test builds keep what the model said, what it billed, what was sent to it and what went wrong, for the live check. */
export class Trace {
  events: string[] = [];
  transcript = "";
  errors: string[] = [];
  outPeak = 0;
  usage: unknown[] = [];
  sent: string[] = [];

  record(e: RealtimeEvent) {
    this.events.push(e.type);
    if (e.type === "response.output_audio_transcript.done") this.transcript += `${e.transcript ?? ""} `;
    if (e.type === "error") this.errors.push(String(e.error?.code ?? e.error?.type));
    if (e.type === "response.done") this.usage.push(e.response?.usage);
  }
}
