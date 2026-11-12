import { wavHeader } from "@speakkit/engine";
import { splitCommand, withAudio } from "./commandline";
import type { Narrator } from "../recording";

/** Starts a program (no shell) and gives back what it printed; rejects on a failure or after the time is up. */
export type RunCommand = (file: string, args: string[], timeoutMs: number) => Promise<string>;

export interface CommandNarratorDeps {
  /** The command line from the settings. */
  command(): string;
  run: RunCommand;
  /** Writes the audio file and gives back how to remove it. */
  writeTemp(name: string, data: Buffer): Promise<{ path: string; remove(): Promise<void> }>;
  newName(): string;
  log(line: string): void;
}

export const SAMPLE_RATE = 16_000;
export const TIMEOUT_MS = 120_000;
export const MAX_REPLY_CHARS = 4000;

export const wavOf = (pcm: Int16Array): Buffer => Buffer.concat([wavHeader(SAMPLE_RATE, pcm.byteLength), Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);

/**
 * A speech engine of your own: the stretch of speech is written to a WAV file (16 kHz, mono), the command from the settings is started with that
 * file, and what it prints is the text. No shell, a time limit, and the file is removed afterwards. The audio goes only to that program.
 */
export function createCommandNarrator(d: CommandNarratorDeps): Narrator {
  return {
    ready: () => !!splitCommand(d.command()),
    async transcribe(pcm) {
      const argv = splitCommand(d.command());
      if (!argv) throw new Error("no speech command is set");
      const file = await d.writeTemp(`${d.newName()}.wav`, wavOf(pcm));
      try {
        const out = await d.run(argv[0]!, withAudio(argv.slice(1), file.path), TIMEOUT_MS);
        return out.replace(/\s+/g, " ").trim().slice(0, MAX_REPLY_CHARS);
      } finally {
        await file.remove().catch((e: unknown) => d.log(`capture: the temporary audio file was not removed (${String(e)})`));
      }
    },
  };
}

/** The speech model of dictation, or the recognizer of Windows or the command when the speech engines experiment is on and it is chosen. Read at each call, so a change applies to the next capture. */
export function chooseNarrator(engine: () => "dictation" | "windows" | "command", parts: { dictation: Narrator; windows: Narrator; command: Narrator }): Narrator {
  return {
    ready: () => parts[engine()].ready(),
    transcribe: (pcm) => parts[engine()].transcribe(pcm),
  };
}
