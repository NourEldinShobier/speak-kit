import { checkFile, decodeWavAsync, failures, MAX_HOURS, RATE, type Failure } from "@speakkit/transcripts";
import type { DecoderResult, Picked } from "../../shared/transcripts/contract";

/** What reading a file needs from the outside: the disk, and a page that decodes compressed audio (the browser engine has the codecs). */
export interface FilePorts {
  stat(file: string): Promise<{ size: number } | undefined>;
  head(file: string, bytes: number): Promise<Uint8Array>;
  read(file: string): Promise<Uint8Array>;
  /** Decodes mp3, m4a, flac, ogg and the like to 16 kHz mono; the page answers "decode-failed" for what it cannot read. */
  decodeInPage(bytes: Uint8Array): Promise<DecoderResult>;
  /** Lets other work run between slices of a long conversion. */
  pause(): Promise<void>;
}

export const baseName = (file: string): string => file.split(/[\\/]/).pop() || file;

/** Judges a file by its name, size and first bytes, before anything is decoded. */
export async function inspectFile(file: string, ports: FilePorts): Promise<Picked> {
  const name = baseName(file);
  let info: { size: number } | undefined;
  try {
    info = await ports.stat(file);
  } catch {
    // A file that cannot be examined is judged like a missing one: it cannot be decoded.
    info = undefined;
  }
  if (!info) return { ok: false, name, failure: failures.decode(name) };
  let head: Uint8Array;
  try {
    head = await ports.head(file, 16);
  } catch {
    // Without its first bytes the content cannot be recognised, so the file counts as unsupported.
    head = new Uint8Array(0);
  }
  const check = checkFile({ name, bytes: info.size, head });
  return check.ok ? { ok: true, path: file, name, bytes: info.size } : { ok: false, name, failure: check.failure };
}

export type Decoded = { ok: true; name: string; pcm: Int16Array } | { ok: false; failure: Failure };

/**
 * An audio file as 16 kHz mono samples. WAV is converted here in slices; every other format goes through the decoder page. Audio longer than the limit
 * is refused after decoding, as the length is only known then.
 */
export async function decodeFile(file: string, ports: FilePorts): Promise<Decoded> {
  const picked = await inspectFile(file, ports);
  if (!picked.ok) return { ok: false, failure: picked.failure };
  const { name } = picked;
  let bytes: Uint8Array;
  try {
    bytes = await ports.read(file);
  } catch {
    return { ok: false, failure: failures.decode(name) };
  }
  let pcm: Int16Array;
  try {
    if (new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF") pcm = await decodeWavAsync(bytes, ports.pause);
    else {
      const r = await ports.decodeInPage(bytes);
      if (!r.ok) return { ok: false, failure: r.code === "too-long" ? failures.tooLong() : failures.decode(name) };
      pcm = r.pcm;
    }
  } catch {
    return { ok: false, failure: failures.decode(name) };
  }
  if (pcm.length / RATE > MAX_HOURS * 3600) return { ok: false, failure: failures.tooLong() };
  if (pcm.length === 0) return { ok: false, failure: failures.decode(name) };
  return { ok: true, name, pcm };
}
