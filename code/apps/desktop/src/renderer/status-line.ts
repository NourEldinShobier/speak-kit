import type { ReaderState } from "../shared/reader";
import { errorText } from "./error-text";

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
      return r.error ? errorText(r.error) : "Something went wrong";
    default:
      return "";
  }
};
