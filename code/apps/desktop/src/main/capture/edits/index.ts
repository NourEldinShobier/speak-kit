import type { CaptureRecord } from "../store";

/** Pictures of a capture that can be edited: the screenshot, or the frames of a recording. */
export const editableFiles = (r: Pick<CaptureRecord, "kind" | "media"> & { frames: readonly string[] }): readonly string[] => (r.kind === "screenshot" ? [r.media] : r.frames);

/** The name an edited copy of `file` is saved under, in the capture folder itself (the frames of a recording live in a subfolder). */
export const editedName = (file: string): string => `edit-${file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "")}.png`;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const isPng = (b: Uint8Array): boolean => b.length > PNG.length && PNG.every((n, i) => b[i] === n);

/** The file to show or copy for a picture: its edit when it has one. */
export const shownFile = (r: Pick<CaptureRecord, "edits">, file: string): string => r.edits?.[file] ?? file;

type Subject = Pick<CaptureRecord, "kind" | "media" | "finishing"> & { frames: readonly string[] };

/** Whether `file` of this capture can be opened for editing. */
export const canEditFile = (r: Subject | undefined, file: string): r is Subject => !!r && !r.finishing && editableFiles(r).includes(file);

/** Why an edit is refused, or undefined when it is fine. */
export function refuseEdit(r: Subject | undefined, file: string, png: Uint8Array): "gone" | "not-editable" | "not-png" | undefined {
  if (!r || r.finishing) return "gone";
  if (!editableFiles(r).includes(file)) return "not-editable";
  return isPng(png) ? undefined : "not-png";
}
