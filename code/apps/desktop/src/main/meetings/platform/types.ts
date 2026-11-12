import type { Probe } from "@speakkit/meetings";
import type { Capabilities } from "../../../shared/meetings/contract";

/**
 * What the operating system tells the meetings feature. One implementation per OS; a system that cannot answer something says so in `capabilities`
 * and the feature falls back (no automatic offer, the saved microphone, the default output) instead of guessing.
 */
export interface MeetingsPlatform {
  capabilities(): Capabilities;
  /** Who uses the microphone and which windows are open, right now. Never throws: an unreadable system is an empty probe. */
  probe(): Promise<Probe>;
  /** The name of the microphone the call app has open, or null when the system cannot say. The caller matches the name to a device. */
  callAppMic(app: { pid: number }): Promise<string | null>;
}

/** Runs a program and returns what it printed; rejects on a non-zero exit or after `timeoutMs`. */
export type Exec = (file: string, args: readonly string[], timeoutMs?: number) => Promise<string>;
