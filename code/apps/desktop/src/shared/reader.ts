/** What the reader (mini player, tray panel, palette) shares: state shape, commands, and text to sentences. */
export type ReaderStatus = "idle" | "preparing" | "playing" | "paused" | "finished" | "error";
export type ReaderSource = "selection" | "clipboard" | "text";

export interface ReaderState {
  status: ReaderStatus;
  source: ReaderSource | null;
  /** First words of the text, for the panel and the mini player. */
  title: string;
  /** Index of the sentence playing (or preparing) and the count. */
  index: number;
  total: number;
  /** Known audio length of finished sentences plus an estimate for the rest. */
  elapsedMs: number;
  totalMs: number;
  /** The sentence after the current one, for "Next in queue". */
  next: string | null;
  error: string | null;
}

export const IDLE_READER: ReaderState = { status: "idle", source: null, title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, next: null, error: null };

/** Everything the mini player and tray panel can ask for. */
export type ReaderCommand =
  | { type: "toggle" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "replay" }
  | { type: "step"; by: -1 | 1 }
  | { type: "skip"; ms: -10_000 | 10_000 }
  | { type: "keep-on-top"; on: boolean }
  /** From the tray panel: bring the main window forward. */
  | { type: "open-app" };

/** Speaking speed for time estimates when a sentence has no audio yet (characters per second at 1x). */
export const CHARS_PER_SECOND = 15;
export const estimateMs = (text: string, speed: number) => Math.round((text.length / CHARS_PER_SECOND / speed) * 1000);

export const MAX_READ_CHARS = 100_000;
const MAX_SENTENCE = 400;

/** Sentences of a text, each short enough for the server (it takes 2000 characters; long ones break at commas or spaces). */
export function splitSentences(text: string): string[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  const out: string[] = [];
  for (const { segment } of seg.segment(text.slice(0, MAX_READ_CHARS))) {
    let s = segment.replace(/\s+/g, " ").trim();
    while (s.length > MAX_SENTENCE) {
      let cut = s.lastIndexOf(", ", MAX_SENTENCE);
      if (cut < MAX_SENTENCE / 3) cut = s.lastIndexOf(" ", MAX_SENTENCE);
      if (cut <= 0) cut = MAX_SENTENCE;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (/\p{L}|\p{N}/u.test(s)) out.push(s);
  }
  return out;
}

export const titleOf = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
};

/** "1:05" style clock. */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** One line under the title in the mini player and the tray panel. */
export const statusLine = (r: ReaderState): string => {
  switch (r.status) {
    case "preparing":
      return "Preparing the voice...";
    case "playing":
      return `Sentence ${r.index + 1} of ${r.total}`;
    case "paused":
      return `Paused · sentence ${r.index + 1} of ${r.total}`;
    case "finished":
      return "Finished";
    case "error":
      return r.error ?? "Something went wrong";
    default:
      return "";
  }
};
