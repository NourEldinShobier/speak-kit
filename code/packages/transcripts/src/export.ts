import type { Entry, Segment } from "./types";

export const FORMATS = ["txt", "md", "srt", "vtt", "json"] as const;
export type Format = (typeof FORMATS)[number];

type Doc = Pick<Entry, "title" | "createdAt" | "durationSec" | "language" | "model" | "source" | "sourceName"> & { segments: readonly Segment[] };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 83 -> "1:23", 3723 -> "1:02:03". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function stamp(sec: number, sep: "," | "."): string {
  const ms = Math.round(Math.max(0, sec) * 1000);
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
}

/** A segment longer than this is cut into sentence cues, so subtitles stay readable. */
const MAX_CUE_SEC = 7;
const MAX_CUE_CHARS = 84;

/** Subtitle cues: one per segment, or per sentence group when the segment is long; times are shared out by length. Cues never overlap. */
export function cues(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const text = s.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const span = Math.max(0, s.end - s.start);
    if (span <= MAX_CUE_SEC && text.length <= MAX_CUE_CHARS) {
      out.push({ start: s.start, end: Math.max(s.end, s.start + 0.5), text });
      continue;
    }
    const parts = (text.match(/[^.!?؟]+[.!?؟]*\s*/g) ?? [text]).map((p) => p.trim()).filter(Boolean);
    const groups: string[] = [];
    for (const p of parts) {
      const last = groups.at(-1);
      if (last !== undefined && last.length + p.length < 42) groups[groups.length - 1] = `${last} ${p}`;
      else groups.push(p);
    }
    const total = groups.reduce((n, g) => n + g.length, 0);
    let at = s.start;
    for (const g of groups) {
      const end = at + (span * g.length) / total;
      out.push({ start: at, end: Math.max(end, at + 0.5), text: g });
      at = end;
    }
  }
  // A cue pushed to half a second must not run into the next one.
  for (let i = 0; i + 1 < out.length; i++) if (out[i]!.end > out[i + 1]!.start) out[i]!.end = Math.max(out[i]!.start + 0.01, out[i + 1]!.start);
  return out;
}

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

/** The transcript as a file's text. Plain text and Markdown carry a time before every paragraph; SRT and VTT are cues; JSON is the whole record. */
export function render(format: Format, d: Doc): string {
  switch (format) {
    case "txt":
      return `${d.title}\n${when(d.createdAt)}\n\n${d.segments.map((s) => `[${clock(s.start)}] ${s.text.trim()}`).join("\n")}\n`;
    case "md":
      return [
        `# ${d.title}`,
        "",
        `- Date: ${when(d.createdAt)}`,
        `- Length: ${clock(d.durationSec)}`,
        `- Language: ${d.language}`,
        `- Source: ${d.source === "file" ? (d.sourceName ?? "audio file") : "microphone"}`,
        "",
        ...d.segments.flatMap((s) => [`**${clock(s.start)}** ${s.text.trim()}`, ""]),
      ].join("\n");
    case "srt":
      return cues(d.segments)
        .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`)
        .join("\n");
    case "vtt":
      return `WEBVTT\n\n${cues(d.segments)
        .map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text.replace(/-->/g, "->")}\n`)
        .join("\n")}`;
    case "json":
      return `${JSON.stringify({ title: d.title, createdAt: d.createdAt, durationSec: d.durationSec, language: d.language, model: d.model, source: d.source, segments: d.segments }, null, 2)}\n`;
  }
}

/** The words only, one paragraph per segment: what Copy puts on the clipboard. */
export const plainText = (segments: readonly Segment[]): string =>
  segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
