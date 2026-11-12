import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_AUDIO_BYTES, planEviction, type AudioStore, type Clip } from "@speakkit/dictation";
import { parseWav, wavHeader } from "@speakkit/engine";

export interface AudioStoreOptions {
  dir: string;
  /** Moves a file to the Recycle Bin (Trash on macOS); false when the system refused. */
  trash(file: string): Promise<boolean>;
  /** Called with the recordings removed to make room, so the history can forget them. */
  onEvicted(files: string[]): void;
  limitBytes?: number;
}

const safe = (id: string): string => id.replace(/[^\w.-]/g, "_");

export function encodeWav(clip: Clip): Buffer {
  const pcm = Buffer.alloc(clip.pcm.length * 2);
  for (let i = 0; i < clip.pcm.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, clip.pcm[i]!)) * 32767), i * 2);
  return Buffer.concat([wavHeader(clip.sampleRate, pcm.length), pcm]);
}

/** Recordings as 16-bit WAV files in one folder, capped in size: the oldest go first, and the history is told which. */
export function createAudioStore(o: AudioStoreOptions): AudioStore {
  const limit = o.limitBytes ?? MAX_AUDIO_BYTES;
  const inside = (file: string): string => path.join(o.dir, path.basename(file)); // a name from the history can never leave the folder
  return {
    async save(id, clip) {
      try {
        await mkdir(o.dir, { recursive: true });
        const bytes = encodeWav(clip);
        if (bytes.length > limit) return undefined; // one recording larger than the whole limit is not kept
        const names = (await readdir(o.dir)).filter((n) => n.endsWith(".wav"));
        const files = await Promise.all(
          names.map(async (file) => {
            const st = await stat(path.join(o.dir, file));
            return { file, bytes: st.size, at: st.mtimeMs };
          }),
        );
        const evict = planEviction(files, limit, bytes.length);
        const name = `${safe(id)}.wav`;
        const part = `${inside(name)}.part`;
        await writeFile(part, bytes);
        await rename(part, inside(name));
        const gone: string[] = [];
        for (const f of evict) if (await o.trash(inside(f))) gone.push(f);
        if (gone.length) o.onEvicted(gone);
        return name;
      } catch {
        return undefined;
      }
    },
    async load(file) {
      try {
        const w = parseWav(await readFile(inside(file)));
        return { pcm: w.samples, sampleRate: w.sampleRate, peak: w.samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0) };
      } catch {
        return undefined;
      }
    },
    trash: (file) => o.trash(inside(file)).catch(() => false),
  };
}
