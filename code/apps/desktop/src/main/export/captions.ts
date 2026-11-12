/** Captions and chapter markers for an exported reading. Pure: times and text in, file contents out. */

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface Chapter {
  title: string;
  startMs: number;
  endMs: number;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

function stamp(ms: number, sep: "," | "."): string {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)}${sep}${pad(t % 1000, 3)}`;
}

/** A cue must last at least a moment and never run into the next one. */
function cleaned(cues: readonly Cue[]): Cue[] {
  return cues
    .filter((c) => c.text.trim())
    .map((c, i, all) => {
      const next = all.slice(i + 1).find((n) => n.text.trim());
      const end = Math.max(c.endMs, c.startMs + 200);
      return { ...c, text: c.text.replace(/\s+/g, " ").trim(), endMs: next ? Math.min(end, Math.max(next.startMs, c.startMs + 1)) : end };
    });
}

export function toSrt(cues: readonly Cue[]): string {
  return cleaned(cues)
    .map((c, i) => `${i + 1}\n${stamp(c.startMs, ",")} --> ${stamp(c.endMs, ",")}\n${c.text}\n`)
    .join("\n");
}

export function toVtt(cues: readonly Cue[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `WEBVTT\n\n${cleaned(cues)
    .map((c) => `${stamp(c.startMs, ".")} --> ${stamp(c.endMs, ".")}\n${esc(c.text)}\n`)
    .join("\n")}`;
}

const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gm;

/** Markdown headings of the text. */
export const headingsOf = (text: string): string[] => [...text.matchAll(HEADING)].map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);

/**
 * One chapter per heading, starting where the sentence that holds the heading starts. A heading with no sentence found (cut off by the length limit) gives no chapter.
 * `sentences` are the cues in order; the chapter ends where the next one starts, the last at the end of the audio.
 */
export function chaptersOf(text: string, cues: readonly Cue[], totalMs: number): Chapter[] {
  const starts: { title: string; startMs: number }[] = [];
  let from = 0;
  for (const title of headingsOf(text)) {
    const i = cues.findIndex((c, k) => k >= from && c.text.includes(title));
    if (i < 0) continue;
    starts.push({ title, startMs: cues[i]!.startMs });
    from = i + 1;
  }
  return starts.map((c, i) => ({ ...c, endMs: starts[i + 1]?.startMs ?? totalMs }));
}

const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const syncsafe = (n: number): Buffer => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);

function frame(id: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id, "latin1"), u32(body.length), Buffer.from([0, 0]), body]);
}

const text16 = (s: string): Buffer => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, "utf16le"), Buffer.from([0, 0])]);

/** An ID3v2.3 tag with a table of contents and one CHAP frame per chapter: players that know chapters (Apple Podcasts, VLC, Audiobookshelf) show them. */
export function id3Chapters(chapters: readonly Chapter[]): Buffer {
  if (!chapters.length) return Buffer.alloc(0);
  const ids = chapters.map((_, i) => `chp${i}`);
  const toc = frame("CTOC", Buffer.concat([Buffer.from("toc\0", "latin1"), Buffer.from([0x03, ids.length]), ...ids.map((id) => Buffer.from(`${id}\0`, "latin1"))]));
  const chaps = chapters.map((c, i) =>
    frame("CHAP", Buffer.concat([Buffer.from(`${ids[i]}\0`, "latin1"), u32(Math.round(c.startMs)), u32(Math.round(c.endMs)), u32(0xffffffff), u32(0xffffffff), frame("TIT2", text16(c.title))])),
  );
  const body = Buffer.concat([toc, ...chaps]);
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([3, 0, 0]), syncsafe(body.length), body]);
}

/** The MP3 with the chapter tag in front. An MP3 that already starts with a tag is returned unchanged: the encoder never writes one, and a second tag would hide the first. */
export function withChapters(mp3: Uint8Array, chapters: readonly Chapter[]): Uint8Array {
  if (!chapters.length || (mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33)) return mp3;
  return Buffer.concat([id3Chapters(chapters), mp3]);
}
