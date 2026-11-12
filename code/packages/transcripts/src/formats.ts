import type { Failure } from "./types";

export const AUDIO_FORMATS = ["wav", "mp3", "m4a", "flac", "ogg"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** Longest audio taken in; beyond it the whole decoded audio would not fit in memory on a small computer. */
export const MAX_HOURS = 4;
/** Largest file read at all. WAV is read straight from the disk; the other formats are decoded in one piece by the browser engine, so they get a lower ceiling. */
export const MAX_BYTES = 1024 ** 3;
export const MAX_COMPRESSED_BYTES = 200 * 1024 ** 2;

const EXT: Record<string, AudioFormat> = { wav: "wav", wave: "wav", mp3: "mp3", m4a: "m4a", mp4: "m4a", aac: "m4a", flac: "flac", ogg: "ogg", oga: "ogg", opus: "ogg" };

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** What the first bytes say the file is, or undefined. The extension is only a hint: a renamed file is judged by its content. */
export function sniff(head: Uint8Array): AudioFormat | undefined {
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE") return "wav";
  if (head.length >= 4 && ascii(head, 0, 4) === "fLaC") return "flac";
  if (head.length >= 4 && ascii(head, 0, 4) === "OggS") return "ogg";
  if (head.length >= 8 && ascii(head, 4, 4) === "ftyp") return "m4a";
  if (head.length >= 3 && ascii(head, 0, 3) === "ID3") return "mp3";
  if (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return "mp3";
  return undefined;
}

export const FORMAT_LIST = "WAV, MP3, M4A, FLAC and OGG";

export const failures = {
  unsupported: (name: string): Failure => ({ code: "unsupported", message: `${name} is not an audio file Speak Kit can read. These formats work: ${FORMAT_LIST}.` }),
  tooLarge: (name: string): Failure => ({ code: "too-large", message: `${name} is too large to import. Split it into shorter parts and import each one.` }),
  tooLong: (): Failure => ({ code: "too-long", message: `This file is over the ${MAX_HOURS} hour limit. Split it into shorter parts and import each one.` }),
  decode: (name: string): Failure => ({ code: "decode-failed", message: `${name} could not be decoded. The file may be damaged or protected; try exporting it again as WAV or MP3.` }),
  nothingRecorded: (): Failure => ({ code: "decode-failed", message: "Nothing was recorded, so there is nothing to transcribe." }),
  engineMissing: (): Failure => ({ code: "engine-missing", message: "No speech model is installed. Download one in Dictation, then try again." }),
  engineLoading: (): Failure => ({ code: "engine-loading", message: "The speech model is still loading. Try again in a moment." }),
  diskFull: (): Failure => ({ code: "disk-full", message: "The disk is full, so the transcript could not be saved. Free some space and try again." }),
  failed: (): Failure => ({ code: "failed", message: "Transcription stopped because the speech engine failed. Try again." }),
};

export type Check = { ok: true; format: AudioFormat } | { ok: false; failure: Failure };

/** Judges a file before any decoding: its name, size and first bytes. */
export function checkFile(file: { name: string; bytes: number; head: Uint8Array }): Check {
  const format = sniff(file.head);
  if (!format) return { ok: false, failure: failures.unsupported(file.name) };
  if (file.bytes === 0) return { ok: false, failure: failures.decode(file.name) };
  if (file.bytes > MAX_BYTES || (format !== "wav" && file.bytes > MAX_COMPRESSED_BYTES)) return { ok: false, failure: failures.tooLarge(file.name) };
  return { ok: true, format };
}

/** True when the extension is one of the supported ones (for the file chooser's filter). */
export const knownExtension = (name: string): boolean => !!EXT[name.split(".").pop()?.toLowerCase() ?? ""];
