import type { ScreenLook } from "@speakkit/protocol";
import { shownFile } from "../edits";
import type { CaptureRecord } from "../store";

/** The longest narration handed to the voice chat; the model reads the rest from the capture page if it matters. */
export const MAX_TEXT = 6000;

export interface Picture {
  base64: string;
  width: number;
  height: number;
}

/** The file that stands for a capture: the contact sheet of a recording, or the (edited) screenshot. */
export const coverFile = (r: Pick<CaptureRecord, "kind" | "media" | "sheet" | "edits">): string | undefined => (r.kind === "screenshot" ? shownFile(r, r.media) : r.sheet);

/** What the voice chat reads: the picture and the words said while recording, marked as a capture so the model does not take it for the live screen. */
export function lookOfCapture(r: Pick<CaptureRecord, "title" | "words" | "context">, pic: Picture): ScreenLook {
  const said = (r.words ?? [])
    .map((w) => w.text)
    .join(" ")
    .slice(0, MAX_TEXT);
  const controls = r.context ? `Controls on screen when the recording ended:\n${r.context}` : "";
  const text = [said, controls].filter(Boolean).join("\n\n");
  return { image: pic.base64, width: pic.width, height: pic.height, text, ocr: text ? "ok" : "empty", target: r.title.slice(0, 120), scope: "capture" };
}
